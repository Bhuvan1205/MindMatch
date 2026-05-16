import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

from langchain_openai import ChatOpenAI
import json

interview_questions = {

    # =====================================================
    # INTRO / WARM-UP
    # =====================================================

    "Intro": ["Hey! Before we get into anything deeper, what should I call you?",

    "Nice to meet you. What’s been taking up most of your attention lately?",

    "Would you say you’re currently more focused on learning, building, exploring, working, or just figuring things out?"],


    # =====================================================
    # INTERESTS & CURIOSITY
    # =====================================================

    "INTERESTS & CURIOSITY": ["Thinking about what you've been focusing on lately, what is it about that specific area that genuinely interests you the most?",

    "What kind of topics or ideas do you naturally keep coming back to even without anyone asking you to?",

    "What’s something you could easily spend hours exploring or discussing without getting bored?",

    "Have you ever gone down a deep rabbit hole learning something just because it fascinated you?"],


    # =====================================================
    # GOALS & DIRECTION
    # =====================================================

    "GOALS & DIRECTION" : ["If you had complete freedom for the next few years, what kind of things would you genuinely want to work on or become good at?",

    "What’s something you’re currently trying to improve or figure out in your life?",

    "Do you usually think more about short-term goals or long-term direction?"],


    # =====================================================
    # LEARNING STYLE
    # =====================================================

    "LEARNING STYLE" : ["When you want to learn something difficult, what’s usually your first step?",

    "Do you learn better by building, experimenting, reading, watching, or discussing with people?",

    "What’s the last thing you seriously tried teaching yourself?",

    "When learning something new, do you prefer understanding concepts deeply first or figuring things out while doing?"],


    # =====================================================
    # EXECUTION & PRODUCTIVITY
    # =====================================================

    "EXECUTION & PRODUCTIVITY" : ["When you get excited about an idea, what usually happens next?",

    "Do you usually start quickly or spend a lot of time planning first?",

    "What usually slows you down or frustrates you while working on something important?",

    "Do you think you’re more consistent or more intense in short bursts?"],


    # =====================================================
    # COLLABORATION & SOCIAL STYLE
    # =====================================================

    "COLLABORATION & SOCIAL STYLE" : ["What kind of people do you genuinely enjoy talking or working with?",

    "What kind of conversations usually drain you quickly?",

    "Do you prefer deep one-on-one discussions, smaller groups, or larger social environments?",

    "When working with others, what usually matters more to you — similar thinking, similar ambition, or similar personality?"],


    # =====================================================
    # PROBLEM-SOLVING & SELF-AWARENESS
    # =====================================================

    "PROBLEM-SOLVING & SELF-AWARENESS" : ["Tell me about a difficult problem you solved recently.",

    "When things become uncertain or chaotic, what’s usually your natural reaction?",

    "What’s a setback or failure that changed the way you think?",

    "What’s something people usually misunderstand about you?",

    "What’s something you’ve realized about yourself over the last few years?"],


    # =====================================================
    # CLOSING QUESTIONS
    # =====================================================

    "CLOSING QUESTIONS" : ["What kind of people or conversations do you think bring out the best version of you?",

    "If MindMatch connected you with the perfect intellectual companion, what would that person probably be like?"]
}

interview_model=ChatOpenAI(model='gpt-4.1-mini')

# =========================================================
# ONBOARDING INTERVIEW FUNCTION
# =========================================================

