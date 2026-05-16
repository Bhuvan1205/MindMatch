"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function AppErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-20">
      <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-5" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        {message ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p> : null}
        {onRetry ? (
          <Button type="button" className="mt-7" onClick={onRetry}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        ) : null}
      </div>
    </section>
  );
}
