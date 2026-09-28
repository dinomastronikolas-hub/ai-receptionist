import { Bell, Flame, Lock, UsersRound } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { ButtonLink } from "@/components/ui/button";

// Decorative illustration only (not user data): a deterministic pattern.
function DemoGrid({ hex, seed, streak }: { hex: string; seed: number; streak: number }) {
  const cells = Array.from({ length: 7 * 18 }, (_, i) => {
    const recent = i >= 7 * 18 - streak;
    const v = Math.abs(Math.sin(seed * 9301 + i * 49297)) % 1;
    return recent || v > 0.28 ? (v > 0.82 && !recent ? 0.55 : 1) : 0;
  });
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[3px]" aria-hidden>
      {cells.map((o, i) => (
        <span key={i} className="size-[11px] rounded-[3px] sm:size-3" style={o ? { background: hex, opacity: o } : { background: "var(--cell-missed)" }} />
      ))}
    </div>
  );
}

const FEATURES = [
  { icon: Flame, title: "Streaks that respect your schedule", body: "Gym on Mon/Wed/Fri? Tuesday never breaks your streak." },
  { icon: UsersRound, title: "Private groups", body: "Invite friends with a link and see each other's progress every day." },
  { icon: Lock, title: "Private when you want", body: "Mark any habit private — it's never shared, enforced by the database." },
  { icon: Bell, title: "Installable & fast", body: "Add it to your home screen. One tap to check off a habit." },
];

export default function Landing() {
  return (
    <div className="pt-safe pb-safe min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo />
        <ButtonLink href="/login" variant="ghost" size="sm">
          Log in
        </ButtonLink>
      </header>
      <main className="mx-auto max-w-5xl px-5">
        <section className="grid items-center gap-12 py-10 md:grid-cols-2 md:py-20">
          <div>
            <h1 className="text-[44px] leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl">Habits, together.</h1>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
              Check off your habits every day, keep your streaks alive, and hold each other accountable with a private group of friends.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">
                Get started — it&apos;s free
              </ButtonLink>
              <ButtonLink href="/join" size="lg" variant="secondary">
                I have an invite
              </ButtonLink>
            </div>
          </div>
          <div className="space-y-4 rounded-[32px] bg-elevated p-5 shadow-float sm:p-6">
            {[
              { name: "Gym", emoji: "🏋️", hex: "#f97316", seed: 3, streak: 14, who: "Alex" },
              { name: "10K steps", emoji: "👟", hex: "#10b981", seed: 7, streak: 21, who: "Mike" },
              { name: "Study", emoji: "📚", hex: "#3b82f6", seed: 11, streak: 6, who: "Sam" },
            ].map((d) => (
              <div key={d.name}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-semibold">
                    {d.emoji} {d.name} <span className="font-normal text-muted">· {d.who}</span>
                  </span>
                  <span className="text-sm font-bold" style={{ color: d.hex }}>
                    🔥 {d.streak} days
                  </span>
                </div>
                <div className="overflow-hidden">
                  <DemoGrid hex={d.hex} seed={d.seed} streak={d.streak} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-3xl bg-elevated p-5 shadow-card">
              <f.icon className="mb-3 size-6 text-brand" />
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
