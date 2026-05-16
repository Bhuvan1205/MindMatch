// Auth types
export type AuthUser = {
  user_id: string;
  username: string | null;
  email: string | null;
};

export type RegisterRequest = {
  username: string;
  email: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type GoogleAuthRequest = {
  credential: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user_id: string;
  username: string | null;
  email: string | null;
};

// Interview types
export type InterviewStatus = "next" | "done" | "retry" | "clarify";

export type ChatHistory = Record<string, string>;

export type StartInterviewResponse = {
  session_id: string;
  question: string;
  question_index: number;
  total_questions: number;
};

export type RespondInterviewRequest = {
  session_id: string;
  answer: string;
};

export type RespondInterviewResponse = {
  status: InterviewStatus;
  message: string | null;
  question: string | null;
  question_index: number | null;
  total_questions: number;
  chat_history: ChatHistory | null;
};

export type ExtractProfileRequest = {
  chat_history: ChatHistory;
};

export type CognitiveProfile = {
  name: string | null;
  interests: string[];
  goals: string[];
  learning_preferences: string[];
  collaboration_preferences: string[];
  execution_patterns: string[];
  discussion_topics: string[];
};

export type ExtractProfileResponse = CognitiveProfile & {
  profile_id: string;
  created_at: string;
};

export type SimilarityRequest = {
  user_id: string;
};

export type RankedMatch = {
  user: string;
  score: number;
  reason: string;
  profile: CognitiveProfile;
};

export type SimilarityResponse = {
  query_user_id: string;
  query_user: string;
  ranked_matches: RankedMatch[];
};

export type ApiErrorBody = {
  detail?: string;
  message?: string;
};

// Chat types
export type ChatExchange = {
  user_message: string;
  assistant_message: string;
  created_at?: string;
};

export type ChatSendRequest = {
  message: string;
};

export type ChatSendResponse = {
  response: string;
  session_id: string;
};

export type ChatHistoryResponse = {
  session_id: string;
  exchanges: ChatExchange[];
};

export type ChatEndResponse = {
  message: string;
  summary: string | null;
};

