import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card/78 p-8 text-center shadow-soft backdrop-blur-xl", className)}>
      {Icon ? (
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon className="size-5" />
        </div>
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-7">{action}</div> : null}
    </div>
  );
}
