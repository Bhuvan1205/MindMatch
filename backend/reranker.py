"""
reranker.py
===========
Two-stage pipeline that runs after the Pinecone vector similarity search:

Stage 1 — Profile Retrieval (fetch_candidate_profiles)
    Pulls full UserProfile records from PostgreSQL for the top-K candidate
    UUIDs returned by Pinecone.  Returns a dict keyed by name, mirroring
    the structure used in the notebook.

Stage 2 — LLM Reranking + Explicit Filter (rerank_candidates)
    Sends the query user's profile and all candidate profiles to the LLM
    reranking engine.  The LLM scores each candidate holistically (0-100)
    and may exclude weak or forced matches entirely — making this both a
    reranker and an explicit filter in one pass.

    Scoring bands:
        85-100  → highly compatible
        70-84   → strong compatibility
        55-69   → moderate compatibility
        <55     → weak — excluded from output

Output shape (returned to the /perform_similarity endpoint):
    {
        "query_user": "<name>",
        "ranked_matches": [
            {
                "user":   "<candidate_name>",
                "score":  <int 0-100>,
                "reason": "<short explanation>",
                "profile": { ...full UserProfile fields... }
            }
        ]
    }
"""

from __future__ import annotations

import json
import logging
import os
import re

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session

from models import UserProfile

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

logger = logging.getLogger(__name__)


def _clean_json(raw: str) -> str:
    """Strip markdown code fences GPT sometimes wraps around JSON output."""
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())
    return cleaned.strip()


# ── Reranker uses the same model family as the profile extractor ──
_reranker_model = ChatOpenAI(model="gpt-4.1-mini", temperature=0)


# =========================================================
# HELPER — serialise a UserProfile ORM row to a plain dict
# =========================================================

def _profile_to_dict(record: UserProfile) -> dict:
    """Return a JSON-serialisable dict of the 6 profile category fields."""
    return {
        "profile_id":                 str(record.id),
        "user_id":                    str(record.user_id) if record.user_id else None,
        "name":                      record.name,
        "interests":                 record.interests or [],
        "goals":                     record.goals or [],
        "learning_preferences":      record.learning_preferences or [],
        "collaboration_preferences": record.collaboration_preferences or [],
        "execution_patterns":        record.execution_patterns or [],
        "discussion_topics":         record.discussion_topics or [],
    }


# =========================================================
# STAGE 1 — PROFILE RETRIEVAL FROM POSTGRESQL
# =========================================================

def fetch_candidate_profiles(
    user_ids: list[str],
    db: Session,
) -> dict[str, dict]:
    """
    Retrieve full UserProfile records from PostgreSQL for the given UUIDs.

    Parameters
    ----------
    user_ids : list[str]
        PostgreSQL profile UUID strings (== Pinecone record IDs).
    db : Session
        Active SQLAlchemy session (injected by FastAPI's Depends(get_db)).

    Returns
    -------
    dict[str, dict]
        Mapping of  name → profile_dict  for every successfully retrieved
        profile.  UUIDs that cannot be found in PostgreSQL are skipped with
        a warning (graceful degradation).
    """
    if not user_ids:
        return {}

    records: list[UserProfile] = (
        db.query(UserProfile)
        .filter(UserProfile.id.in_(user_ids))
        .all()
    )

    found_ids = {str(r.id) for r in records}
    missing   = set(user_ids) - found_ids
    if missing:
        logger.warning(
            "fetch_candidate_profiles: %d UUID(s) not found in PostgreSQL: %s",
            len(missing),
            missing,
        )

    candidate_profiles: dict[str, dict] = {}
    for record in records:
        key = record.name or str(record.id)
        candidate_profiles[key] = _profile_to_dict(record)

    logger.info(
        "fetch_candidate_profiles: retrieved %d / %d profiles.",
        len(candidate_profiles),
        len(user_ids),
    )
    return candidate_profiles


# =========================================================
# STAGE 2 — LLM RERANKING + EXPLICIT FILTER
# =========================================================

