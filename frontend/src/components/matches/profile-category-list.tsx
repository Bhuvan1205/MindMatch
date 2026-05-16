import type { CognitiveProfile } from "@/lib/api/types";
import { profileCategories } from "@/lib/profile/categories";

export function ProfileCategoryList({ profile }: { profile: CognitiveProfile }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {profileCategories.map((category) => {
        const values = profile[category.key];

        return (
          <section key={category.key} className="rounded-lg border bg-background/58 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {category.label}
            </h3>
            {values.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {values.map((value, index) => (
                  <span
                    key={`${value}-${index}`}
                    className="rounded-full border border-primary/10 bg-gradient-to-r from-secondary via-card to-accent/40 px-3 py-1.5 text-sm"
                  >
                    {value}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No details found.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
