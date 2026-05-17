import type { Metadata } from "next";

import { DiscoverScreen } from "@/components/discover/discover-screen";

export const metadata: Metadata = {
  title: "Discover",
};

export default function DiscoverPage() {
  return <DiscoverScreen />;
}
