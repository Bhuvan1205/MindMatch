import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

from langchain_openai import ChatOpenAI
import json
import logging
import re

logger = logging.getLogger(__name__)


def _clean_json_response(raw: str) -> str:
    """
    Strip markdown code fences that GPT sometimes wraps around JSON:
        ```json ... ```   or   ``` ... ```
    Then strip surrounding whitespace.
    """
    # Remove ```json ... ``` or ``` ... ``` fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())
    return cleaned.strip()

details_extractor_model = ChatOpenAI(model='gpt-4.1-mini')

# =========================================================
# PROFILE EXTRACTION FUNCTION
# =========================================================

def extract_profile(interview_chat: dict) -> dict:
    """
    Takes the completed interview chat_history (question → answer dict)
    and returns a structured cognitive compatibility profile as a dict.
    """

    messages = [
        {
            "role": "system",
            "content": """
You are a structured profile extraction engine for MindMatch.

Your job is to analyze a completed onboarding interview transcript and extract ONLY observable, explicitly supported behavioral and interest-based information.

IMPORTANT:
- Do NOT hallucinate.
- Do NOT infer deep psychology.
- Do NOT diagnose personality.
- Do NOT make assumptions not supported by the conversation.
- Do NOT exaggerate traits.
- Only extract information clearly grounded in the interview responses.

Your goal is to produce a structured cognitive compatibility profile that can later be used for:
- similarity matching,
- embeddings,
- recommendations,
- and AI-assisted interactions.

You must extract ONLY the following categories:

1. interests
- intellectual interests
- recurring domains/topics
- curiosity areas

2. goals
- ambitions
- improvement directions
- long-term aspirations

3. learning_preferences
- how the user prefers learning
- experimentation/theory balance
- practical vs conceptual learning

4. collaboration_preferences
- preferred people
- preferred discussion styles
- social interaction preferences

5. execution_patterns
- observable work tendencies
- planning/building tendencies
- execution blockers
- practical behavioral patterns

6. discussion_topics
- topics the user enjoys discussing deeply

RULES:
- Only use evidence from the transcript.
- Keep outputs concise and grounded.
- Prefer phrases over long explanations.
- Avoid duplicate information.
- Do NOT generate scores.
- Do NOT generate personality labels.
- Do NOT generate emotional analysis.
- Do NOT generate hidden trait assumptions.

OUTPUT FORMAT:
Return ONLY valid JSON.

JSON STRUCTURE:

{
  "name": "",

  "interests": [],

  "goals": [],

  "learning_preferences": [],

  "collaboration_preferences": [],

  "execution_patterns": [],

  "discussion_topics": []
}
"""
        },

        {
            "role": "user",
            "content": f"""
Here is the onboarding interview transcript:

{interview_chat}
"""
        }
    ]

    response = details_extractor_model.invoke(messages)
    raw = response.content

    try:
        return json.loads(_clean_json_response(raw))
    except json.JSONDecodeError as exc:
        logger.error(
            "profile_extractor: JSON parse failed.\nRaw LLM output:\n%s", raw
        )
        raise ValueError(
            f"LLM did not return valid JSON: {exc}. "
            "Raw output logged at ERROR level."
        ) from exc
