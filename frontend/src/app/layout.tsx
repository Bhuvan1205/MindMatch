import type { Metadata } from "next";

import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MindMatch",
    template: "%s | MindMatch",
  },
  description: "AI-powered cognitive compatibility for students and learners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>
          <div className="mesh-surface">
            <AppShell>{children}</AppShell>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
