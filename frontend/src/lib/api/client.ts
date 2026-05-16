import { ApiError } from "@/lib/api/errors";
import type { ApiErrorBody } from "@/lib/api/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

async function parseResponseBody(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(status: number, body: unknown) {
  if (body && typeof body === "object") {
    const errorBody = body as ApiErrorBody;
    return errorBody.detail ?? errorBody.message ?? `Request failed with status ${status}.`;
  }

  if (typeof body === "string" && body.length > 0) {
    return body;
  }

  return `Request failed with status ${status}.`;
}

/** Read the JWT from the zustand-persist localStorage entry without importing the store
 *  (avoids SSR issues — this function is only called during client-side fetches). */
function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("mindmatch-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}

export async function apiRequest<TResponse>(path: string, options: RequestOptions = {}) {
  const token = getStoredToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      message: extractErrorMessage(response.status, body),
      body: (body as ApiErrorBody | string | null) ?? null,
    });
  }

  return body as TResponse;
}
