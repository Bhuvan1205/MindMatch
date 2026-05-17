import { apiRequest } from "@/lib/api/client";
import type {
  AuthResponse,
  ExtractProfileRequest,
  ExtractProfileResponse,
  GoogleAuthRequest,
  LoginRequest,
  RegisterRequest,
  RespondInterviewRequest,
  RespondInterviewResponse,
  SimilarityRequest,
  SimilarityResponse,
  StartInterviewResponse,
  AuthUser,
  ChatSendRequest,
  ChatSendResponse,
  ChatHistoryResponse,
  ChatEndResponse,
  ConnectionActionRequest,
  ConnectionRequest,
  DirectMessageRequest,
  DirectMessageThreadResponse,
  ExperienceAskRequest,
  ExperienceAskResponse,
  MarkNotificationReadRequest,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  NotificationsResponse,
  SearchUsersResponse,
  UserConnection,
} from "@/lib/api/types";

export const mindmatchApi = {
  // ── Auth ────────────────────────────────────────────────
  register(body: RegisterRequest) {
    return apiRequest<AuthResponse>("/auth/register", { method: "POST", body });
  },

  login(body: LoginRequest) {
    return apiRequest<AuthResponse>("/auth/login", { method: "POST", body });
  },

  googleAuth(body: GoogleAuthRequest) {
    return apiRequest<AuthResponse>("/auth/google", { method: "POST", body });
  },

  getMe() {
    return apiRequest<AuthUser>("/auth/me");
  },

  getMyProfile() {
    return apiRequest<ExtractProfileResponse>("/profile/me");
  },

  // ── Interview ────────────────────────────────────────────
  startInterview() {
    return apiRequest<StartInterviewResponse>("/interview/start", {
      method: "POST",
    });
  },

  respondToInterview(body: RespondInterviewRequest) {
    return apiRequest<RespondInterviewResponse>("/interview/respond", {
      method: "POST",
      body,
    });
  },

  extractProfile(body: ExtractProfileRequest) {
    return apiRequest<ExtractProfileResponse>("/interview/extract-profile", {
      method: "POST",
      body,
    });
  },

  // ── Matching ─────────────────────────────────────────────
  performSimilarity(body: SimilarityRequest) {
    return apiRequest<SimilarityResponse>("/perform_similarity", {
      method: "POST",
      body,
    });
  },

  searchUsers(query: string) {
    return apiRequest<SearchUsersResponse>(`/users/search?q=${encodeURIComponent(query)}`);
  },

  // ── Chat ─────────────────────────────────────────────────
  chatSend(body: ChatSendRequest) {
    return apiRequest<ChatSendResponse>("/chat/send", {
      method: "POST",
      body,
    });
  },

  chatHistory() {
    return apiRequest<ChatHistoryResponse>("/chat/history");
  },

  chatEndSession() {
    return apiRequest<ChatEndResponse>("/chat/end-session", {
      method: "POST",
    });
  },

  // Direct interaction
  requestConnection(body: ConnectionRequest) {
    return apiRequest<UserConnection>("/connections/request", {
      method: "POST",
      body,
    });
  },

  listConnections() {
    return apiRequest<{ connections: UserConnection[] }>("/connections");
  },

  acceptConnection(body: ConnectionActionRequest) {
    return apiRequest<UserConnection>("/connections/accept", {
      method: "POST",
      body,
    });
  },

  sendDirectMessage(body: DirectMessageRequest) {
    return apiRequest<DirectMessageThreadResponse["messages"][number]>("/direct-messages/send", {
      method: "POST",
      body,
    });
  },

  getDirectMessages(connectionId: string) {
    return apiRequest<DirectMessageThreadResponse>(`/direct-messages/${connectionId}`);
  },

  askExperience(body: ExperienceAskRequest) {
    return apiRequest<ExperienceAskResponse>("/experience/ask", {
      method: "POST",
      body,
    });
  },

  notifications() {
    return apiRequest<NotificationsResponse>("/notifications");
  },

  markNotificationRead(body: MarkNotificationReadRequest) {
    return apiRequest<MarkNotificationReadResponse>("/notifications/read", {
      method: "POST",
      body,
    });
  },

  markAllNotificationsRead() {
    return apiRequest<MarkAllNotificationsReadResponse>("/notifications/read-all", {
      method: "POST",
    });
  },
};
