"""
embedding_generator.py
======================
Converts a structured cognitive profile (as returned by profile_extractor.py)
into a set of per-category sentence embeddings using the
`all-MiniLM-L6-v2` SentenceTransformer model.

Design decisions
----------------
* **Singleton model** — the SentenceTransformer is loaded once at module import
  time. Loading it inside the function would cause a full model download / disk
  read on every request, which is unacceptable for production throughput.

* **Stateless, pure function** — `generate_embeddings()` accepts a profile dict
  and returns an embeddings dict. No side-effects, trivially testable and safe
  to call from any async context without a lock (SentenceTransformer inference
  is CPU-bound and thread-safe for read-only forward passes).

* **Category name mapping** — the notebook uses 6 category names that differ
  slightly from the DB field names. The mapping is defined here as a module-
  level constant so it is easy to update in one place.

* **Graceful degradation** — if a category is missing or empty in the profile,
  the corresponding embedding key is simply absent from the returned dict.
  The caller (main.py) decides how to handle this.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

# =========================================================
# MODULE-LEVEL SINGLETON — lazy-loaded
# =========================================================

logger = logging.getLogger(__name__)

_MODEL: Any | None = None

def _get_model() -> Any:
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading SentenceTransformer model (all-MiniLM-L6-v2) …")
        _MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("SentenceTransformer model loaded successfully.")
    return _MODEL


# =========================================================
# CATEGORY MAPPING
# profile_extractor key  →  embedding output key
# (mirrors the category_names list from the notebook)
# =========================================================

CATEGORY_MAP: dict[str, str] = {
    "interests":                  "interests",
    "goals":                      "goals",
    "learning_preferences":       "learning_style",
    "collaboration_preferences":  "social_preferences",
    "execution_patterns":         "work_style",
    "discussion_topics":          "discussion_topics",
}


# =========================================================
# PUBLIC API
# =========================================================

def generate_embeddings(profile: dict[str, Any]) -> dict[str, list[float]]:
    """
    Convert a structured cognitive profile into per-category embeddings.

    Parameters
    ----------
    profile : dict
        A profile dict as returned by `extract_profile()`, containing keys
        such as ``interests``, ``goals``, ``learning_preferences``, etc.
        Each value must be a list of strings (phrases / short sentences).

    Returns
    -------
    dict[str, list[float]]
        A dict mapping each embedding category name (from CATEGORY_MAP) to a
        Python list of floats (384 dimensions for all-MiniLM-L6-v2).
        Categories that are missing or empty in the input are skipped.

    Notes
    -----
    * All phrases in a category are joined with a single space before encoding,
      exactly as in the Jupyter notebook reference implementation.
    * The returned vectors are plain Python lists so they are directly
      JSON-serialisable and compatible with SQLAlchemy JSONB columns.
    """
    embeddings: dict[str, list[float]] = {}
    model = _get_model()

    for profile_key, embedding_key in CATEGORY_MAP.items():
        phrases: list[str] | None = profile.get(profile_key)

        if not phrases:
            # Category absent or empty — skip gracefully
            logger.debug("Skipping empty/missing category: %s", profile_key)
            continue

        # Join all phrases into one string (mirrors notebook logic)
        combined_text: str = " ".join(phrases)

        # Encode → numpy float32 array → Python list for JSON compatibility
        vector: np.ndarray = model.encode(combined_text)
        embeddings[embedding_key] = vector.tolist()

    return embeddings
