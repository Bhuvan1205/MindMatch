import type { Metadata } from "next";

import { ProfilePreviewHandoff } from "@/components/profile/profile-preview-handoff";

export const metadata: Metadata = {
  title: "Profile Preview",
};

export default function ProfilePreviewPage() {
  return <ProfilePreviewHandoff />;
}
