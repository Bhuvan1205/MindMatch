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
  section_name: string;
  section_index: number;
  total_sections: number;
  question_in_section: number;
  total_in_section: number;
  is_new_section: boolean;
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
  section_name: string | null;
  section_index: number | null;
  total_sections: number;
  question_in_section: number | null;
  total_in_section: number | null;
  is_new_section: boolean;
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
  profile: CognitiveProfile & {
    profile_id?: string;
    user_id?: string | null;
  };
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
  messages?: {
    id: string;
    role: "user" | "assistant";
    text: string;
    created_at: string;
    kind?: string;
    relay_id?: string;
    target_name?: string | null;
    question?: string | null;
  }[];
};

export type ChatEndResponse = {
  message: string;
  summary: string | null;
};

// Connections / direct messages
export type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";

export type UserConnection = {
  connection_id: string;
  requester_id: string;
  recipient_id: string;
  requester_profile_id: string | null;
  recipient_profile_id: string | null;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  is_incoming: boolean;
  target_name?: string | null;
};

export type ConnectionRequest = {
  target_profile_id: string;
};

export type ConnectionActionRequest = {
  connection_id: string;
};

export type DirectMessage = {
  message_id: string;
  connection_id?: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  created_at: string;
  read_at?: string | null;
};

export type DirectMessageRequest = {
  connection_id: string;
  message: string;
};

export type DirectMessageThreadResponse = {
  connection: UserConnection;
  messages: DirectMessage[];
};

export type ExperienceAskRequest = {
  target_profile_id: string;
  question: string;
};

export type ExperienceAskResponse = {
  target_user: CognitiveProfile & {
    profile_id?: string;
    user_id?: string | null;
  };
  answer: string;
  context_summary: {
    memory_count: number;
    recent_exchange_count: number;
  };
};

export type NotificationConnectionRequest = {
  connection_id: string;
  requester_id: string;
  requester_name: string | null;
  created_at: string;
};

export type NotificationMessage = {
  message_id: string;
  connection_id: string;
  sender_id: string;
  sender_name: string | null;
  message: string;
  created_at: string;
  read_at: string | null;
};

export type NotificationAcceptedRequest = {
  connection_id: string;
  recipient_id: string;
  recipient_name: string | null;
  accepted_at: string;
};

export type NotificationsResponse = {
  pending_request_count: number;
  unread_message_count: number;
  requests: NotificationConnectionRequest[];
  messages: NotificationMessage[];
  accepted_requests: NotificationAcceptedRequest[];
};

export type MarkNotificationReadRequest = {
  message_id: string;
};

export type MarkNotificationReadResponse = {
  message_id: string;
  read_at: string | null;
};

export type MarkAllNotificationsReadResponse = {
  updated_count: number;
};

export type SearchUserResult = CognitiveProfile & {
  profile_id: string;
  user_id: string;
  created_at: string;
  connection?: UserConnection | null;
};

export type SearchUsersResponse = {
  query: string;
  results: SearchUserResult[];
};
