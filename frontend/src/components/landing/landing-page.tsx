"use client";

import { motion } from "framer-motion";

import { HeroSection } from "@/components/landing/hero-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { softReveal } from "@/components/motion/motion-config";

export function LandingPage() {
  return (
    <motion.div initial="initial" animate="animate" exit="exit" className="overflow-hidden">
      <HeroSection />
      <motion.div variants={softReveal}>
        <HowItWorksSection />
      </motion.div>
    </motion.div>
  );
}
