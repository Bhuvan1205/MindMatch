"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";

import { mindmatchApi } from "@/lib/api/mindmatch";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { ApiError } from "@/lib/api/errors";

type Tab = "signin" | "register";

export function LoginForm() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setProfile = useProfileStore((s) => s.setProfile);

  const [tab, setTab] = React.useState<Tab>("signin");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form fields
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [username, setUsername] = React.useState("");

  const clearError = () => setError(null);

  // ── Email / Password submit ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);

    try {
      const res =
        tab === "signin"
          ? await mindmatchApi.login({ email, password })
          : await mindmatchApi.register({ username, email, password });

      setAuth(res.access_token, {
        user_id: res.user_id,
        username: res.username,
        email: res.email,
      });

      // Restore existing profile from DB — skip interview if already generated
      try {
        const existing = await mindmatchApi.getMyProfile();
        setProfile(existing);
        router.push("/profile/preview");
      } catch {
        // No profile yet → go through interview
        router.push("/interview");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Google OAuth success ─────────────────────────────────────────────────
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    clearError();
    setLoading(true);

    try {
      const res = await mindmatchApi.googleAuth({
        credential: credentialResponse.credential,
      });

      setAuth(res.access_token, {
        user_id: res.user_id,
        username: res.username,
        email: res.email,
      });

      // Restore existing profile from DB — skip interview if already generated
      try {
        const existing = await mindmatchApi.getMyProfile();
        setProfile(existing);
        router.push("/profile/preview");
      } catch {
        router.push("/interview");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const tabVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.22 } },
    exit:    { opacity: 0, y: -8, transition: { duration: 0.15 } },
  };

  return (
    <div className="relative w-full max-w-md">
      {/* Glow blob */}
      <div className="pointer-events-none absolute -inset-8 rounded-3xl bg-primary/10 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative rounded-2xl border border-border/60 bg-card/80 p-8 shadow-xl backdrop-blur-xl"
      >
        {/* Back link */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>

        {/* Wordmark */}
        <div className="mb-7 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-primary/80">
            MindMatch
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {tab === "signin"
              ? "Sign in to continue to your profile."
              : "Start building your cognitive profile."}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="mb-6 flex rounded-xl border border-border/50 bg-muted/50 p-1">
          {(["signin", "register"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); clearError(); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                tab === t
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* Google button */}
        <div className="mb-5 flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Google sign-in was cancelled or failed.")}
            useOneTap={false}
            theme="outline"
            shape="rectangular"
            text={tab === "signin" ? "signin_with" : "signup_with"}
            size="large"
            width="100%"
          />
        </div>

        {/* Divider */}
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border/60" />
          <span className="text-xs text-muted-foreground">or continue with email</span>
          <div className="h-px flex-1 bg-border/60" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              {/* Username — only on register */}
              {tab === "register" && (
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="username"
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 transition"
                  />
                </div>
              )}

              {/* Email */}
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 transition"
                />
              </div>

              {/* Password */}
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={tab === "signin" ? "current-password" : "new-password"}
                  className="w-full rounded-xl border border-input bg-background py-3 pl-10 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {tab === "signin" ? "Signing in…" : "Creating account…"}
              </>
            ) : tab === "signin" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
