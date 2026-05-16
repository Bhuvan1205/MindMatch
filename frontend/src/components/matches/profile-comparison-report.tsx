import type { CognitiveProfile } from "@/lib/api/types";
import { profileCategories } from "@/lib/profile/categories";
import { CheckCircle2, ChevronRight } from "lucide-react";

export function ProfileComparisonReport({ 
  matchProfile, 
  myProfile 
}: { 
  matchProfile: CognitiveProfile;
  myProfile: CognitiveProfile;
}) {
  // Simple helper to find overlapping concepts (basic word overlap)
  const isSimilar = (text1: string, text2: string) => {
    if (!text1 || !text2) return false;
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return words1.some(w => words2.includes(w));
  };

  return (
    <div className="flex flex-col gap-8 rounded-xl border bg-card/40 p-6 shadow-sm">
      {profileCategories.map((category) => {
        const matchValues = matchProfile[category.key] || [];
        const myValues = myProfile[category.key] || [];

        if (matchValues.length === 0) return null;

        return (
          <section key={category.key} className="border-b border-border/50 pb-6 last:border-0 last:pb-0">
            <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.18em] text-foreground">
              {category.label}
            </h3>
            
            <ul className="space-y-3">
              {matchValues.map((value, index) => {
                const hasOverlap = myValues.some(myVal => isSimilar(value, myVal));
                
                return (
                  <li key={`${value}-${index}`} className="flex items-start gap-3">
                    {hasOverlap ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                    ) : (
                      <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground/60" />
                    )}
                    <div className="flex-1 leading-relaxed text-[15px]">
                      <span className={hasOverlap ? "font-medium text-foreground" : "text-muted-foreground"}>
                        {value}
                      </span>
                      {hasOverlap && (
                        <span className="ml-3 inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-primary align-middle">
                          SHARED TRAIT
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
