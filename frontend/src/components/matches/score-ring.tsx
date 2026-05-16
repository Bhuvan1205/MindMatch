export function ScoreRing({ score }: { score: number }) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));

  return (
    <div
      className="flex size-16 items-center justify-center rounded-full p-1"
      role="img"
      style={{
        background: `conic-gradient(hsl(var(--primary)) ${normalizedScore * 3.6}deg, hsl(var(--secondary)) 0deg)`,
      }}
      aria-label={`Compatibility score ${normalizedScore} out of 100`}
    >
      <div className="flex size-full items-center justify-center rounded-full bg-card text-sm font-semibold">
        {normalizedScore}
      </div>
    </div>
  );
}
