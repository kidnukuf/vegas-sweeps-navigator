/**
 * BowlerDashboard — personal portal for a signed-in bowler
 * Layout (top → bottom):
 *  1. Header
 *  2. Profile card
 *  3. Animated "Lane to Banquet" clickable placard
 *  4. Event Details card
 *  5. Hotel card (if present)
 *  6. Payment card (if present)
 *  7. Contact Info card
 *  8. ── QR PASSPORT SECTION ──
 *     a. My Entry Ticket (bowling check-in)
 *     b. Banquet Dinner Passport QR
 *     c. Pool Party Passport QR
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getBowlerToken, clearBowlerSession, BOWLER_IS_CAPTAIN_KEY } from "./BowlerLogin";
import { normalizeSquadTime } from "@/lib/squadTime";
import { detectGroupSlug, GROUP_THEMES } from "@/lib/eventGroup";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pre_registered: "bg-zinc-600 text-zinc-200",
    signed_up: "bg-blue-700 text-blue-100",
    verified: "bg-emerald-700 text-emerald-100",
    checked_in: "bg-amber-600 text-amber-100",
    unmatched: "bg-red-700 text-red-100",
  };
  const label: Record<string, string> = {
    pre_registered: "Pre-Registered",
    signed_up: "Signed Up",
    verified: "Verified",
    checked_in: "Checked In ✓",
    unmatched: "Unmatched",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? "bg-zinc-700 text-zinc-200"}`}>
      {label[status] ?? status}
    </span>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/10 last:border-0">
      <span className="text-lg w-6 text-center flex-shrink-0">{icon}</span>
      <div>
        <p className="text-white/70 text-xs">{label}</p>
        <p className="text-white font-semibold text-sm">{value}</p>
      </div>
    </div>
  );
}

// ─── Animated "Lane to Banquet" placard ───────────────────────────────────────
function LaneToBanquetPlacard({ laneToEvent, laneNumber, squadTime }: {
  laneToEvent?: string | null;
  laneNumber?: number | null;
  squadTime?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);

  function handleClick() {
    if (!open) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 600);
    }
    setOpen(o => !o);
  }

  const hasInfo = laneToEvent || laneNumber || squadTime;
  if (!hasInfo) return null;

  return (
    <div
      className={`bowler-card cursor-pointer select-none transition-all duration-300 ${open ? "ring-2 ring-amber-400/60" : "hover:ring-1 hover:ring-amber-400/30"}`}
      onClick={handleClick}
      role="button"
      aria-expanded={open}
    >
      {/* Collapsed header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🗺️</span>
          <div>
            <p className="text-amber-300 font-bold text-sm tracking-wide">Lane to Banquet</p>
            <p className="text-white/75 text-xs">Tap to see your event directions</p>
          </div>
        </div>
        <span
          className={`text-amber-300 text-lg transition-transform duration-300 ${open ? "rotate-90" : "rotate-0"}`}
          aria-hidden="true"
        >
          ▶
        </span>
      </div>

      {/* Expanded content with slide-down animation */}
      <div
        className={`overflow-hidden transition-all duration-500 ease-out ${open ? "max-h-96 opacity-100 mt-4" : "max-h-0 opacity-0 mt-0"}`}
      >
        {/* Animated shimmer bar when opening */}
        {animating && (
          <div className="h-0.5 w-full rounded-full bg-gradient-to-r from-transparent via-amber-400 to-transparent mb-3 animate-pulse" />
        )}

        <div className="space-y-3 pt-1 border-t border-white/10">
          {laneNumber && (
            <div className="flex items-center gap-3">
              <span className="text-lg">🎳</span>
              <div>
                <p className="text-white/75 text-xs">Your Starting Lane</p>
                <p className="text-white font-bold text-base">Lane {laneNumber}</p>
              </div>
            </div>
          )}
          {squadTime && (
            <div className="flex items-center gap-3">
              <span className="text-lg">🕐</span>
              <div>
                <p className="text-white/75 text-xs">Squad Time</p>
                <p className="text-white font-semibold text-sm">{normalizeSquadTime(squadTime)}</p>
              </div>
            </div>
          )}
          {laneToEvent && (
            <div className="flex items-start gap-3">
              <span className="text-lg">📍</span>
              <div>
                <p className="text-white/75 text-xs">Lane to Banquet Directions</p>
                <p className="text-amber-200 font-semibold text-sm leading-relaxed">{laneToEvent}</p>
              </div>
            </div>
          )}

          {/* Static entrance flow info */}
          <div className="mt-3 space-y-2">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-amber-300 text-xs font-semibold mb-1">⏰ Arrive 30 Minutes Early</p>
              <p className="text-white/70 text-xs leading-relaxed">
                Lines can be long at event entry. Please plan to arrive at least 30 minutes before your squad time.
                Have your QR Passport ready on your phone for quick scanning at the door.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <p className="text-cyan-300 text-xs font-semibold mb-1">🎳 Practice Reminder</p>
              <p className="text-white/70 text-xs leading-relaxed">
                Practice begins <span className="text-white font-semibold">10 minutes before</span> your squad time. Don't be late!
              </p>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <p className="text-purple-300 text-xs font-semibold mb-1">🏆 Side Pots &amp; Brackets</p>
              <p className="text-white/70 text-xs leading-relaxed">
                Side pots and brackets are available at the <span className="text-white font-semibold">front desk</span>. See the desk before your squad begins.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Download QR helper ─────────────────────────────────────────────────────
