"use client";

import { motion } from "framer-motion";
import { Loader2, MessageCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useStreamingText } from "@/hooks/use-streaming-text";
import { cn } from "@/lib/utils";

export function InterviewQuestionCard({
  question,
  agentMessage,
  isLoading,
  isSubmitting,
  label = "MindMatch AI",
  subtitle,
}: {
  question: string | null;
  agentMessage: string | null;
  isLoading: boolean;
  isSubmitting: boolean;
  label?: string;
  subtitle?: string;
}) {
  const streamedQuestion = useStreamingText(question, 16);

  return (
    <div className="relative overflow-hidden rounded-lg border bg-card/72 p-6 shadow-soft backdrop-blur-xl sm:p-8">
      <div className="absolute right-6 top-6 size-28 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
            {isSubmitting ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <MessageCircle className="size-5" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              {isSubmitting ? "Reading your answer" : (subtitle ?? "Interview companion")}
            </p>
          </div>
        </div>

        {agentMessage ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Alert className="mb-5 border-primary/20 bg-secondary/70">
              <AlertDescription>{agentMessage}</AlertDescription>
            </Alert>
          </motion.div>
        ) : null}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-11/12" />
            <Skeleton className="h-8 w-8/12" />
          </div>
        ) : (
          <h1
            className={cn(
              "min-h-28 text-pretty text-xl font-medium leading-[1.6] tracking-tight text-foreground sm:text-[22px]",
              !streamedQuestion && "text-muted-foreground",
            )}
          >
            {streamedQuestion}
            {streamedQuestion.length !== (question?.length ?? 0) ? (
              <span className="ml-1 inline-block h-8 w-0.5 translate-y-1 animate-pulse bg-primary" />
            ) : null}
          </h1>
        )}
      </div>
    </div>
  );
}
