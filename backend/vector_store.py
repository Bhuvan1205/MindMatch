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

import logging
import os

import chromadb

logger = logging.getLogger(__name__)

# =========================================================
# CONSTANTS
# =========================================================

COLLECTION_NAME = "user_profiles"

# Resolves to <project_root>/chroma_db/ regardless of where uvicorn
# is launched from, matching the notebook's ./chroma_db path.
CHROMA_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "chroma_db")
)

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
# SINGLETON CLIENT + COLLECTION
# (initialised once at module import, reused across all requests)
# =========================================================

logger.info("Connecting to ChromaDB at: %s", os.path.abspath(CHROMA_PATH))
_client = chromadb.PersistentClient(path=CHROMA_PATH)
_collection = _client.get_or_create_collection(name=COLLECTION_NAME)
logger.info("ChromaDB collection '%s' is ready.", COLLECTION_NAME)


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

    _collection.upsert(
        ids=[profile_id],
        embeddings=[combined],
        metadatas=[{
            "profile_id": profile_id,
            "name": name or "Unknown",
        }],
    )

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

    # Fetch the query user's own embedding
    user_data = _collection.get(ids=[user_id], include=["embeddings"])
    user_embeddings = user_data["embeddings"]

    if user_embeddings is None or len(user_embeddings) == 0:
        raise ValueError(
            f"No embedding found in ChromaDB for user_id='{user_id}'. "
            "Ensure the profile has been stored before running similarity search."
        )

    # Query for top-N neighbours (n_results=11 so we can drop the self-match
    # and pass the remaining 10 candidates to the reranker)
    similar_users = _collection.query(
        query_embeddings=user_embeddings,
        n_results=11,
    )

    all_ids: list[str] = np.array(similar_users["ids"]).flatten().tolist()
    all_distances: list[float] = np.array(similar_users["distances"]).flatten().tolist()

    # Skip index 0 — the user themselves (always the nearest neighbour)
    result_ids = all_ids[1:]
    result_distances = all_distances[1:]

    logger.info(
        "Similarity search for user '%s' returned %d candidate(s) for reranking.",
        user_id,
        len(result_ids),
    )

    return result_ids, result_distances
