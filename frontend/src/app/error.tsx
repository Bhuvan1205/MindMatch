"use client";

import { AppErrorState } from "@/components/feedback/app-error-state";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorState title="Something drifted out of focus" message={error.message} onRetry={reset} />;
}
