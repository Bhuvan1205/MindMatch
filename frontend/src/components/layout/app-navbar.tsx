"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Compass,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Sun,
  UserCircle2,
  Users2,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";

import { NotificationCenter } from "@/components/notifications/notification-center";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useInterviewStore } from "@/stores/interview-store";
import { useProfileStore } from "@/stores/profile-store";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  match: string;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Matches", href: "/matches", icon: Users2, match: "/matches" },
  { label: "Discover", href: "/discover", icon: Compass, match: "/discover" },
  { label: "Connections", href: "/connections", icon: MessageSquare, match: "/connections" },
  { label: "Matcha", href: "/chat", icon: MessageSquare, match: "/chat" },
  { label: "Profile", href: "/profile/preview", icon: UserCircle2, match: "/profile" },
];

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5 px-1 py-1">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
        M
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">MindMatch</span>
    </Link>
  );
}

function DiscoverSearchBar({ mobile = false, onSubmitDone }: { mobile?: boolean; onSubmitDone?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const existing = pathname.startsWith("/discover") ? searchParams.get("q") ?? "" : "";
  const [query, setQuery] = React.useState(existing);

  React.useEffect(() => {
    setQuery(existing);
  }, [existing]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const value = query.trim();
        router.push(value ? `/discover?q=${encodeURIComponent(value)}` : "/discover");
        onSubmitDone?.();
      }}
      className={cn(
        "flex items-center gap-2",
        mobile ? "w-full" : "min-w-[18rem] max-w-[24rem] flex-1",
      )}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people beyond matches"
          className={cn(
            "rounded-full border-border/60 bg-card/70 pl-9",
            mobile ? "h-10" : "h-10",
          )}
        />
      </div>
      {mobile ? (
        <Button type="submit" className="rounded-full px-4">
          Go
        </Button>
      ) : null}
    </form>
  );
}

export function AppNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const resetInterview = useInterviewStore((s) => s.resetInterview);
  const clearProfileFlow = useProfileStore((s) => s.clearProfileFlow);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  function handleSignOut() {
    clearAuth();
    resetInterview();
    clearProfileFlow();
    router.push("/");
  }

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="container flex h-16 items-center gap-4">
        <Logo />

        <div className="hidden md:flex md:flex-1 md:items-center md:gap-4">
          <Suspense fallback={<div className="hidden flex-1 md:block" />}>
            <DiscoverSearchBar />
          </Suspense>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.match);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/70 hover:text-foreground",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <NotificationCenter />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="ml-1 gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-4" />
            Sign Out
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2 md:hidden">
          <NotificationCenter />
          <Button type="button" variant="ghost" size="icon" onClick={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setMobileMenuOpen((open) => !open)}>
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border/60 bg-card md:hidden"
          >
            <div className="flex flex-col gap-3 p-4">
              <Suspense fallback={<div className="h-10 w-full rounded-full border border-border/60 bg-card/70" />}>
                <DiscoverSearchBar mobile onSubmitDone={() => setMobileMenuOpen(false)} />
              </Suspense>

              {NAV_ITEMS.map((item) => {
                const isActive = pathname.startsWith(item.match);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="size-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
