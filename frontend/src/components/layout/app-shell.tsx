"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

import { AppNavbar } from "@/components/layout/app-navbar";
import { Button } from "@/components/ui/button";

// Routes that should use the app layout
const APP_ROUTE_PREFIXES = ["/profile", "/matches", "/connections", "/llm-features", "/chat"];

function MarketingNavbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/72 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
            M
          </span>
          <span className="text-sm font-semibold tracking-normal">MindMatch</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Completely isolated layout for the interview flow
  if (pathname.startsWith("/interview")) {
    return <main className="min-h-screen">{children}</main>;
  }

  // ── Chat — full-screen, single-scroll layout ─────────────────────────────
  if (pathname.startsWith("/chat")) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <AppNavbar />
        {/* min-h-0 is critical: prevents flex child from growing beyond parent */}
        <main className="min-h-0 flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  // ── Other authenticated app routes ────────────────────────────────────────
  const isAppRoute = APP_ROUTE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isAppRoute) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppNavbar />
        {/* Main content */}
        <main className="flex-1 overflow-x-hidden">
          {children}
        </main>
      </div>
    );
  }

  // Marketing / auth pages — classic top navbar layout
  return (
    <div className="min-h-screen">
      <MarketingNavbar />
      <main>{children}</main>
    </div>
  );
}
