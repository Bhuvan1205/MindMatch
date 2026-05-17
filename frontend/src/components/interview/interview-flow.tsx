"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, Send, Info } from "lucide-react";

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
  const [hasSeenIntro, setHasSeenIntro] = React.useState(false);
  const [dismissedSectionIndex, setDismissedSectionIndex] = React.useState<number | null>(null);

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
    sectionName,
    sectionIndex,
    totalSections,
    questionInSection,
    totalInSection,
    isNewSection,
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
      sectionName: payload.section_name,
      sectionIndex: payload.section_index,
      totalSections: payload.total_sections,
      questionInSection: payload.question_in_section,
      totalInSection: payload.total_in_section,
      isNewSection: payload.is_new_section,
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
    setHasSeenIntro(false);
    setDismissedSectionIndex(null);
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

  if (questionIndex >= 1 && !hasSeenIntro) {
    return (
      <InterviewIntroScreen
        onContinue={() => setHasSeenIntro(true)}
        totalQuestions={totalQuestions}
      />
    );
  }

  if (hasSeenIntro && isNewSection && sectionIndex !== dismissedSectionIndex) {
    return (
      <InterviewSectionTransition
        sectionName={sectionName}
        sectionIndex={sectionIndex}
        totalSections={totalSections}
        onContinue={() => setDismissedSectionIndex(sectionIndex)}
      />
    );
  }

  const isPreInterview = questionIndex === 0;
  const displaySectionName = getSectionDisplayName(sectionName);
  const interviewQuestionIndex = Math.max(0, questionIndex - 1);
  const interviewTotalQuestions = Math.max(0, totalQuestions - 1);

  return (
    <section className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8 md:py-10">
      <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary/10 via-accent/10 to-transparent" />
      <div className="container flex min-h-[calc(100vh-9rem)] max-w-4xl flex-col">
        {isPreInterview ? null : (
          <InterviewProgress
            questionIndex={interviewQuestionIndex}
            totalQuestions={interviewTotalQuestions}
            sectionName={displaySectionName}
            sectionIndex={sectionIndex}
            totalSections={totalSections}
            questionInSection={questionInSection}
            totalInSection={totalInSection}
            isLoading={isStarting}
          />
        )}

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
              label={isPreInterview ? "Getting to know you" : displaySectionName}
              subtitle={isPreInterview ? "Before the interview begins" : "Interview companion"}
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

function InterviewIntroScreen({ onContinue, totalQuestions }: { onContinue: () => void; totalQuestions: number }) {
  return (
    <section className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8 md:py-10">
      <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary/10 via-accent/10 to-transparent" />
      <div className="container flex min-h-[calc(100vh-9rem)] max-w-4xl flex-col justify-center py-10">
        <motion.div
          variants={softReveal}
          initial="initial"
          animate="animate"
          className="mx-auto w-full max-w-2xl rounded-xl border bg-card/78 p-8 shadow-soft backdrop-blur-xl md:p-10"
        >
          <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <Info className="size-6" />
          </div>
          <h1 className="text-3xl font-medium tracking-tight">Before we begin...</h1>
          
          <div className="mt-8 space-y-6 text-muted-foreground">
            <p>
              This interview consists of <strong>{Math.max(0, totalQuestions - 1)} questions</strong> designed to understand your unique learning style and cognitive patterns.
            </p>
            
            <div className="space-y-2">
              <h3 className="font-medium text-foreground">Traits we assess:</h3>
              <ul className="ml-5 list-disc space-y-1">
                <li>Problem Solving Approaches</li>
                <li>Communication Preferences</li>
                <li>Information Processing Styles</li>
                <li>Teamwork and Collaboration Dynamics</li>
              </ul>
            </div>

            <div className="rounded-lg bg-accent/50 p-4 text-sm">
              <strong>Privacy & Personalization:</strong> The data extracted from this interview will be used to generate your cognitive profile. This allows us to provide personalized recommendations and match you with other compatible learners for a highly tailored experience.
            </div>
          </div>

          <div className="mt-10 flex justify-end">
            <Button onClick={onContinue} size="lg" className="w-full sm:w-auto">
              Begin interview
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function InterviewSectionTransition({
  sectionName,
  sectionIndex,
  totalSections,
  onContinue,
}: {
  sectionName: string | null;
  sectionIndex: number;
  totalSections: number;
  onContinue: () => void;
}) {
  const displayName = getSectionDisplayName(sectionName);
  const description = getSectionDescription(sectionName);

  return (
    <section className="relative min-h-screen overflow-hidden px-5 py-8 sm:px-8 md:py-10">
      <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-primary/10 via-accent/10 to-transparent" />
      <div className="container flex min-h-[calc(100vh-9rem)] max-w-4xl flex-col justify-center py-10">
        <motion.div
          variants={softReveal}
          initial="initial"
          animate="animate"
          className="mx-auto w-full max-w-2xl rounded-xl border bg-card/78 p-8 shadow-soft backdrop-blur-xl md:p-10"
        >
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Section {sectionIndex + 1} of {totalSections}
          </p>
          <h1 className="mt-4 text-3xl font-medium tracking-tight">{displayName}</h1>
          <p className="mt-4 max-w-xl leading-7 text-muted-foreground">{description}</p>

          <div className="mt-10 flex justify-end">
            <Button onClick={onContinue} size="lg" className="w-full sm:w-auto">
              Continue
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function getSectionDisplayName(sectionName: string | null) {
  if (sectionName === "Intro") {
    return "Getting Oriented";
  }

  return sectionName ?? "Interview";
}

function getSectionDescription(sectionName: string | null) {
  switch (sectionName) {
    case "INTERESTS & CURIOSITY":
      return "Now we’ll look at the ideas that naturally pull your attention and keep you curious.";
    case "GOALS & DIRECTION":
      return "Next, we’ll explore what you are moving toward and how you think about direction.";
    case "LEARNING STYLE":
      return "This section focuses on how you approach difficult ideas and build understanding.";
    case "EXECUTION & PRODUCTIVITY":
      return "Here we’ll look at how you turn ideas into action and what affects your momentum.";
    case "COLLABORATION & SOCIAL STYLE":
      return "Now we’ll explore the kinds of people and conversations that help you work well.";
    case "PROBLEM-SOLVING & SELF-AWARENESS":
      return "This section looks at how you respond to challenge, uncertainty, and reflection.";
    case "CLOSING QUESTIONS":
      return "We’re at the final stretch: a couple of questions about your ideal intellectual match.";
    default:
      return "We’ll begin with a little context about where you are right now.";
  }
}
