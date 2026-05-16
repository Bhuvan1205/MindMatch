"""
summarization_service.py
========================
Single-responsibility service that compresses an active conversation
window into a 2–4 sentence durable episodic memory string.

The prompt logic is preserved verbatim from the validated prototype.
Only the structure (standalone function, typed input) has changed.
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

if TYPE_CHECKING:
    from models import ConversationExchange

logger = logging.getLogger(__name__)

# ── Singleton LLM — reuses the same model family as the rest of the backend ──
_summarizer_model = ChatOpenAI(model="gpt-4.1")

# ── Prompt (verbatim from validated prototype) ────────────────────────────────
_SUMMARIZER_PROMPT = """
You are a long-term conversational memory extraction engine.

Your task is NOT to summarize the conversation.
Your task is to extract only durable memory that is likely to matter in future conversations.

You will receive a conversation log containing user queries and assistant responses.

Preserve ONLY:
* persistent interests
* long-term goals
* important realizations or mindset shifts
* ongoing struggles or unresolved problems
* stable preferences
* meaningful decisions
* emotionally or intellectually significant insights

Do NOT preserve:
* tutorials
* detailed explanations
* examples
* generic assistant advice
* implementation walkthroughs
* temporary conversational details
* repetitive information
* filler conversation

Focus primarily on the user's evolving thinking, interests, motivations, and recurring
themes — not the assistant's teaching content.

Generate a highly compressed memory in 2–4 concise sentences.

The output should feel like durable episodic memory optimized for future retrieval and
conversational continuity, not a recap or transcript.
"""


def summarize_exchanges(exchanges: list) -> str:
    """
    Compress a list of ConversationExchange ORM objects (or plain dicts)
    into a 2–4 sentence durable episodic memory string.

    Parameters
    ----------
    exchanges : list
        Each item must expose (or be a dict with) ``user_message`` and
        ``assistant_message`` attributes/keys.

    Returns
    -------
    str
        The compressed memory text returned by the LLM.

    Raises
    ------
    ValueError
        If the exchange list is empty.
    """
    if not exchanges:
        raise ValueError("Cannot summarize an empty exchange list.")

    # Format exchanges into a readable transcript
    transcript_lines: list[str] = []
    for i, ex in enumerate(exchanges, 1):
        # Support both ORM objects and plain dicts
        if isinstance(ex, dict):
            user_msg = ex.get("user_message", "")
            asst_msg = ex.get("assistant_message", "")
        else:
            user_msg = ex.user_message
            asst_msg = ex.assistant_message

        transcript_lines.append(f"[Turn {i}]")
        transcript_lines.append(f"User: {user_msg}")
        transcript_lines.append(f"Assistant: {asst_msg}")
        transcript_lines.append("")

    transcript = "\n".join(transcript_lines)

    messages = [
        {"role": "system", "content": _SUMMARIZER_PROMPT},
        {"role": "user", "content": f"Conversation to extract memory from:\n\n{transcript}"},
    ]

    response = _summarizer_model.invoke(messages)
    memory_text: str = response.content.strip()

    logger.info(
        "summarization_service: compressed %d exchanges into %d chars of memory.",
        len(exchanges),
        len(memory_text),
    )

    return memory_text
