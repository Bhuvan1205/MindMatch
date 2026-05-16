import { getInitials } from "@/lib/profile/initials";
import { cn } from "@/lib/utils";

export function IdentityAvatar({
  name,
  size = "md",
  className,
}: {
  name: string | null;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white/70 bg-[radial-gradient(circle_at_35%_30%,hsl(var(--accent)),hsl(var(--secondary))_52%,hsl(var(--primary)/0.2))] font-semibold text-primary shadow-sm dark:border-white/10",
        size === "md" && "size-12 text-base",
        size === "lg" && "size-20 text-2xl",
        size === "xl" && "size-24 text-3xl shadow-soft",
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
