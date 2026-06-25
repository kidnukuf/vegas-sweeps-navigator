import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

/**
 * AdRotator — sponsor advertisement slot for the Bowler & Captain portals.
 *
 * Tiered weighted rotation:
 *   Gold   → weight 4  (twice the visibility of Silver)
 *   Silver → weight 2  (twice the visibility of Bronze)
 *   Bronze → weight 1
 *
 * A weighted playlist is built once per load (no per-tick server calls). Each
 * slot rotates through its own shuffled copy so two slots rarely show the same
 * sponsor at the same moment. Images cross-fade every ~8s; videos play through
 * once (muted autoplay) then advance. Respects prefers-reduced-motion by
 * disabling the auto-advance timer (still tappable / first ad shown).
 */

type Ad = {
  id: number;
  sponsorName: string;
  tier: "bronze" | "silver" | "gold";
  category: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  linkUrl?: string | null;
};

const TIER_WEIGHT: Record<Ad["tier"], number> = { gold: 4, silver: 2, bronze: 1 };
const ROTATE_MS = 8000;

function buildWeightedPlaylist(ads: Ad[], seedOffset: number): Ad[] {
  // Expand each ad by its tier weight, then shuffle deterministically-ish.
  const expanded: Ad[] = [];
  for (const ad of ads) {
    const w = TIER_WEIGHT[ad.tier] ?? 1;
    for (let i = 0; i < w; i++) expanded.push(ad);
  }
  // Fisher-Yates with a light seed so the two slots differ.
  let s = seedOffset + 1;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = expanded.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [expanded[i], expanded[j]] = [expanded[j], expanded[i]];
  }
  return expanded;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AdRotator({
  eventId,
  slot = 0,
  className = "",
}: {
  eventId: number | null | undefined;
  slot?: number;
  className?: string;
}) {
  const { data } = trpc.ads.listActive.useQuery(
    { eventId: eventId ?? 0 },
    { enabled: !!eventId, staleTime: 5 * 60 * 1000 }
  );

  const ads = (data ?? []) as Ad[];
  const playlist = useMemo(() => buildWeightedPlaylist(ads, slot), [ads, slot]);
  const [idx, setIdx] = useState(0);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);

  const current = playlist.length > 0 ? playlist[idx % playlist.length] : null;

  // Auto-advance for images (videos advance onEnded).
  useEffect(() => {
    if (!current || reduced || playlist.length <= 1) return;
    if (current.mediaType === "video") return; // video drives its own advance
    const t = setTimeout(() => setIdx((i) => (i + 1) % playlist.length), ROTATE_MS);
    return () => clearTimeout(t);
  }, [current, idx, playlist.length, reduced]);

  if (!current) return null;

  const advance = () => setIdx((i) => (i + 1) % Math.max(playlist.length, 1));

  const media =
    current.mediaType === "video" ? (
      <div className="relative h-full w-full">
        <video
          ref={videoRef}
          src={current.mediaUrl}
          autoPlay
          muted={muted}
          playsInline
          loop={playlist.length <= 1}
          onEnded={() => { if (playlist.length > 1 && !reduced) advance(); }}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMuted((m) => !m); }}
          className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm transition hover:bg-black/70"
          aria-label={muted ? "Unmute ad" : "Mute ad"}
        >
          {muted ? "🔇 Tap for sound" : "🔊 Sound on"}
        </button>
      </div>
    ) : (
      <img
        src={current.mediaUrl}
        alt={current.sponsorName}
        className="h-full w-full object-cover transition-opacity duration-500"
      />
    );

  const tierBadge =
    current.tier === "gold" ? "bg-amber-400/90 text-amber-950"
    : current.tier === "silver" ? "bg-slate-300/90 text-slate-800"
    : "bg-orange-300/80 text-orange-950";

  const inner = (
    <div className={`relative aspect-[16/6] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-md ${className}`}>
      {media}
      {/* Subtle, non-obnoxious sponsor labelling */}
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5">
        <span className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/80 backdrop-blur-sm">
          Sponsor
        </span>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tierBadge}`}>
          {current.tier}
        </span>
      </div>
      {/* dot indicators for distinct sponsors */}
      {ads.length > 1 && (
        <div className="pointer-events-none absolute bottom-2 left-2 flex gap-1">
          {ads.map((a) => (
            <span
              key={a.id}
              className={`h-1.5 w-1.5 rounded-full ${a.id === current.id ? "bg-white/90" : "bg-white/35"}`}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (current.linkUrl) {
    return (
      <a
        href={current.linkUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block transition-transform active:scale-[0.99]"
        title={`Visit ${current.sponsorName}`}
      >
        {inner}
      </a>
    );
  }
  return inner;
}

export default AdRotator;
