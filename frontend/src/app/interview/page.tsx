import type { Metadata } from "next";

import { InterviewFlow } from "@/components/interview/interview-flow";

export const metadata: Metadata = {
  title: "Interview",
};

export default function InterviewPage() {
  return <InterviewFlow />;
}
