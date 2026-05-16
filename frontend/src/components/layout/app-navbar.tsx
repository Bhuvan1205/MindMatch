"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users2,
  UserCircle2,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  MessageSquare,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useAuthStore } from "@/stores/auth-store";
import { useInterviewStore } from "@/stores/interview-store";
import { useProfileStore } from "@/stores/profile-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  match: string;
  soon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Matches",       href: "/matches",        icon: Users2,         match: "/matches" },
  { label: "Matcha",        href: "/chat",           icon: MessageSquare,  match: "/chat" },
  { label: "Profile",       href: "/profile/preview", icon: UserCircle2,   match: "/profile" },
];

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

  // Close mobile menu on route change
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Logo />

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.match);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-muted/70 hover:text-foreground",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {item.soon && (
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
          
          <div className="mx-3 h-4 w-px bg-border/60" />
          
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
        </nav>

        {/* Mobile Toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border/60 bg-card md:hidden"
          >
            <div className="flex flex-col gap-2 p-4">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname.startsWith(item.match);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
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
        )}
      </AnimatePresence>
    </header>
  );
}
