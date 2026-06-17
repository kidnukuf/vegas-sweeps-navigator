// Sponsor Ad Banner — Static image slots for event sponsors
// The Event Director uploads sponsor images; these are displayed on Bowler and Captain pages

interface SponsorAdBannerProps {
  slot?: "top" | "bottom" | "sidebar";
  className?: string;
}

// Placeholder sponsor data — replace with real sponsor images via admin upload
const SPONSORS = [
  {
    id: 1,
    name: "B.O.B. Roll-off Passport Official Sponsor",
    tagline: "Your Ad Here — Contact Event Director",
    bgColor: "from-yellow-900/30 to-yellow-800/10",
    borderColor: "border-yellow-500/30",
    textColor: "text-yellow-400",
  },
  {
    id: 2,
    name: "Funtime Bowling Supplies",
    tagline: "Premium bowling gear for champions",
    bgColor: "from-cyan-900/30 to-cyan-800/10",
    borderColor: "border-cyan-500/30",
    textColor: "text-cyan-400",
  },
];

export function SponsorAdBanner({ slot = "bottom", className = "" }: SponsorAdBannerProps) {
  // Pick a sponsor based on slot to avoid showing the same one twice
  const sponsor = SPONSORS[slot === "top" ? 0 : 1];

  return (
    <div
      className={`rounded-xl border bg-gradient-to-r ${sponsor.bgColor} ${sponsor.borderColor} p-3 flex items-center gap-3 ${className}`}
      role="complementary"
      aria-label="Sponsor advertisement"
    >
      {/* Sponsor logo placeholder */}
      <div className={`w-10 h-10 rounded-lg border ${sponsor.borderColor} flex items-center justify-center flex-shrink-0`}>
        <span className="text-xl">🎳</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-bold ${sponsor.textColor} truncate`}>{sponsor.name}</div>
        <div className="text-xs text-gray-500 truncate">{sponsor.tagline}</div>
      </div>
      <div className="text-xs text-gray-600 flex-shrink-0">AD</div>
    </div>
  );
}

export function SponsorAdSidebar({ className = "" }: { className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {SPONSORS.map((sponsor) => (
        <div
          key={sponsor.id}
          className={`rounded-xl border bg-gradient-to-b ${sponsor.bgColor} ${sponsor.borderColor} p-4 text-center`}
        >
          <div className="text-3xl mb-2">🎳</div>
          <div className={`text-sm font-bold ${sponsor.textColor}`}>{sponsor.name}</div>
          <div className="text-xs text-gray-500 mt-1">{sponsor.tagline}</div>
          <div className="text-xs text-gray-600 mt-2">SPONSORED</div>
        </div>
      ))}
    </div>
  );
}
