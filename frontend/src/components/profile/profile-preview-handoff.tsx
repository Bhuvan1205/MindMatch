"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, X } from "lucide-react";
import { motion } from "framer-motion";

import { EmptyState } from "@/components/feedback/empty-state";
import { IdentityAvatar } from "@/components/shared/identity-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { profileCategories, type ProfileCategoryKey } from "@/lib/profile/categories";
import { cn } from "@/lib/utils";
import { softReveal, staggerContainer } from "@/components/motion/motion-config";
import { useProfileStore } from "@/stores/profile-store";

export function ProfilePreviewHandoff() {
  const { profile, updateProfilePreview } = useProfileStore();

  if (!profile) {
    return (
      <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-20">
        <EmptyState
          title="Profile preview is not ready"
          description="Generate a profile from a completed interview first."
          action={
            <Button asChild>
              <Link href="/interview">
                <ArrowLeft className="size-4" />
                Return to interview
              </Link>
            </Button>
          }
          className="max-w-md"
        />
      </section>
    );
  }

  function updateCategory(key: ProfileCategoryKey, values: string[]) {
    if (!profile) {
      return;
    }

    updateProfilePreview({
      ...profile,
      [key]: values,
    });
  }

  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-5 py-12 sm:px-8 md:py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,hsl(var(--primary)/0.13),transparent_28rem),radial-gradient(circle_at_86%_18%,hsl(var(--accent)/0.28),transparent_26rem)]" />

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="container max-w-5xl"
      >
        <motion.div variants={softReveal} className="mx-auto max-w-3xl text-center">
          <IdentityAvatar name={profile.name} size="xl" className="mx-auto" />
          <p className="mt-6 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Cognitive profile
          </p>
          <h1 className="mt-3 text-pretty text-3xl font-medium tracking-tight capitalize sm:text-4xl">
            {profile.name || "Your profile"}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance leading-7 text-muted-foreground">
            Generated from your completed MindMatch interview and organized into
            categories designed to highlight your unique patterns.
          </p>
        </motion.div>

        <motion.div variants={softReveal} className="mt-10 rounded-lg border bg-card/76 p-4 shadow-soft backdrop-blur-xl sm:p-7">
          <div className="grid gap-5 md:grid-cols-2">
            {profileCategories.map((category) => (
              <ProfileCategorySection
                key={category.key}
                title={category.label}
                values={profile[category.key]}
                onChange={(values) => updateCategory(category.key, values)}
              />
            ))}
          </div>
        </motion.div>

        <motion.div variants={softReveal} className="mt-10 flex justify-center">
          <Button asChild size="lg" className="h-12 px-7">
            <Link href="/matches">
              Find My Matches
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </motion.div>
      </motion.div>
    </section>
  );
}

function ProfileCategorySection({
  title,
  values,
  onChange,
}: {
  title: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draftValue, setDraftValue] = React.useState("");

  function addChip() {
    const trimmed = draftValue.trim();
    if (!trimmed) {
      return;
    }

    onChange([...values, trimmed]);
    setDraftValue("");
  }

  function updateChip(index: number, nextValue: string) {
    const trimmed = nextValue.trim();
    if (!trimmed) {
      onChange(values.filter((_, chipIndex) => chipIndex !== index));
      return;
    }

    onChange(values.map((value, chipIndex) => (chipIndex === index ? trimmed : value)));
  }

  function removeChip(index: number) {
    onChange(values.filter((_, chipIndex) => chipIndex !== index));
  }

  return (
    <section className="rounded-lg border bg-background/56 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {values.length > 0 ? (
          values.map((value, index) => (
            <EditableChip
              key={`${value}-${index}`}
              value={value}
              onSave={(nextValue) => updateChip(index, nextValue)}
              onRemove={() => removeChip(index)}
            />
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No details found for this category.</p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          aria-label={`Add ${title} detail`}
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addChip();
            }
          }}
          placeholder="Add detail"
          className="h-10 rounded-full bg-card"
        />
        <Button type="button" size="icon" variant="secondary" aria-label={`Add ${title} detail`} onClick={addChip}>
          <Plus className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function EditableChip({
  value,
  onSave,
  onRemove,
}: {
  value: string;
  onSave: (value: string) => void;
  onRemove: () => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  if (isEditing) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-card px-2 py-1 shadow-sm">
        <Input
          value={draft}
          autoFocus
          aria-label={`Edit ${value}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSave(draft);
              setIsEditing(false);
            }

            if (event.key === "Escape") {
              setDraft(value);
              setIsEditing(false);
            }
          }}
          className="h-7 min-w-32 border-0 bg-transparent px-2 py-0 shadow-none focus-visible:ring-0"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 rounded-full"
          aria-label="Save chip"
          onClick={() => {
            onSave(draft);
            setIsEditing(false);
          }}
        >
          <Check className="size-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "group inline-flex max-w-full items-center gap-1 rounded-full border border-primary/10",
        "bg-gradient-to-r from-secondary via-card to-accent/50 px-3 py-1.5 text-sm text-foreground shadow-sm",
      )}
    >
      <span className="truncate">{value}</span>
      <button
        type="button"
        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
        aria-label={`Edit ${value}`}
        onClick={() => setIsEditing(true)}
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-background/70 hover:text-destructive"
        aria-label={`Remove ${value}`}
        onClick={onRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