def onboarding_interview():

    chat_history = {}

    print(
        "Agent: Welcome to Mind Match. Let’s start with a brief interview "
        "to understand your perspective and connect you with the right people. "
        "Let me know if you're ready!"
    )

    user_reply = input("You: ").lower().strip()

    if user_reply in ['no', 'nah', 'exit', 'bye', '', ' ']:
        return "Interview Abandoned"

    # =====================================================
    # LOOP THROUGH QUESTION CATEGORIES
    # =====================================================

    for questions in interview_questions.values():

        for question in questions:

            retry_count = 0

            while retry_count < 3:

                print(f"\nAgent: {question}")

                user_resp = input("You: ").lower().strip()

                # =========================================
                # VALIDATION PROMPT
                # =========================================

                messages = [
                    {
                        "role": "system",
                        "content": """
You are an interview response validator.

Your job is to evaluate whether the user's response meaningfully answers the given interview question.

You must classify the response into ONE of these categories:

1. VALID
- The answer reasonably addresses the question.
- Short answers are allowed.
- Ignore grammar mistakes, spelling mistakes, and weak vocabulary.
- Do NOT expect perfect English.

2. CLARIFY
- The user seems confused about the question.
- The user explicitly asks what the question means.
- The user partially misunderstands the question.

3. RETRY
- The response is completely unrelated.
- The response is meaningless or nonsensical.
- The answer does not attempt to answer the question at all.

RULES:
- Be lenient.
- Accept imperfect answers.
- Do NOT over-reject responses.
- Very short but meaningful answers are acceptable.
- Only flag responses that are genuinely unusable.

OUTPUT FORMAT:

If VALID:
{
  "status": "VALID"
}

If CLARIFY:
{
  "status": "CLARIFY",
  "message": "<simplified explanation or simpler version of the question>"
}

If RETRY:
{
  "status": "RETRY",
  "message": "<re-ask the same question naturally>"
}

Return ONLY valid JSON.
"""
                    },

                    {
                        "role": "user",
                        "content": f"""
Question:
{question}

User Response:
{user_resp}
"""
                    }
                ]

                # =========================================
                # MODEL INVOCATION
                # =========================================

                try:
                    agent_response = interview_model.invoke(messages)

                    response_data = json.loads(agent_response.content)

                except Exception as e:

                    print("\nAgent: Something went wrong while validating your response. Let's try again.")
                    retry_count += 1
                    continue

                # =========================================
                # HANDLE VALID RESPONSE
                # =========================================

                if response_data["status"] == "VALID":

                    chat_history[question] = user_resp
                    break

                # =========================================
                # HANDLE CLARIFICATION
                # =========================================

                elif response_data["status"] == "CLARIFY":

                    print(f"\nAgent: {response_data['message']}")

                # =========================================
                # HANDLE RETRY
                # =========================================

                elif response_data["status"] == "RETRY":

                    print(f"\nAgent: {response_data['message']}")

                retry_count += 1

            # =================================================
            # FALLBACK AFTER 3 FAILED ATTEMPTS
            # =================================================

            if retry_count == 3:

                print("\nAgent: No worries, let's move on to the next question.")

                chat_history[question] = user_resp

    # =====================================================
    # RETURN FINAL INTERVIEW DATA
    # =====================================================

    return chat_history


# =========================================================
# HTTP-COMPATIBLE VALIDATION HELPER
# Called by the FastAPI backend — onboarding_interview() is NOT modified
# =========================================================

def validate_response(question: str, user_resp: str, next_question: str = None) -> dict:
    """
    Runs the same LLM validation used inside onboarding_interview().
    Returns a dict: {"status": "VALID", "next_question": "..."} | {"status": "CLARIFY/RETRY", "message": "..."}
    Raises on LLM / JSON failure so the caller can handle retries.
    """

    messages = [
        {
            "role": "system",
            "content": """
You are an interview response validator and conversational guide.

Your job is to evaluate whether the user's response meaningfully answers the given interview question.

You must classify the response into ONE of these categories:

1. VALID
- The answer reasonably addresses the question.
- Short answers are allowed.
- Ignore grammar mistakes, spelling mistakes, and weak vocabulary.
- Do NOT expect perfect English.

2. CLARIFY
- The user seems confused about the question.
- The user explicitly asks what the question means.
- The user partially misunderstands the question.

3. RETRY
- The response is completely unrelated.
- The response is meaningless or nonsensical.
- The answer does not attempt to answer the question at all.

RULES:
- Be lenient.
- Accept imperfect answers.
- Do NOT over-reject responses.
- Very short but meaningful answers are acceptable.
- Only flag responses that are genuinely unusable.

OUTPUT FORMAT:

If VALID:
{
  "status": "VALID",
  "next_question": "<If a Next Question is provided in the prompt, rewrite it to include a natural, empathetic, and highly conversational transition acknowledging the user's response. Make it feel like a flowing conversation rather than a rigid Q&A. Do NOT change the core meaning of the Next Question. If no Next Question is provided, omit this field.>"
}

If CLARIFY:
{
  "status": "CLARIFY",
  "message": "<simplified explanation or simpler version of the question>"
}

If RETRY:
{
  "status": "RETRY",
  "message": "<re-ask the same question naturally>"
}

Return ONLY valid JSON.
"""
        },

        {
            "role": "user",
            "content": f"""
Question:
{question}

User Response:
{user_resp}

Next Question to format (if applicable):
{next_question if next_question else 'None'}
"""
        }
    ]

    agent_response = interview_model.invoke(messages)
    return json.loads(agent_response.content)
