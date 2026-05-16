import type { Metadata } from "next";

import { ProfileProcessingScreen } from "@/components/profile/profile-processing-screen";

export const metadata: Metadata = {
  title: "Generating Profile",
};

export default function ProfileProcessingPage() {
  return <ProfileProcessingScreen />;
}
