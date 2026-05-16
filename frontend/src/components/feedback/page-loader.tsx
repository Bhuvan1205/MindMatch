import { Loader2 } from "lucide-react";

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-20">
      <div className="flex items-center gap-3 rounded-full border bg-card/70 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>{label}</span>
      </div>
    </section>
  );
}