function downloadQR(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── QR Ticket (bowling entry) ────────────────────────────────────────────────
function QRTicket({ bowlerId, scantronId }: { bowlerId: number; scantronId?: string | null }) {
  const tokenQuery = trpc.tokens.getForBowler.useQuery({ bowlerId });
  const generateToken = trpc.tokens.generate.useMutation({
    onSuccess: () => tokenQuery.refetch(),
    onError: (e) => toast.error(e.message),
  });

  if (tokenQuery.isLoading) return <Skeleton className="h-48 w-48 mx-auto rounded-xl" />;

  if (!tokenQuery.data?.qrDataUrl) {
    return (
      <div className="text-center">
        <p className="text-white/50 text-sm mb-3">No QR ticket yet</p>
        <Button
          className="bowler-btn-secondary"
          onClick={() => generateToken.mutate({ bowlerId, eventId: 1 })}
          disabled={generateToken.isPending}
        >
          {generateToken.isPending ? "Generating…" : "Generate My QR Ticket"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="qr-ticket-frame p-3 rounded-2xl bg-white shadow-2xl">
        <img src={tokenQuery.data.qrDataUrl} alt="QR Ticket" className="w-44 h-44 rounded-lg" />
      </div>
      <p className="text-white/50 text-xs text-center">
        Show this at the door{scantronId ? <> · Scantron: <span className="font-mono text-amber-300">{scantronId}</span></> : null}
      </p>
      <Button
        size="sm"
        className="bowler-btn-secondary w-full mt-1"
        onClick={() => downloadQR(tokenQuery.data!.qrDataUrl!, "BOB-Entry-Ticket.png")}
      >
        ⬇ Download Ticket
      </Button>
    </div>
  );
}

// ─── Passport QR box (banquet / pool party) ───────────────────────────────────
interface PassportBoxProps {
  title: string;
  icon: string;
  subtitle: string;
  checkInTime?: string;
  entranceFlow: string;
  qrDataUrl: string | null | undefined;
  tokenUsed: boolean;
  eligible: boolean;
}

function PassportBox({ title, icon, subtitle, checkInTime, entranceFlow, qrDataUrl, tokenUsed, eligible }: PassportBoxProps) {
  const [revealed, setRevealed] = useState(false);
  const [animating, setAnimating] = useState(false);

  function handleReveal() {
    setAnimating(true);
    setRevealed(true);
    setTimeout(() => setAnimating(false), 700);
  }

  return (
    <div className="bowler-card space-y-4" style={{ background: "rgba(10,10,20,0.88)", border: "1.5px solid rgba(255,200,50,0.25)" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-4xl">{icon}</span>
        <div>
          <h3 className="text-white font-extrabold text-xl" style={{ textShadow: "0 0 8px rgba(255,200,50,0.6)" }}>{title}</h3>
          <p className="text-amber-200 text-sm font-semibold">{subtitle}</p>
        </div>
      </div>

      {/* Check-in time */}
      {checkInTime && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,180,0,0.12)", border: "1px solid rgba(255,180,0,0.3)" }}>
          <span className="text-xl">⏰</span>
          <div>
            <p className="text-amber-200 text-sm font-semibold">Check-in Begins</p>
            <p className="text-amber-300 font-bold text-base">{checkInTime}</p>
          </div>
        </div>
      )}

      {/* QR code area */}
      {!eligible ? (
        <div className="text-center py-5 px-4 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)" }}>
          <p className="text-white font-semibold text-base leading-relaxed" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            If you are interested in attending, please see your team captain before the event begins.
          </p>
        </div>
      ) : tokenUsed ? (
        <div className="text-center py-5 px-4 rounded-xl" style={{ background: "rgba(0,80,40,0.4)", border: "1px solid rgba(52,211,153,0.4)" }}>
          <p className="text-emerald-300 font-bold text-lg" style={{ textShadow: "0 0 8px rgba(52,211,153,0.5)" }}>✓ Passport Redeemed</p>
          <p className="text-white text-sm mt-2" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>This QR code has been scanned at the door.</p>
        </div>
      ) : qrDataUrl ? (
        <div className="flex flex-col items-center gap-4">
          {!revealed ? (
            /* ── Tap-to-reveal button ── */
            <button
              onClick={handleReveal}
              className="w-full py-5 rounded-2xl flex flex-col items-center gap-3 cursor-pointer select-none transition-all duration-200 active:scale-95"
              style={{
                background: "linear-gradient(135deg, rgba(255,180,0,0.18) 0%, rgba(255,100,0,0.12) 100%)",
                border: "2px dashed rgba(255,180,0,0.5)",
                boxShadow: "0 0 20px rgba(255,180,0,0.15)",
              }}
            >
              <span className="text-5xl">{icon}</span>
              <span className="text-amber-300 font-extrabold text-xl" style={{ textShadow: "0 0 10px rgba(255,180,0,0.7)" }}>
                Tap to Show QR Code
              </span>
              <span className="text-white text-sm" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                {title}
              </span>
            </button>
          ) : (
            /* ── QR revealed ── */
            <div
              className={`flex flex-col items-center gap-3 w-full transition-all duration-700 ease-out ${animating ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}
            >
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{ boxShadow: "0 0 30px rgba(255,180,0,0.4), 0 0 60px rgba(255,180,0,0.2)" }}
                />
                <div className="p-4 rounded-2xl bg-white shadow-2xl">
                  <img src={qrDataUrl} alt={`${title} QR Code`} className="w-52 h-52 rounded-lg" />
                </div>
              </div>
              <p className="text-white font-semibold text-sm text-center" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                Present this QR code at the {title.toLowerCase()} entrance
              </p>
              <Button
                size="sm"
                className="bowler-btn-secondary w-full text-base py-3"
                onClick={() => downloadQR(qrDataUrl, `BOB-${title.replace(/\s+/g, "-")}-Passport.png`)}
              >
                ⬇ Download Ticket
              </Button>
              <button
                onClick={() => setRevealed(false)}
                className="text-white/50 text-xs underline mt-1"
              >
                Hide QR
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-3">
          <p className="text-white/70 text-sm mb-3" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>Your QR passport is being prepared.</p>
          <p className="text-white/50 text-xs">Please sign out and sign back in to refresh.</p>
        </div>
      )}

      {/* Entrance flow explanation */}
      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <p className="text-white/85 text-xs font-semibold mb-1">🚪 How Entry Works</p>
        <p className="text-white/85 text-xs leading-relaxed">{entranceFlow}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BowlerDashboard() {
  const [, navigate] = useLocation();
  const token = getBowlerToken();
  const isCapitain = localStorage.getItem(BOWLER_IS_CAPTAIN_KEY) === "1";

  useEffect(() => {
    if (!token) navigate("/bowler-login");
  }, [token, navigate]);

  const profileQuery = trpc.bowlerAuth.me.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  function handleLogout() {
    clearBowlerSession();
    navigate("/bowler-login");
  }

  if (profileQuery.isLoading) {
    return (
      <div className="bowler-portal-bg min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-md px-4">
          <Skeleton className="h-8 w-48 mx-auto bg-white/10" />
          <Skeleton className="h-48 w-full bg-white/10 rounded-2xl" />
          <Skeleton className="h-32 w-full bg-white/10 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (profileQuery.error) {
    return (
      <div className="bowler-portal-bg min-h-screen flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-red-400 mb-4">{profileQuery.error.message}</p>
          <Button className="bowler-btn-secondary" onClick={handleLogout}>Sign In Again</Button>
        </div>
      </div>
    );
  }

  const p = profileQuery.data;
  if (!p) return null;

  const displayName = p.preferredName || `${p.legalFirstName} ${p.legalLastName}`;

  // Eligibility: token present means eligible (null = disabled by Event Director)
  const banquetEligible = p.banquetToken !== null && p.banquetToken !== undefined;
  const poolEligible = p.poolPartyToken !== null && p.poolPartyToken !== undefined;

  return (
    <div className="bowler-portal-bg min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="bowler-portal-header px-4 py-3 flex items-center justify-between">
        {(() => {
          const groupSlug = detectGroupSlug();
          const groupTheme = GROUP_THEMES[groupSlug];
          const primaryColor = groupTheme.color;
          const logoUrl = groupTheme.logoUrl ?? "/manus-storage/bob-logo_c7d62f79.jpg";
          return (
            <div className="flex items-center gap-2 bob-header-group cursor-default select-none">
              <img
                src={logoUrl}
                alt={groupTheme.name}
                className="w-10 h-10 rounded-xl object-cover"
                style={{ filter: `drop-shadow(0 0 6px ${primaryColor}80)` }}
              />
              <div className="flex flex-col leading-tight">
                <span className="bob-header-title font-bold text-white text-sm" style={{ fontFamily: "'Orbitron', sans-serif" }}>{groupTheme.name}</span>
                <span className="bob-header-subtitle text-xs font-semibold tracking-wider" style={{ color: primaryColor }}>{groupTheme.description}</span>
              </div>
            </div>
          );
        })()}
        <div className="flex items-center gap-2">
          {isCapitain && (
            <Button
              size="sm"
              className="bowler-btn-secondary text-xs"
              onClick={() => navigate("/captain-dashboard")}
            >
              ⭐ My Team
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-white/60 hover:text-white text-xs" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full space-y-4">

        {/* ── 1. Profile Card ── */}
        <div className="bowler-card">
          <div className="flex items-center gap-4">
            <div className="bowler-avatar">
              <span className="text-3xl">🎳</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white truncate">{displayName}</h2>
              <p className="text-white/60 text-sm truncate">{p.centerName ?? "—"}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <StatusBadge status={p.registrationStatus} />
                {Boolean(p.isCapitain) && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ⭐ Team Captain
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Lane to Banquet animated placard ── */}
        <LaneToBanquetPlacard
          laneToEvent={p.laneToEvent}
          laneNumber={p.laneNumber}
          squadTime={p.squadTime}
        />

        {/* ── 3. Event Details ── */}
        <div className="bowler-card">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>📅</span> Event Details
          </h3>
          <InfoRow icon="🏆" label="Event" value={p.eventName ?? undefined} />
          <InfoRow icon="📍" label="Bowling Center" value={p.centerName ?? undefined} />
          <InfoRow icon="👥" label="Team" value={p.teamName ? `${p.teamName} (${p.teamCode})` : undefined} />
          <InfoRow icon="📆" label="Bowling Date" value={p.bowlingDate ?? undefined} />
        </div>

        {/* ── 4. Hotel Info ── */}
        {p.hotelName && (
          <div className="bowler-card">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span>🏨</span> Hotel Reservation
            </h3>
            <InfoRow icon="🏨" label="Hotel" value={p.hotelName} />
            <InfoRow icon="📅" label="Check-In" value={p.checkinDate ?? undefined} />
            <InfoRow icon="📅" label="Check-Out" value={p.checkoutDate ?? undefined} />
            <InfoRow icon="🛏️" label="Room Type" value={p.roomType ?? undefined} />
          </div>
        )}

        {/* ── 5. Payment Status ── */}
        {p.totalAmountDue && (
          <div className="bowler-card">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span>💳</span> Payment
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">Total Due</span>
              <span className="text-white font-bold text-lg">${Number(p.totalAmountDue).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-white/60 text-sm">Status</span>
              {p.paid ? (
                <span className="text-emerald-400 font-semibold text-sm">✓ Paid</span>
              ) : (
                <span className="text-red-400 font-semibold text-sm">⚠ Outstanding</span>
              )}
            </div>
          </div>
        )}

        {/* ── 6. Contact Info ── */}
        <div className="bowler-card">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>📞</span> My Contact Info
          </h3>
          <InfoRow icon="📧" label="Email" value={p.email ?? undefined} />
          <InfoRow icon="📱" label="Phone" value={p.phone ?? undefined} />
          <InfoRow icon="🆔" label="Scantron ID" value={p.scantronId ?? undefined} />
          {!p.email && !p.phone && (
            <p className="text-white/40 text-sm">No contact info on file. Contact your Event Director to update.</p>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            QR PASSPORT SECTION — always at the bottom
        ══════════════════════════════════════════════════════════════════════ */}
        <div className="pt-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/40 text-xs font-semibold tracking-widest uppercase">QR Passports</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>
        </div>

        {/* ── 7. My Entry Ticket (bowling check-in QR) ── */}
        <div className="bowler-card text-center">
          <h3 className="text-white font-semibold mb-4 flex items-center justify-center gap-2">
            <span>🎫</span> My Entry Ticket
          </h3>
          <p className="text-white/50 text-xs mb-4">
            Present this QR code at the bowling center entrance on your squad day.
          </p>
          <QRTicket bowlerId={p.id} scantronId={p.scantronId} />
          <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10 text-left">
            <p className="text-white/50 text-xs font-semibold mb-1">🚪 How Entry Works</p>
            <p className="text-white/70 text-xs leading-relaxed">
              A doorman will scan your QR code at the entrance. Once scanned, your ticket is marked as used.
              You will receive a wristband for re-entry. Please arrive at least 30 minutes before your squad time — lines can be long.
              Practice starts <span className="text-amber-300 font-semibold">10 minutes before</span> your squad time. Side pots &amp; brackets are available at the <span className="text-amber-300 font-semibold">front desk</span>.
            </p>
          </div>
        </div>

        {/* ── 8. Banquet Dinner Passport ── */}
        <PassportBox
          title="Banquet Dinner Passport"
          icon="🍽️"
          subtitle="Funtime Team Challenge 2026 — Banquet Dinner"
          checkInTime="6:00 PM — Check-in begins at 5:30 PM"
          entranceFlow="Present this QR code at the banquet hall entrance. A staff member will scan your code — once scanned it cannot be reused. Wristbands will be issued at the door for re-entry. If you are not on the eligible list, please see your team captain before the event begins."
          qrDataUrl={p.banquetQR}
          tokenUsed={Boolean(p.banquetUsed)}
          eligible={banquetEligible}
        />

        {/* ── 9. Pool Party Passport ── */}
        <PassportBox
          title="Pool Party Passport"
          icon="🏊"
          subtitle="Funtime Team Challenge 2026 — Pool Party"
          checkInTime="Pool Party — Check-in begins at 2:00 PM"
          entranceFlow="Show this QR code to the pool party doorman. Your code will be scanned and marked as used — one scan per person. A wristband will be issued for re-entry. If you believe you should be eligible but don't see a QR code, please contact your team captain or the Event Director."
          qrDataUrl={p.poolPartyQR}
          tokenUsed={Boolean(p.poolPartyUsed)}
          eligible={poolEligible}
        />

        {/* ── 10. Guest Pool Party Passes (A, B, C...) ── */}
        {Array.isArray((p as any).guestPoolQRs) && (p as any).guestPoolQRs.length > 0 && (
          <>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-white/40 text-xs font-semibold tracking-widest uppercase">Guest Pool Passes</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>
            {(p as any).guestPoolQRs.map((g: { suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }) => (
              <PassportBox
                key={g.suffix}
                title={`Guest Pool Pass ${g.suffix}`}
                icon="🎟️"
                subtitle={`Guest Pool Party Entry — Pass ${g.suffix}`}
                entranceFlow={`This is a guest pool party pass. Present this QR code at the pool party entrance for your guest. One scan per pass — cannot be reused. Pass ID: ${p.scantronId}${g.suffix}`}
                qrDataUrl={g.used ? null : g.qrDataUrl}
                tokenUsed={g.used}
                eligible={!g.disabled}
              />
            ))}
          </>
        )}

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
