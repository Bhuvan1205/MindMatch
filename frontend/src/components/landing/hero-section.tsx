"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

import { NeuralOrb } from "@/components/motion/neural-orb";
import { Button } from "@/components/ui/button";
import { softReveal, staggerContainer } from "@/components/motion/motion-config";

export function HeroSection() {
  return (
    <section className="relative min-h-[calc(100vh-4rem)] px-5 py-16 sm:px-8 md:py-20">
      <div className="absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-primary/10 to-transparent" />
      <div className="container grid min-h-[calc(100vh-12rem)] items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left"
        >
          <motion.div
            variants={softReveal}
            className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/70 bg-card/68 px-3.5 py-1.5 text-sm text-muted-foreground shadow-sm backdrop-blur-xl dark:border-white/10"
          >
            <Sparkles className="size-4 text-primary" />
            Cognitive compatibility for students and learners
          </motion.div>

          <motion.h1
            variants={softReveal}
            className="text-pretty text-4xl font-medium leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl"
          >
            Meet people who think beautifully with you.
          </motion.h1>

          <motion.p
            variants={softReveal}
            className="mx-auto mt-7 max-w-2xl text-balance text-lg leading-8 text-muted-foreground sm:text-xl lg:mx-0"
          >
            MindMatch turns a reflective AI interview into a grounded cognitive
            profile, then helps surface compatible learners for deeper
            conversations, shared work, and better momentum.
          </motion.p>

          <motion.div
            variants={softReveal}
            className="mt-10 flex items-center justify-center lg:justify-start"
          >
            <Button asChild size="lg" className="h-12 w-full px-6 sm:w-auto">
              <Link href="/login">
                Build My Cognitive Profile
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </motion.div>
        </motion.div>

        <motion.div
          variants={softReveal}
          initial="initial"
          animate="animate"
          className="relative mx-auto flex w-full max-w-[420px] justify-center lg:mx-0 lg:justify-end"
        >
          <div className="absolute inset-10 rounded-full bg-primary/10 blur-3xl" />
          <NeuralOrb />
        </motion.div>
      </div>
    </section>
  );
}
