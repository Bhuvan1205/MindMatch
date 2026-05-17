import type { Metadata } from "next";

import { ConnectionsScreen } from "@/components/connections/connections-screen";

export const metadata: Metadata = {
  title: "Connections",
};

export default function ConnectionsPage() {
  return <ConnectionsScreen />;
}
