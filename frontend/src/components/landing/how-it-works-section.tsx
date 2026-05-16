"use client";

import { Brain, MessageCircle, Search, UserRoundCheck } from "lucide-react";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { softReveal, staggerContainer } from "@/components/motion/motion-config";
import { cn } from "@/lib/utils";

const steps = [
  {
    icon: MessageCircle,
    title: "Reflective interview",
    description:
      "A focused one-question-at-a-time conversation captures how you learn, build, collaborate, and explore.",
  },
  {
    icon: Brain,
    title: "Profile extraction",
    description:
      "Your completed interview is converted into concise profile categories grounded in your answers.",
  },
  {
    icon: Search,
    title: "Compatibility search",
    description:
      "Similarity and reranking surface people with aligned interests, goals, learning styles, and discussion patterns.",
  },
  {
    icon: UserRoundCheck,
    title: "Warm introductions",
    description:
      "Match details help you understand why someone fits and where a meaningful conversation could begin.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="px-5 pb-24 pt-8 sm:px-8 md:pb-32">
      <div className="container">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-120px" }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.div variants={softReveal}>
            <Badge variant="warm">How it works</Badge>
          </motion.div>
          <motion.h2
            variants={softReveal}
            className="mt-5 text-pretty text-3xl font-medium tracking-tight sm:text-4xl md:text-5xl"
          >
            A quiet path from reflection to resonance.
          </motion.h2>
          <motion.p variants={softReveal} className="mt-5 text-lg leading-8 text-muted-foreground">
            Our platform guides you intuitively: interview, profile reflection, matching, then meaningful connections.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-100px" }}
          className="relative mx-auto mt-16 grid max-w-5xl gap-4 md:grid-cols-4"
        >
          <div className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />
          {steps.map((step, index) => (
            <TimelineStep key={step.title} {...step} index={index} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function TimelineStep({
  icon: Icon,
  title,
  description,
  index,
}: (typeof steps)[number] & { index: number }) {
  return (
    <motion.article
      variants={softReveal}
      className={cn(
        "relative rounded-lg border bg-card/72 p-5 shadow-sm backdrop-blur-xl transition-colors hover:border-primary/30",
        "md:min-h-[260px]",
      )}
    >
      <div className="flex items-center gap-3 md:block">
        <div className="relative z-10 flex size-11 items-center justify-center rounded-full border bg-background text-primary shadow-sm">
          <Icon className="size-5" />
        </div>
        <div className="flex items-center gap-2 md:mt-6">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            0{index + 1}
          </span>
        </div>
      </div>
      <h3 className="mt-5 text-lg font-semibold leading-6">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </motion.article>
  );
}
