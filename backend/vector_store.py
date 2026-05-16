"""
vector_store.py
===============
Handles all interactions with the ChromaDB vector database.

Vectors from generate_embeddings() are concatenated in a strict,
fixed category order before being stored.  This order is the single
source of truth for the entire matching pipeline — any change to it
would silently corrupt all future similarity queries across all
stored profiles.

Concatenation order (mirrors CATEGORY_MAP in embedding_generator.py):
    interests → goals → learning_style → social_preferences
    → work_style → discussion_topics

Dimension per category : 384  (all-MiniLM-L6-v2)
Total concatenated dim  : 384 × 6 = 2304

The ChromaDB collection is persisted at:
    <project_root>/chroma_db/
which is the same path `./chroma_db` that the notebook uses when
run from the project root, keeping both in sync.

The document ID used in ChromaDB is the PostgreSQL `profile_id` UUID
string so the two stores are always aligned and cross-queryable.
"""

from __future__ import annotations

from pinecone_client import index

logger = logging.getLogger(__name__)

# =========================================================
# CONSTANTS
# =========================================================

# ── CRITICAL: This order defines how the 2304-dim vector is built. ──
# It MUST stay consistent with CATEGORY_MAP in embedding_generator.py.
# Never reorder, add, or remove entries without migrating all stored vectors.
EMBEDDING_ORDER: list[str] = [
    "interests",          # dim   0 –  383
    "goals",              # dim 384 –  767
    "learning_style",     # dim 768 – 1151
    "social_preferences", # dim 1152 – 1535
    "work_style",         # dim 1536 – 1919
    "discussion_topics",  # dim 1920 – 2303
]

EXPECTED_DIM = 384 * len(EMBEDDING_ORDER)   # 2304


# =========================================================
# PUBLIC API
# =========================================================

def store_profile_embedding(
    profile_id: str,
    name: str | None,
    embeddings: dict[str, list[float]],
) -> None:
    """
    Concatenate the 6 per-category vectors and upsert the resulting
    2304-dim vector into ChromaDB.

    Parameters
    ----------
    profile_id : str
        UUID string of the UserProfile record in PostgreSQL.
        Used as the ChromaDB document ID so both stores stay in sync.
    name : str | None
        User's name, stored in ChromaDB metadata for readability.
    embeddings : dict[str, list[float]]
        Output of ``generate_embeddings()``.  Must contain all six
        category keys listed in EMBEDDING_ORDER.

    Raises
    ------
    ValueError
        If none of the expected category vectors are present in
        ``embeddings``, meaning nothing can be stored.

    Notes
    -----
    * Uses ``upsert`` so re-running the pipeline for the same
      ``profile_id`` is safe and idempotent.
    * If a category vector is missing (e.g. the profile had an empty
      field), a warning is logged.  The vector will be shorter than
      2304 dims, which will cause errors at query time — ensure all
      6 categories are populated in the profile before calling this.
    """
    combined: list[float] = []

    for category in EMBEDDING_ORDER:
        vector = embeddings.get(category)

        if vector is None:
            logger.warning(
                "Category '%s' is missing from embeddings for profile '%s'. "
                "The stored vector will have incorrect dimensionality!",
                category,
                profile_id,
            )
            continue

        combined.extend(vector)

    if not combined:
        raise ValueError(
            f"No embedding vectors found for profile '{profile_id}'. "
            "Cannot store an empty vector in ChromaDB."
        )

    index.upsert([{
        "id": profile_id,
        "values": combined,
        "metadata": {
            "profile_id": profile_id,
            "name": name or "Unknown",
        }
    }])

    logger.info(
        "Stored ChromaDB embedding for '%s' (id=%s) — dim: %d / %d",
        name,
        profile_id,
        len(combined),
        EXPECTED_DIM,
    )


# =========================================================
# SIMILARITY SEARCH
# =========================================================

def perform_similarity(user_id: str) -> tuple[list[str], list[float]]:
    """
    Find the most similar users to the given user_id using ChromaDB.

    The function fetches the stored embedding for ``user_id``, queries
    the collection for the top-N nearest neighbours (n_results=11 to
    account for the user themselves always being the closest match),
    and returns the other 10 results as candidates for the reranker.

    Parameters
    ----------
    user_id : str
        The ChromaDB document ID (== PostgreSQL profile UUID) of the
        user whose similar matches we want to find.

    Returns
    -------
    ids : list[str]
        IDs of the 10 most similar users (excluding the query user).
    distances : list[float]
        Corresponding L2 distances for each returned ID.

    Raises
    ------
    ValueError
        If no embedding is found for the given ``user_id``.
    """
    import numpy as np

    # Fetch the query user's own embedding from Pinecone
    fetch_response = index.fetch(ids=[user_id])
    
    if user_id not in fetch_response.vectors:
        raise ValueError(
            f"No embedding found in Pinecone for user_id='{user_id}'. "
            "Ensure the profile has been stored before running similarity search."
        )
        
    user_embeddings = fetch_response.vectors[user_id].values

    # Query for top-N neighbours (top_k=11 so we can drop the self-match
    # and pass the remaining 10 candidates to the reranker)
    results = index.query(
        vector=user_embeddings,
        top_k=11,
        include_metadata=False
    )

    result_ids = []
    result_distances = []
    
    for match in results.matches:
        if match.id == user_id:
            continue
        result_ids.append(match.id)
        # Pinecone returns similarity scores, which we treat as "distances" conceptually
        result_distances.append(match.score)

    # In case the user themselves wasn't returned in the top-k for some reason,
    # just trim to top 10 if we have 11.
    if len(result_ids) > 10:
        result_ids = result_ids[:10]
        result_distances = result_distances[:10]

    logger.info(
        "Similarity search for user '%s' returned %d candidate(s) for reranking.",
        user_id,
        len(result_ids),
    )

    return result_ids, result_distances
