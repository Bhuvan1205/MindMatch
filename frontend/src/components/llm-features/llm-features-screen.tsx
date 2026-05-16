"use client";

import { motion } from "framer-motion";
import { Sparkles, MessageSquareText, Brain, Layers, Zap, GitBranch } from "lucide-react";

import { softReveal, staggerContainer } from "@/components/motion/motion-config";

const PLANNED_FEATURES = [
  {
    icon: MessageSquareText,
    title: "Conversational AI Interface",
    description:
      "A direct, persistent chat interface where you can explore ideas, ask questions, and think alongside an AI that knows your cognitive profile.",
  },
  {
    icon: Brain,
    title: "Persistent Experience Memory",
    description:
      "The AI accumulates and evolves a memory of every interaction — building a richer picture of how you think over time.",
  },
  {
    icon: Layers,
    title: "Behavioral Compatibility Insights",
    description:
      "Deep AI-generated analysis of why specific matches are cognitively compatible — beyond similarity scores.",
  },
  {
    icon: GitBranch,
    title: "Profile Evolution",
    description:
      "Your cognitive profile evolves intelligently based on accumulated conversations, keeping your matches increasingly accurate.",
  },
  {
    icon: Zap,
    title: "AI-Generated Introductions",
    description:
      "Contextual, personalized conversation starters and introductions generated for each of your matches.",
  },
];

export function LlmFeaturesScreen() {
  return (
    <section className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden px-5 py-16 sm:px-8 lg:min-h-screen">
      {/* Ambient gradient */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_60%_20%,hsl(var(--primary)/0.12),transparent_30rem),radial-gradient(circle_at_20%_80%,hsl(var(--accent)/0.18),transparent_26rem)]" />

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="container max-w-3xl"
      >
        {/* Header */}
        <motion.div variants={softReveal} className="text-center">
          {/* Icon ring */}
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 to-accent/20 shadow-sm">
            <Sparkles className="size-7 text-primary" />
          </div>

          <span className="inline-block rounded-full border border-primary/20 bg-primary/8 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Coming Soon
          </span>

          <h1 className="mt-5 text-pretty text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            LLM-Powered Features
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
            MindMatch is evolving beyond compatibility matching into a persistent
            AI layer that learns how you think, remembers your conversations, and
            deepens every connection over time.
          </p>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          variants={staggerContainer}
          className="mt-14 grid gap-4 sm:grid-cols-2"
        >
          {PLANNED_FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={softReveal}
              className="group rounded-xl border border-border/60 bg-card/70 p-5 backdrop-blur-sm transition-all duration-200 hover:border-primary/20 hover:bg-card/90 hover:shadow-sm"
            >
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="size-4 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{feature.title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Footer note */}
        <motion.p
          variants={softReveal}
          className="mt-12 text-center text-xs text-muted-foreground/70"
        >
          These features are planned but not yet implemented. No AI functionality
          has been faked or simulated on this page.
        </motion.p>
      </motion.div>
    </section>
  );
}