_SYSTEM_PROMPT = """You are a semantic compatibility reranking engine.

Your task is to evaluate and rerank candidate users for compatibility with a query user.

Each profile contains these ordered categories:

1. interests
2. goals
3. learning_preferences
4. collaboration_preferences
5. execution_patterns
6. discussion_topics

Evaluate users holistically using:

* intellectual alignment
* ambition compatibility
* learning compatibility
* collaboration compatibility
* execution compatibility
* conversational compatibility

Important evaluation rules:

* prioritize semantic similarity over exact keyword overlap
* detect behavioral mismatches even when interests overlap
* value aligned ambitions, learning styles, and execution tendencies
* penalize conflicting collaboration or execution styles
* prefer holistic compatibility over isolated category similarity
* avoid forcing matches when compatibility is weak
* if a candidate is not meaningfully compatible, exclude them entirely
* it is acceptable to return fewer matches than the number of provided candidates
* strong topical overlap alone is insufficient for a high score

Scoring guidance:

* 85-100 → highly compatible
* 70-84 → strong compatibility
* 55-69 → weak compatibility, usually exclude

Output STRICTLY in this JSON format:

{
  "query_user": "<query_user_name>",
  "ranked_matches": [
    {
      "user": "<candidate_name>",
      "score": <0-100>,
      "reason": "<short compatibility explanation>"
    }
  ]
}

Rules:

* return only valid JSON
* no markdown
* no extra commentary
* do not hallucinate traits
* rerank from most compatible to least compatible
* scores must meaningfully differentiate candidates
* exclude weak or forced matches from the final output
"""


def rerank_candidates(
    query_profile: dict,
    candidate_profiles: dict[str, dict],
) -> dict:
    """
    Send the query user and all candidate profiles to the LLM reranking
    engine and return the parsed JSON output enriched with full profile dicts.

    Parameters
    ----------
    query_profile : dict
        The query user's full profile dict (name + 6 category fields).
    candidate_profiles : dict[str, dict]
        Mapping of  name → profile_dict  produced by fetch_candidate_profiles.

    Returns
    -------
    dict with shape:
        {
            "query_user": "<name>",
            "ranked_matches": [
                {
                    "user":    "<candidate_name>",
                    "score":   <int>,
                    "reason":  "<explanation>",
                    "profile": { ...full profile dict... }
                }
            ]
        }

    Raises
    ------
    ValueError
        If the LLM returns a response that cannot be parsed as valid JSON.
    """
    if not candidate_profiles:
        query_name = query_profile.get("name", "Unknown")
        logger.warning("rerank_candidates: no candidates to rerank for '%s'.", query_name)
        return {"query_user": query_name, "ranked_matches": []}

    user_prompt = (
        f"Query User:\n{json.dumps(query_profile, indent=2)}\n\n"
        f"Candidate Users:\n{json.dumps(candidate_profiles, indent=2)}\n\n"
        "Rerank the candidate users for compatibility with the query user based "
        "on the provided profile categories.\n\n"
        "Return the final ranked matches with:\n\n"
        "* compatibility score (0-100)\n"
        "* concise reasoning\n\n"
        "Return STRICTLY valid JSON only."
    )

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user",   "content": user_prompt},
    ]

    response = _reranker_model.invoke(messages)

    try:
        llm_output: dict = json.loads(_clean_json(response.content))
    except json.JSONDecodeError as exc:
        logger.error(
            "rerank_candidates: LLM returned non-JSON output.\nRaw: %s",
            response.content,
        )
        raise ValueError(
            f"Reranker LLM returned invalid JSON: {exc}"
        ) from exc

    # ── Enrich each ranked match with the full profile dict ──────────────
    ranked_matches = llm_output.get("ranked_matches", [])
    enriched_matches = []

    for match in ranked_matches:
        candidate_name = match.get("user", "")
        full_profile   = candidate_profiles.get(candidate_name, {})
        enriched_matches.append({
            **match,
            "profile": full_profile,
        })

    logger.info(
        "rerank_candidates: '%s' → %d matches returned (from %d candidates).",
        llm_output.get("query_user", "?"),
        len(enriched_matches),
        len(candidate_profiles),
    )

    return {
        "query_user":    llm_output.get("query_user", query_profile.get("name")),
        "ranked_matches": enriched_matches,
    }
