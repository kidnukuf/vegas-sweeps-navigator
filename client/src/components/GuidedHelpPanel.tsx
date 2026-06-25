import { useEffect, useState } from "react";
import { ChevronDown, GraduationCap, Lightbulb, ArrowRight, HelpCircle } from "lucide-react";

const STORAGE_PREFIX = "vsn_help_panel_";

export type GuidedHelpPanelProps = {
  /** Stable unique key used to persist this panel's open/closed state. */
  panelKey: string;
  /** Step number shown in the header (e.g. 2). Optional. */
  step?: number;
  /** Short title for this step. */
  title: string;
  /** One-line summary shown next to the title. */
  summary?: string;
  /** Plain, jargon-free explanation for a first-time ED. */
  layman: string;
  /** Vocabulary-rich explanation for an experienced ED. */
  expert: string;
  /** "What's next & why this order matters" guidance. */
  next?: string;
  /** Default open on first ever view. Defaults to true. */
  defaultOpen?: boolean;
};

export default function GuidedHelpPanel({
  panelKey,
  step,
  title,
  summary,
  layman,
  expert,
  next,
  defaultOpen = true,
}: GuidedHelpPanelProps) {
  const storageKey = `${STORAGE_PREFIX}${panelKey}`;
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) setOpen(saved === "1");
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const nextVal = !prev;
      try {
        localStorage.setItem(storageKey, nextVal ? "1" : "0");
      } catch {
        /* ignore */
      }
      return nextVal;
    });
  };

  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-500/5 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sky-500/10"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-300">
          {step != null ? <span className="text-sm font-semibold">{step}</span> : <HelpCircle className="h-4 w-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-sky-100">{title}</span>
          {summary && <span className="block text-xs text-sky-200/60 truncate">{summary}</span>}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-sky-300 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.23,1,0.32,1)" }}
        />
      </button>

      {hydrated && open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-lg bg-background/40 border border-border/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 mb-1">
              <Lightbulb className="h-3.5 w-3.5" /> In plain terms
            </p>
            <p className="text-sm text-foreground/85 leading-relaxed">{layman}</p>
          </div>
          <div className="rounded-lg bg-background/40 border border-border/40 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300 mb-1">
              <GraduationCap className="h-3.5 w-3.5" /> For the seasoned director
            </p>
            <p className="text-sm text-foreground/85 leading-relaxed">{expert}</p>
          </div>
          {next && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-400/30 p-3">
              <ArrowRight className="h-4 w-4 shrink-0 text-amber-300 mt-0.5" />
              <p className="text-sm text-amber-100/90 leading-relaxed">
                <span className="font-semibold">What's next &amp; why:</span> {next}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
