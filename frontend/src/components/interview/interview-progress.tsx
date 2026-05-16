import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export function InterviewProgress({
  questionIndex,
  totalQuestions,
  isLoading,
}: {
  questionIndex: number;
  totalQuestions: number;
  isLoading: boolean;
}) {
  const progress = totalQuestions > 0 ? ((questionIndex + 1) / totalQuestions) * 100 : 0;

  return (
    <div className="sticky top-16 z-20 -mx-5 border-b bg-background/72 px-5 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : (
        <div className="space-y-3">
          <Progress value={progress} />
          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            <span aria-live="polite">Question {questionIndex + 1}</span>
            <span>{totalQuestions} total</span>
          </div>
        </div>
      )}
    </div>
  );
}
