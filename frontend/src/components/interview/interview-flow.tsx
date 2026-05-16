"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react";

import { AppErrorState } from "@/components/feedback/app-error-state";
import { InterviewProgress } from "@/components/interview/interview-progress";
import { InterviewQuestionCard } from "@/components/interview/interview-question-card";
import { VoicePanel } from "@/components/interview/voice-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { getApiErrorMessage } from "@/lib/api/errors";
import { mindmatchApi } from "@/lib/api/mindmatch";
import type { RespondInterviewResponse } from "@/lib/api/types";
import { softReveal } from "@/components/motion/motion-config";
import { useInterviewStore } from "@/stores/interview-store";
import { useProfileStore } from "@/stores/profile-store";
import { useRouter } from "next/navigation";

export function InterviewFlow() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const [answer, setAnswer] = React.useState("");

  const handleTranscript = React.useCallback((text: string) => {
    setAnswer((prev) => prev + (prev ? " " : "") + text);
  }, []);

  const {
    isListening,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    hasRecognitionSupport,
  } = useSpeechRecognition(handleTranscript);

  const handleRecordingChange = (recording: boolean) => {
    if (!hasRecognitionSupport) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }
    if (recording) {
      startListening();
    } else {
      stopListening();
    }
  };
  const {
    sessionId,
    currentQuestion,
    questionIndex,
    totalQuestions,
    chatHistory,
    lastAgentMessage,
    setStarted,
    setQuestion,
    setCompleted,
    resetInterview,
  } = useInterviewStore();

  React.useEffect(() => {
    if (profile) {
      router.push("/matches");
    }
  }, [profile, router]);

  const startInterview = useMutation({
    mutationFn: mindmatchApi.startInterview,
    onSuccess: (payload) => {
      setStarted(payload);
      setAnswer("");
    },
  });

  const respondToInterview = useMutation({
    mutationFn: mindmatchApi.respondToInterview,
    onSuccess: (payload) => {
      handleResponse(payload);
      setAnswer("");
    },
  });
  const startStatus = startInterview.status;
  const startMutate = startInterview.mutate;

  React.useEffect(() => {
    if (!sessionId && !chatHistory && startStatus === "idle") {
      startMutate();
    }
  }, [chatHistory, sessionId, startMutate, startStatus]);

  function handleResponse(payload: RespondInterviewResponse) {
    if (payload.status === "done" && payload.chat_history) {
      setCompleted(payload.chat_history);
      return;
    }

    setQuestion({
      question: payload.question,
      questionIndex: payload.question_index,
      totalQuestions: payload.total_questions,
      message: payload.message,
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sessionId || !answer.trim() || respondToInterview.isPending) {
      return;
    }

    respondToInterview.mutate({
      session_id: sessionId,
      answer,
    });
  }

  function handleRestart() {
    resetInterview();
    setAnswer("");
    startInterview.reset();
    respondToInterview.reset();
    startInterview.mutate();
  }

  const error = startInterview.error ?? respondToInterview.error;

  if (error) {
    return (
      <AppErrorState
        title="The interview paused"
        message={getApiErrorMessage(error)}
        onRetry={sessionId ? () => respondToInterview.reset() : handleRestart}
      />
    );
  }

  if (chatHistory) {
    return <InterviewComplete onRestart={handleRestart} />;
  }

  const isStarting = startInterview.isPending || (!currentQuestion && !startInterview.error);
  const isSubmitting = respondToInterview.isPending;

  return (
    <section className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8 md:py-10">
      <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary/10 via-accent/10 to-transparent" />
      <div className="container flex min-h-[calc(100vh-9rem)] max-w-4xl flex-col">
        <InterviewProgress
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          isLoading={isStarting}
        />

        <motion.div
          variants={softReveal}
          initial="initial"
          animate="animate"
          className="flex flex-1 flex-col justify-center py-10"
        >
          <div className="mx-auto w-full max-w-3xl">
            <InterviewQuestionCard
              question={currentQuestion}
              agentMessage={lastAgentMessage}
              isLoading={isStarting}
              isSubmitting={isSubmitting}
            />

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <VoicePanel
                isRecording={isListening}
                onRecordingChange={handleRecordingChange}
                transcriptPreview={
                  interimTranscript ? transcript + (transcript ? " " : "") + interimTranscript : transcript
                }
              />

              <div className="rounded-lg border bg-card/78 p-3 shadow-sm backdrop-blur-xl">
                <Textarea
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  disabled={isStarting || isSubmitting}
                  placeholder="Type your answer here..."
                  className="min-h-32 resize-none border-0 bg-transparent p-2 text-base shadow-none focus-visible:ring-0"
                />
                <div className="flex items-center justify-between gap-3 border-t pt-3">
                  <p className="text-xs text-muted-foreground">
                    Dictated text is added here. You can still type to edit before sending.
                  </p>
                  <Button type="submit" disabled={!answer.trim() || isStarting || isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Send answer
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function InterviewComplete({ onRestart }: { onRestart: () => void }) {
  return (
    <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-20">
      <motion.div
        variants={softReveal}
        initial="initial"
        animate="animate"
        className="max-w-lg rounded-lg border bg-card/78 p-8 text-center shadow-soft backdrop-blur-xl"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent text-primary">
          <CheckCircle2 className="size-6" />
        </div>
        <h1 className="mt-5 text-pretty text-2xl font-medium tracking-tight">Interview complete</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your interview is complete and ready to be processed into your unique cognitive profile.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/profile/processing">
              Generate profile
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button type="button" variant="secondary" onClick={onRestart}>
            <RotateCcw className="size-4" />
            Start over
          </Button>
        </div>
      </motion.div>
    </section>
  );
}
