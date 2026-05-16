"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users2,
  UserCircle2,
  Sparkles,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  MessageSquare,
  SquareX,
  Loader2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMutation } from "@tanstack/react-query";

import { mindmatchApi } from "@/lib/api/mindmatch";
import { useChatStore } from "@/stores/chat-store";

import { useAuthStore } from "@/stores/auth-store";
import { useInterviewStore } from "@/stores/interview-store";
import { useProfileStore } from "@/stores/profile-store";
import { cn } from "@/lib/utils";

// ── Navigation config ────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  match: string;   // pathname prefix to detect active state
  soon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Matches",       href: "/matches",        icon: Users2,         match: "/matches" },
  { label: "Chat",          href: "/chat",            icon: MessageSquare,  match: "/chat" },
  { label: "Profile",       href: "/profile/preview", icon: UserCircle2,   match: "/profile" },
  { label: "LLM Features",  href: "/llm-features",   icon: Sparkles,       match: "/llm-features", soon: true },
];

// ── Shared sub-components ────────────────────────────────────────────────────

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-1 py-1 group">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
        M
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">
        MindMatch
      </span>
    </Link>
  );
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname.startsWith(item.match);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {isActive && (
        <motion.span
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-lg bg-primary/10"
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        />
      )}
      <item.icon
        className={cn(
          "relative z-10 size-4 shrink-0 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="relative z-10 flex-1">{item.label}</span>
      {item.soon && (
        <span className="relative z-10 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Soon
        </span>
      )}
    </Link>
  );
}

function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive"
    >
      <LogOut className="size-4 shrink-0" />
      Sign Out
    </button>
  );
}

function EndSessionButton() {
  const clearChat = useChatStore((s) => s.clearChat);
  const [confirm, setConfirm] = React.useState(false);

  const endSessionMutation = useMutation({
    mutationFn: mindmatchApi.chatEndSession,
    onSuccess: () => {
      clearChat();
      setConfirm(false);
    },
    onError: () => {
      clearChat();
      setConfirm(false);
    },
  });

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="group flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-primary/10 hover:text-primary"
      >
        <SquareX className="size-4 shrink-0 transition-transform group-hover:scale-110" />
        End Chat Session
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden rounded-lg border border-primary/20 bg-primary/5 p-2"
    >
      <p className="mb-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
        This saves your chat to memory and starts a fresh session.
      </p>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => endSessionMutation.mutate()}
          disabled={endSessionMutation.isPending}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {endSessionMutation.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <SquareX className="size-3" />
          )}
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="flex-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/70"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-all duration-150 hover:bg-muted/70 hover:text-foreground"
    >
      {isDark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}

// ── Sidebar inner content (shared between desktop + mobile) ──────────────────

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const resetInterview = useInterviewStore((s) => s.resetInterview);
  const clearProfileFlow = useProfileStore((s) => s.clearProfileFlow);

  function handleSignOut() {
    clearAuth();
    resetInterview();
    clearProfileFlow();
    router.push("/");
  }

  return (
    <div className="flex h-full flex-col px-3 py-4">
      {/* Logo */}
      <div className="mb-6 px-1">
        <Logo />
      </div>

      {/* Nav label */}
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Navigation
      </p>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} onClick={onNavClick} />
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="mt-4 flex flex-col gap-1 border-t border-border/60 pt-4">
        <ThemeToggle />
        <EndSessionButton />
        <SignOutButton onClick={handleSignOut} />
      </div>
    </div>
  );
}

// ── Desktop sidebar ──────────────────────────────────────────────────────────

function DesktopSidebar() {
  return (
    <aside className="hidden w-[220px] shrink-0 lg:flex">
      <div className="fixed top-0 bottom-0 w-[220px] border-r border-border/60 bg-card/95 backdrop-blur-xl">
        <SidebarContent />
      </div>
    </aside>
  );
}

// ── Mobile drawer ────────────────────────────────────────────────────────────

function MobileDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed inset-y-0 left-0 z-50 w-[240px] border-r border-border/60 bg-card shadow-xl lg:hidden"
          >
            <SidebarContent onNavClick={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Mobile top bar ───────────────────────────────────────────────────────────

function MobileTopBar({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur-xl lg:hidden">
      <button
        type="button"
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        onClick={onToggle}
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
      >
        {isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      <Logo />
    </header>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <DesktopSidebar />
      <MobileTopBar isOpen={mobileOpen} onToggle={() => setMobileOpen((v) => !v)} />
      <MobileDrawer isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
