import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center py-20">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">404</p>
        <h1 className="mt-4 text-pretty text-2xl font-medium tracking-tight">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          This part of MindMatch has not been built yet.
        </p>
        <Button asChild className="mt-8">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </section>
  );
}
