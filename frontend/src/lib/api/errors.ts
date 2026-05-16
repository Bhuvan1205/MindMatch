import type { ApiErrorBody } from "@/lib/api/types";

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | string | null;

  constructor({
    status,
    message,
    body,
  }: {
    status: number;
    message: string;
    body: ApiErrorBody | string | null;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}
