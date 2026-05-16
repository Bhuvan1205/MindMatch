"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api/errors";
import { mindmatchApi } from "@/lib/api/mindmatch";
import { softReveal } from "@/components/motion/motion-config";
import { useInterviewStore } from "@/stores/interview-store";
import { useProfileStore } from "@/stores/profile-store";

const statusMessages = [
  "Reading your interview transcript",
  "Extracting grounded profile signals",
  "Organizing learning and collaboration patterns",
  "Preparing your cognitive profile preview",
];

export function ProfileProcessingScreen() {
  const router = useRouter();
  const { chatHistory } = useInterviewStore();
  const { setProfile } = useProfileStore();
  const [messageIndex, setMessageIndex] = React.useState(0);

  const extractProfile = useMutation({
    mutationFn: mindmatchApi.extractProfile,
    onSuccess: (profile) => {
      setProfile(profile);
      window.setTimeout(() => router.push("/profile/preview"), 850);
    },
  });

  const extractStatus = extractProfile.status;
  const extractMutate = extractProfile.mutate;

  React.useEffect(() => {
    if (chatHistory && extractStatus === "idle") {
      extractMutate({ chat_history: chatHistory });
    }
  }, [chatHistory, extractMutate, extractStatus]);

  React.useEffect(() => {
    if (!extractProfile.isPending) {
      return;
    }

    const interval = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % statusMessages.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, [extractProfile.isPending]);

  if (!chatHistory) {
    return (
      <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-20">
        <motion.div
          variants={softReveal}
          initial="initial"
          animate="animate"
          className="max-w-md rounded-lg border bg-card/78 p-8 text-center shadow-soft backdrop-blur-xl"
        >
          <h1 className="text-2xl font-semibold">No completed interview found</h1>
            Profile generation requires a completed interview history.
          </p>
          <Button asChild className="mt-7">
            <Link href="/interview">
              <ArrowLeft className="size-4" />
              Return to interview
            </Link>
          </Button>
        </motion.div>
      </section>
    );
  }

  const errorMessage = extractProfile.error ? getApiErrorMessage(extractProfile.error) : null;
  const isSuccess = extractProfile.isSuccess;

  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-5 py-20 sm:px-8">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_20%,hsl(var(--primary)/0.16),transparent_34rem),radial-gradient(circle_at_18%_72%,hsl(var(--accent)/0.34),transparent_24rem)]" />
      <ProcessingParticles />

      <div className="container flex min-h-[calc(100vh-14rem)] items-center justify-center">
        <motion.div
          variants={softReveal}
          initial="initial"
          animate="animate"
          className="w-full max-w-xl rounded-lg border bg-card/76 p-8 text-center shadow-soft backdrop-blur-xl sm:p-10"
        >
          <div className="mx-auto flex size-16 items-center justify-center rounded-full border bg-background shadow-sm">
            {errorMessage ? (
              <RefreshCw className="size-7 text-destructive" />
            ) : isSuccess ? (
              <Sparkles className="size-7 text-primary" />
            ) : (
              <Loader2 className="size-7 animate-spin text-primary" />
            )}
          </div>

          <h1 className="mt-7 text-pretty text-2xl font-medium tracking-tight sm:text-3xl">
            {errorMessage
              ? "Profile generation paused"
              : isSuccess
                ? "Profile generated"
                : "Generating your cognitive profile"}
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted-foreground sm:text-base">
            {errorMessage ??
              (isSuccess
                ? "Taking you to your profile preview."
                : statusMessages[messageIndex])}
          </p>

          <div className="mt-8">
            {errorMessage ? (
              <Button
                type="button"
                onClick={() => extractProfile.mutate({ chat_history: chatHistory })}
              >
                <RefreshCw className="size-4" />
                Retry generation
              </Button>
            ) : (
              <div className="mx-auto h-2 max-w-xs overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ProcessingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, index) => (
        <motion.span
          key={index}
          className="absolute size-1.5 rounded-full bg-primary/30"
          style={{
            left: `${8 + index * 8}%`,
            top: `${18 + (index % 5) * 14}%`,
          }}
          animate={{ y: [-8, 8, -8], opacity: [0.2, 0.75, 0.2] }}
          transition={{
            duration: 3 + (index % 4) * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: index * 0.12,
          }}
        />
      ))}
    </div>
  );
}
