export function NeuralOrb() {
  return (
    <div
      className="relative size-72 animate-orb-float rounded-full border border-white/50 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.95),rgba(195,183,255,0.68)_30%,rgba(112,231,221,0.32)_58%,rgba(255,255,255,0)_72%)] shadow-soft md:size-96"
      aria-hidden="true"
    >
      <div className="absolute inset-8 rounded-full border border-primary/15" />
      <div className="absolute inset-16 rounded-full border border-accent/60" />
      <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_34px_hsl(var(--primary)/0.62)]" />
      <div className="absolute left-24 top-20 size-2 rounded-full bg-accent" />
      <div className="absolute bottom-24 right-20 size-2 rounded-full bg-primary/80" />
    </div>
  );
}
