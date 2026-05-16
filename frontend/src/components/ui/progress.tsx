import * as React from "react";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value = 0,
  "aria-label": ariaLabel = "Progress",
  ...props
}: React.ComponentProps<"div"> & { value?: number }) {
  return (
    <div
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export { Progress };
