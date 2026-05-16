"""
memory_vector_store.py
======================
Handles all ChromaDB interactions for episodic memory summaries.

This is a SEPARATE ChromaDB collection from 'user_profiles'.
Collection: 'episodic_memories'

Document ID convention:
    ChromaDB document ID == PostgreSQL EpisodicMemory.id (UUID string)
    This keeps both stores in sync — same pattern as user_profiles / vector_store.py.

Embedding model:
    Reuses the existing all-MiniLM-L6-v2 singleton from embedding_generator.py.
    No additional model loads.
"""

from __future__ import annotations

from pinecone_client import memory_index
from embedding_generator import _get_model

logger = logging.getLogger(__name__)


# ── Public API ────────────────────────────────────────────────────────────────

def store_memory_embedding(
    memory_id: str,
    user_id: str,
    summary_text: str,
) -> None:
    """
    Encode the memory summary text and upsert it into the episodic_memories
    ChromaDB collection.

    Parameters
    ----------
    memory_id : str
        UUID of the EpisodicMemory PostgreSQL row. Used as the ChromaDB doc ID.
    user_id : str
        UUID of the owning user. Stored in metadata for filtered retrieval.
    summary_text : str
        The compressed 2–4 sentence durable memory to embed.
    """
    model = _get_model()
    vector = model.encode(summary_text).tolist()

    if memory_index is None:
        logger.warning("PINECONE_MEMORY_INDEX_NAME is not set! Skipping memory storage.")
        return
        
    memory_index.upsert([{
        "id": memory_id,
        "values": vector,
        "metadata": {
            "user_id": user_id, 
            "memory_id": memory_id,
            "text": summary_text
        }
    }])

    logger.info(
        "memory_vector_store: stored embedding for memory_id=%s (user=%s)",
        memory_id,
        user_id,
    )


def retrieve_relevant_memories(
    user_id: str,
    query_text: str,
    top_k: int = 3,
) -> list[str]:
    """
    Retrieve the top-k most semantically relevant episodic memory summaries
    for the given user based on the current query.

    Parameters
    ----------
    user_id : str
        Restrict retrieval to this user's memories only.
    query_text : str
        The current user query to embed and search against.
    top_k : int
        Number of memories to return. Default: 3.

    Returns
    -------
    list[str]
        Ordered list of memory summary strings, most relevant first.
        Returns an empty list if no memories exist for the user yet.
    """
    model = _get_model()
    query_vector = model.encode(query_text).tolist()

    if memory_index is None:
        return []

    try:
        results = memory_index.query(
            vector=query_vector,
            top_k=top_k,
            filter={"user_id": user_id},
            include_metadata=True
        )
        
        docs = []
        for match in results.matches:
            if match.metadata and "text" in match.metadata:
                docs.append(match.metadata["text"])
        return docs
    except Exception as e:
        # If no memories exist yet, ChromaDB may raise — degrade gracefully
        logger.warning(
            "memory_vector_store: retrieval failed for user=%s — %s", user_id, e
        )
        return []
