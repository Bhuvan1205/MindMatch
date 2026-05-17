import { create } from "zustand";

import type { ChatHistory, StartInterviewResponse } from "@/lib/api/types";

type InterviewClientState = {
  sessionId: string | null;
  currentQuestion: string | null;
  questionIndex: number;
  totalQuestions: number;
  sectionName: string | null;
  sectionIndex: number;
  totalSections: number;
  questionInSection: number;
  totalInSection: number;
  isNewSection: boolean;
  chatHistory: ChatHistory | null;
  lastAgentMessage: string | null;
  setStarted: (payload: StartInterviewResponse) => void;
  setQuestion: (payload: {
    question: string | null;
    questionIndex: number | null;
    totalQuestions: number;
    sectionName: string | null;
    sectionIndex: number | null;
    totalSections: number;
    questionInSection: number | null;
    totalInSection: number | null;
    isNewSection: boolean;
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
  sectionName: null,
  sectionIndex: 0,
  totalSections: 0,
  questionInSection: 0,
  totalInSection: 0,
  isNewSection: false,
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
      sectionName: payload.section_name,
      sectionIndex: payload.section_index,
      totalSections: payload.total_sections,
      questionInSection: payload.question_in_section,
      totalInSection: payload.total_in_section,
      isNewSection: payload.is_new_section,
      chatHistory: null,
      lastAgentMessage: null,
    }),
  setQuestion: (payload) =>
    set((state) => ({
      currentQuestion: payload.question,
      questionIndex: payload.questionIndex ?? state.questionIndex,
      totalQuestions: payload.totalQuestions,
      sectionName: payload.sectionName,
      sectionIndex: payload.sectionIndex ?? state.sectionIndex,
      totalSections: payload.totalSections,
      questionInSection: payload.questionInSection ?? state.questionInSection,
      totalInSection: payload.totalInSection ?? state.totalInSection,
      isNewSection: payload.isNewSection,
      lastAgentMessage: payload.message ?? null,
    })),
  setCompleted: (chatHistory) =>
    set({
      currentQuestion: null,
      questionIndex: 0,
      sectionName: null,
      sectionIndex: 0,
      totalSections: 0,
      questionInSection: 0,
      totalInSection: 0,
      isNewSection: false,
      chatHistory,
      lastAgentMessage: "Interview complete! Thank you.",
    }),
  resetInterview: () => set(initialState),
}));
