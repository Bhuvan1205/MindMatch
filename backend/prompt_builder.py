"""
prompt_builder.py
=================
Constructs the full LLM message list for the chat feature by layering
independent context sources in a strict, token-efficient order.

Separation of concerns:
    - System behavioral instructions  (static, never injected with data)
    - User profile context             (static per request)
    - Retrieved episodic memories      (top-k only, semantic retrieval)
    - Active conversation window       (rolling N exchanges, ordered)
    - Current user query               (always the final element)

This module is intentionally stateless and dependency-free from the DB.
All context is passed in as plain Python objects by chat_service.py.
"""

from __future__ import annotations

# ── Static system prompt (verbatim from validated prototype) ──────────────────

_SYSTEM_PROMPT = """
You are the MindMatch companion — a personalized AI assistant designed to support
the user's intellectual growth, goal navigation, and collaborative thinking.

Use the current user's profile and any retrieved context as supportive contextual
signals, not rigid determinants of the response.

CRITICAL INSTRUCTION:
If [Relevant Web Search Results] are provided in the context, you MUST use them 
to answer factual queries, prioritizing these results over your own training data. 
Assume the web search results are the most current and accurate information available.

The live user query should remain the primary driver of reasoning.

Adapt the level of personalization dynamically:
* use stronger personalization when the query relates to goals, behavior,
  collaboration, learning, motivation, or decision-making
* reduce personalization when the query is general, factual, exploratory,
  or broadly educational

Avoid over-anchoring responses to fixed personality traits or repeatedly
restating the user's profile characteristics.

Treat the user profile as contextual guidance rather than a strict identity definition.
    
You are aware of the user's matched connections. Only reference them when the user explicitly asks about their matches, or when it is directly relevant to their question (e.g., when suggesting collaboration or talking about similar people). Never volunteer this information unprompted or repeatedly.
""".strip()


# ── Public API ────────────────────────────────────────────────────────────────

def build_prompt(
    user_profile: dict,
    active_exchanges: list[dict],
    current_query: str,
    retrieved_memories: list[str] | None = None,
    retrieved_similar_profiles: list[dict] | None = None,
    web_context: list[dict] | None = None,
) -> list[dict]:
    """
    Build the full LLM message list for a chat turn.

    Parameters
    ----------
    user_profile : dict
        The authenticated user's CognitiveProfile fields.
    active_exchanges : list[dict]
        Ordered list of {"user_message": ..., "assistant_message": ...} dicts
        from the current rolling session window.
    current_query : str
        The user's current message.
    retrieved_memories : list[str] | None
        Top-k episodic memory summaries retrieved for this query. Optional.
    retrieved_similar_profiles : list[dict] | None
        Top-k similar user profiles from Pinecone. Optional, future use.
    web_context : list[dict] | None
        Optional web search results retrieved by duckduckgo-search.

    Returns
    -------
    list[dict]
        LangChain-compatible message list ready to pass to model.invoke().
    """
    # ── Layer 1: Static system behavior ──────────────────────────────────────
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT}
    ]

    # ── Layer 2: Dynamic runtime context (single user message block) ──────────
    context_parts: list[str] = []

    # 2a — User profile
    if user_profile:
        profile_text = _format_profile(user_profile)
        context_parts.append(f"[Current User Profile]\n{profile_text}")

    # 2b — Matched connections (Concise context)
    if retrieved_similar_profiles:
        matches_text = _format_matches(retrieved_similar_profiles)
        context_parts.append(f"[Your Matched Connections]\n{matches_text}")

    # 2c — Retrieved episodic memories (top-k summaries only)
    if retrieved_memories:
        memories_text = "\n".join(
            f"- {m}" for m in retrieved_memories
        )
        context_parts.append(f"[Relevant Past Memories]\n{memories_text}")

    # 2d — Active conversation window (ordered turns)
    if active_exchanges:
        convo_text = _format_exchanges(active_exchanges)
        context_parts.append(f"[Current Conversation]\n{convo_text}")

    # 2e — Web Search Context
    if web_context:
        web_text = "\n\n".join(
            f"Title: {w.get('title', '')}\nSnippet: {w.get('snippet', '')}\nURL: {w.get('url', '')}"
            for w in web_context
        )
        context_parts.append(
            "================================================\n"
            "CRITICAL: RECENT WEB SEARCH RESULTS\n"
            "================================================\n"
            f"{web_text}\n"
            "================================================\n"
            "-> You MUST base your factual response strictly on the above search results.\n"
            "-> Do not contradict them with your older training data."
        )

    # 2f — Current System Time & Query
    import datetime
    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    context_parts.append(f"[Current System Time]\n{current_time}")
    
    context_parts.append(f"[User Query]\n{current_query}")

    # Assemble all dynamic context into one user message
    messages.append({
        "role": "user",
        "content": "\n\n".join(context_parts)
    })

    return messages


# ── Private helpers ───────────────────────────────────────────────────────────

def _format_profile(profile: dict) -> str:
    """Render a profile dict as a compact multi-line string."""
    lines: list[str] = []
    label_map = {
        "name":                       "Name",
        "interests":                  "Interests",
        "goals":                      "Goals",
        "learning_preferences":       "Learning Style",
        "collaboration_preferences":  "Collaboration",
        "execution_patterns":         "Work Patterns",
        "discussion_topics":          "Discussion Topics",
    }
    for key, label in label_map.items():
        val = profile.get(key)
        if not val:
            continue
        if isinstance(val, list):
            val = ", ".join(val)
        lines.append(f"{label}: {val}")
    return "\n".join(lines)


def _format_exchanges(exchanges: list[dict]) -> str:
    """Render ordered exchanges as a readable dialogue string."""
    lines: list[str] = []
    for ex in exchanges:
        lines.append(f"User: {ex.get('user_message', '')}")
        lines.append(f"Assistant: {ex.get('assistant_message', '')}")
        lines.append("")
    return "\n".join(lines).strip()


def _format_matches(matches: list[dict]) -> str:
    """Render the top-3 matches in a concise bulleted list."""
    lines: list[str] = []
    for m in matches:
        name = m.get("name", "Unknown")
        score = m.get("score", "??")
        reason = m.get("reason", "No reason provided.")
        lines.append(f"• {name} ({score}/100) — {reason}")
    return "\n".join(lines)
