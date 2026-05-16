import { create } from "zustand";

import type { ChatHistory, StartInterviewResponse } from "@/lib/api/types";

type InterviewClientState = {
  sessionId: string | null;
  currentQuestion: string | null;
  questionIndex: number;
  totalQuestions: number;
  chatHistory: ChatHistory | null;
  lastAgentMessage: string | null;
  setStarted: (payload: StartInterviewResponse) => void;
  setQuestion: (payload: {
    question: string | null;
    questionIndex: number | null;
    totalQuestions: number;
    message?: string | null;
  }) => void;
  setCompleted: (chatHistory: ChatHistory) => void;
  resetInterview: () => void;
};

const initialState = {
  sessionId: null,
  currentQuestion: null,
  questionIndex: 0,
  totalQuestions: 0,
  chatHistory: null,
  lastAgentMessage: null,
};

export const useInterviewStore = create<InterviewClientState>((set) => ({
  ...initialState,
  setStarted: (payload) =>
    set({
      sessionId: payload.session_id,
      currentQuestion: payload.question,
      questionIndex: payload.question_index,
      totalQuestions: payload.total_questions,
      chatHistory: null,
      lastAgentMessage: null,
    }),
  setQuestion: (payload) =>
    set((state) => ({
      currentQuestion: payload.question,
      questionIndex: payload.questionIndex ?? state.questionIndex,
      totalQuestions: payload.totalQuestions,
      lastAgentMessage: payload.message ?? null,
    })),
  setCompleted: (chatHistory) =>
    set({
      currentQuestion: null,
      questionIndex: 0,
      chatHistory,
      lastAgentMessage: "Interview complete! Thank you.",
    }),
  resetInterview: () => set(initialState),
}));
