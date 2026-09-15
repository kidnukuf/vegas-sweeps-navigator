import { ArrowRight, BarChart3, ClipboardCheck, UsersRound } from "lucide-react";

export default function BowlVegasGrowthBanner({ className = "" }: { className?: string }) {
  return (
    <a
      href="/event-directors"
      className={`group relative block overflow-hidden rounded-2xl border border-cyan-300/25 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,.2),transparent_35%),linear-gradient(120deg,#10162c,#24134a_55%,#0b2435)] p-5 text-white shadow-xl shadow-cyan-950/20 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-200/60 hover:shadow-cyan-950/40 active:scale-[.99] ${className}`}
      aria-label="See how Bowl Vegas can simplify event coordination"
      data-testid="bowl-vegas-growth-banner"
    >
      <div className="absolute -right-12 -top-14 h-40 w-40 rounded-full border border-cyan-200/20 bg-cyan-300/10 blur-2xl transition group-hover:bg-cyan-300/20" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-cyan-200">For future event directors</p>
          <h2 className="mt-2 text-xl font-black leading-tight sm:text-2xl">Make the next large bowling event easier to coordinate.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-200/80">
            See how Bowl Vegas brings roster information, coordinator handoffs, QR passes, check-in tools, and operational backups into one event workspace.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-xl border border-cyan-200/25 bg-black/20 px-4 py-3 text-sm font-bold text-cyan-100 backdrop-blur-sm">
          <span className="hidden gap-1 text-cyan-200/80 sm:flex" aria-hidden="true">
            <UsersRound className="h-4 w-4" /><ClipboardCheck className="h-4 w-4" /><BarChart3 className="h-4 w-4" />
          </span>
          <span>Explore the workflow</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </a>
  );
}
