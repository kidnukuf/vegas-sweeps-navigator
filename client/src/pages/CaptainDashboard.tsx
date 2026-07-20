/**
 * CaptainDashboard — team management portal for a signed-in Team Captain
 * Shows: captain profile, team roster, verify buttons, completion ring, shareable link
 * Design: bold, organized — darker navy with gold team accents, table-centric layout
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getBowlerToken, clearBowlerSession } from "./BowlerLogin";
import { normalizeSquadTime } from "@/lib/squadTime";
import { detectGroupSlug, GROUP_THEMES } from "@/lib/eventGroup";
import AppFooter from "@/components/AppFooter";
import LaneToBanquetPlacard, { EventTripSettings } from "@/components/LaneToBanquetPlacard";
import AdRotator from "@/components/AdRotator";

// ─── Shared helpers ─────────────────────────────────────────────────────────
function downloadQR(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

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
    <div className="captain-card space-y-4" style={{ background: "rgba(10,10,20,0.88)", border: "1.5px solid rgba(255,200,50,0.25)" }}>
      <div className="flex items-center gap-3">
        <span className="text-4xl">{icon}</span>
        <div>
          <h3 className="text-white font-extrabold text-xl" style={{ textShadow: "0 0 8px rgba(255,200,50,0.6)" }}>{title}</h3>
          <p className="text-amber-200 text-sm font-semibold">{subtitle}</p>
        </div>
      </div>
      {checkInTime && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,180,0,0.12)", border: "1px solid rgba(255,180,0,0.3)" }}>
          <span className="text-xl">⏰</span>
          <div>
            <p className="text-amber-200 text-sm font-semibold">Check-in Begins</p>
            <p className="text-amber-300 font-bold text-base">{checkInTime}</p>
          </div>
        </div>
      )}
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
              <span className="text-white text-sm" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>{title}</span>
            </button>
          ) : (
            <div className={`flex flex-col items-center gap-3 w-full transition-all duration-700 ease-out ${animating ? "opacity-0 scale-90" : "opacity-100 scale-100"}`}>
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: "0 0 30px rgba(255,180,0,0.4), 0 0 60px rgba(255,180,0,0.2)" }} />
                <div className="p-4 rounded-2xl bg-white shadow-2xl">
                  <img src={qrDataUrl} alt={`${title} QR Code`} className="w-52 h-52 rounded-lg" />
                </div>
              </div>
              <p className="text-white font-semibold text-sm text-center" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                Present this QR code at the {title.toLowerCase()} entrance
              </p>
              <Button
                size="sm"
                className="captain-btn-secondary w-full text-base py-3"
                onClick={() => downloadQR(qrDataUrl, `BOB-${title.replace(/\s+/g, "-")}-Passport.png`)}
              >
                ⬇ Download Ticket
              </Button>
              <button onClick={() => setRevealed(false)} className="text-white/50 text-xs underline mt-1">Hide QR</button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-3">
          <p className="text-white/70 text-sm mb-3" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>Your QR passport is being prepared.</p>
          <p className="text-white/50 text-xs">Please sign out and sign back in to refresh.</p>
        </div>
      )}
      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <p className="text-white/85 text-xs font-semibold mb-1">🚪 How Entry Works</p>
        <p className="text-white/85 text-xs leading-relaxed">{entranceFlow}</p>
      </div>
    </div>
  );
}


// ─── Completion ring (SVG) ────────────────────────────────────────────────────
function CompletionRing({ verified, total }: { verified: number; total: number }) {
  const pct = total > 0 ? verified / total : 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const color = pct === 1 ? "#22c55e" : pct >= 0.5 ? "#eab308" : "#6b7280";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        <text x="48" y="48" textAnchor="middle" dominantBaseline="central"
          fill="white" fontSize="18" fontWeight="bold">
          {verified}/{total}
        </text>
      </svg>
      <p className="text-white/60 text-xs">Verified</p>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status, verified }: { status: string; verified: boolean }) {
  if (verified) return <span className="captain-badge-green">✓ Verified</span>;
  const map: Record<string, string> = {
    pre_registered: "captain-badge-gray",
    signed_up: "captain-badge-blue",
    verified: "captain-badge-green",
    checked_in: "captain-badge-gold",
    unmatched: "captain-badge-red",
  };
  const label: Record<string, string> = {
    pre_registered: "Pre-Reg",
    signed_up: "Signed Up",
    verified: "Verified",
    checked_in: "Checked In",
    unmatched: "Unmatched",
  };
  return <span className={map[status] ?? "captain-badge-gray"}>{label[status] ?? status}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function CaptainDashboard() {
  const [, navigate] = useLocation();
  const token = getBowlerToken();

  useEffect(() => {
    if (!token) navigate("/captain-login");
  }, [token, navigate]);

  const teamQuery = trpc.bowlerAuth.myTeam.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  const captainEventId = (teamQuery.data?.profile as any)?.eventId as number | undefined;
  const captainEventSettingsQuery = trpc.event.getSettings.useQuery(
    { id: captainEventId ?? 0 },
    { enabled: !!captainEventId }
  );

  const captainBowlerId = (teamQuery.data?.profile as any)?.id as number | undefined;
  const tshirtStatusQuery = trpc.tshirts.status.useQuery(
    { bowlerId: captainBowlerId ?? 0 },
    { enabled: !!captainBowlerId }
  );
  const markTshirts = trpc.tshirts.markReceived.useMutation({
    onSuccess: () => { tshirtStatusQuery.refetch(); },
  });

  const verifyBowler = trpc.bowlerAuth.verifyBowler.useMutation({
    onSuccess: () => {
      toast.success("Bowler verified!");
      teamQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Contact info request form state
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactSent, setContactSent] = useState(false);
  const submitContactRequest = trpc.bowlerAuth.submitContactRequest.useMutation({
    onSuccess: () => { setContactSent(true); setContactFormOpen(false); toast.success("Contact info submitted! The Event Director will review and confirm it shortly."); },
    onError: (e) => toast.error(e.message),
  });

  function handleLogout() {
    clearBowlerSession();
    navigate("/captain-login");
  }

  if (teamQuery.isLoading) {
    return (
      <div className="captain-portal-bg min-h-screen flex items-center justify-center">
        <div className="space-y-4 w-full max-w-2xl px-4">
          <Skeleton className="h-8 w-48 bg-white/10" />
          <Skeleton className="h-32 w-full bg-white/10 rounded-2xl" />
          <Skeleton className="h-64 w-full bg-white/10 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (teamQuery.error) {
    return (
      <div className="captain-portal-bg min-h-screen flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-red-400 mb-4">{teamQuery.error.message}</p>
          <Button className="captain-btn-secondary" onClick={handleLogout}>Sign In Again</Button>
        </div>
      </div>
    );
  }

  const { profile: p, roster } = teamQuery.data ?? { profile: null, roster: [] };
  if (!p) return null;
  const captainEventSettings = (captainEventSettingsQuery.data ?? null) as EventTripSettings | null;

  const verifiedCount = roster.filter((b) => b.captainVerified || b.registrationStatus === "verified" || b.registrationStatus === "checked_in").length;
  const signedUpCount = roster.filter((b) => b.registrationStatus !== "pre_registered").length;
  const displayName = p.preferredName || `${p.legalFirstName} ${p.legalLastName}`;

  // Shareable registration link
  const regLink = `${window.location.origin}/register?team=${p.teamCode}&center=${p.centerId}`;

  return (
    <div className="captain-portal-bg min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="captain-portal-header px-4 py-3 flex items-center justify-between">
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
          <Button
            size="sm"
            variant="ghost"
            className="text-white/60 hover:text-white text-xs"
            onClick={() => navigate("/bowler-dashboard")}
          >
            My Profile
          </Button>
          <Button size="sm" variant="ghost" className="text-white/60 hover:text-white text-xs" onClick={handleLogout}>
            Sign Out
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-2xl mx-auto w-full space-y-4">

        {/* ── Captain + Team Header ── */}
        <div className="captain-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-400 text-xl">⭐</span>
                <h2 className="text-xl font-bold text-white">{displayName}</h2>
              </div>
              <p className="text-white/60 text-sm">{p.teamName ?? "—"} · {p.centerName ?? "—"}</p>
              {p.laneNumber && (
                <p className="text-amber-300 text-sm mt-1">🎳 Lane {p.laneNumber} · {normalizeSquadTime(p.squadTime)}</p>
              )}
            </div>
            <CompletionRing verified={verifiedCount} total={roster.length} />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="captain-stat-box">
              <p className="text-2xl font-bold text-white">{roster.length}</p>
              <p className="text-white/50 text-xs">Total</p>
            </div>
            <div className="captain-stat-box">
              <p className="text-2xl font-bold text-amber-300">{signedUpCount}</p>
              <p className="text-white/50 text-xs">Signed Up</p>
            </div>
            <div className="captain-stat-box">
              <p className="text-2xl font-bold text-emerald-400">{verifiedCount}</p>
              <p className="text-white/50 text-xs">Verified</p>
            </div>
          </div>
        </div>

        {/* ── Sponsor ad (slot A) ── */}
        <AdRotator eventId={captainEventId} slot={0} />

        {/* ── Lane to Banquet placard ── */}
        <LaneToBanquetPlacard
          laneToEvent={p.laneToEvent}
          laneNumber={p.laneNumber}
          squadTime={p.squadTime}
          hotelName={(p as any).hotelName}
          confirmationCode={(p as any).confirmationCode}
          checkinDate={(p as any).checkinDate}
          checkoutDate={(p as any).checkoutDate}
          roomType={(p as any).roomType}
          banquetTable={(p as any).banquetTable}
          banquetLocation={(p as any).banquetLocation}
          banquetTime={(p as any).banquetTime}
          ev={captainEventSettings}
        />

        {/* ── Sponsor ad (slot B) ── */}
        <AdRotator eventId={captainEventId} slot={1} />

        {/* ── Roster Table ── */}
        <div className="captain-card">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <span>👥</span> Team Roster
          </h3>

          {roster.length === 0 ? (
            <p className="text-white/40 text-sm text-center py-4">No bowlers assigned to this team yet.</p>
          ) : (
            <div className="space-y-2">
              {roster.map((bowler) => {
                const isVerified = bowler.captainVerified || bowler.registrationStatus === "verified" || bowler.registrationStatus === "checked_in";
                const isMe = bowler.id === p.id;
                return (
                  <div
                    key={bowler.id}
                    className={`captain-roster-row ${isVerified ? "captain-roster-verified" : ""}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`captain-roster-avatar ${Boolean(bowler.isCapitain) ? "captain-avatar-gold" : ""}`}>
                        {Boolean(bowler.isCapitain) ? "⭐" : "🎳"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm truncate">
                          {bowler.preferredName || `${bowler.legalFirstName} ${bowler.legalLastName}`}
                          {isMe && <span className="text-amber-400 text-xs ml-1">(you)</span>}
                        </p>
                        <StatusBadge status={bowler.registrationStatus} verified={Boolean(bowler.captainVerified)} />
                      </div>
                    </div>
                    {!isVerified && !isMe && (
                      <Button
                        size="sm"
                        className="captain-verify-btn flex-shrink-0"
                        onClick={() => verifyBowler.mutate({ token: token ?? "", bowlerId: bowler.id })}
                        disabled={verifyBowler.isPending}
                      >
                        Verify
                      </Button>
                    )}
                    {isVerified && (
                      <span className="text-emerald-400 text-sm flex-shrink-0">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Shareable Registration Link ── */}
        <div className="captain-card">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>🔗</span> Team Registration Link
          </h3>
          <p className="text-white/50 text-xs mb-3">
            Share this link with your team members so they can register with your team pre-filled.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={regLink}
              className="captain-link-input flex-1 text-xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              size="sm"
              className="captain-btn-secondary flex-shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(regLink);
                toast.success("Link copied!");
              }}
            >
              Copy
            </Button>
          </div>
        </div>

        {/* ── My Contact Info ── */}
        <div className="captain-card">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>📞</span> My Contact Info
          </h3>
          {p.email && <div className="flex items-start gap-3 py-2 border-b border-white/10"><span className="text-lg w-6 text-center flex-shrink-0">📧</span><div><p className="text-white/70 text-xs">Email</p><p className="text-white font-semibold text-sm">{p.email}</p></div></div>}
          {p.phone && <div className="flex items-start gap-3 py-2 border-b border-white/10"><span className="text-lg w-6 text-center flex-shrink-0">📱</span><div><p className="text-white/70 text-xs">Phone</p><p className="text-white font-semibold text-sm">{p.phone}</p></div></div>}
          {!p.email && !p.phone && (
            <div className="mt-1">
              {contactSent ? (
                <p className="text-emerald-400 text-sm font-semibold">✅ Contact info submitted! The Event Director will review and confirm it shortly.</p>
              ) : contactFormOpen ? (
                <div className="space-y-3 bg-white/5 rounded-xl p-4 border border-white/15">
                  <p className="text-amber-200 text-sm font-semibold">Submit your contact info</p>
                  <div>
                    <label className="text-white/60 text-xs mb-1 block">Phone Number (10 digits)</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="e.g. 7025551234"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs mb-1 block">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. you@example.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="captain-btn-primary flex-1"
                      disabled={contactPhone.length !== 10 || !contactEmail.includes("@") || submitContactRequest.isPending}
                      onClick={() => submitContactRequest.mutate({ token: token ?? "", phone: contactPhone, email: contactEmail })}
                    >
                      {submitContactRequest.isPending ? "Sending…" : "📤 Send"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setContactFormOpen(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-white/50 text-sm">No contact info on file. Contact your Event Director to update.</p>
                  <Button size="sm" className="captain-btn-secondary w-full" onClick={() => setContactFormOpen(true)}>
                    📱 Submit My Contact Info
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── QR Passports ── */}
        <div className="pt-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-white/40 text-xs font-semibold tracking-widest uppercase">QR Passports</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>
        </div>

        <PassportBox
          title="Banquet Dinner Passport"
          icon="🍽️"
          subtitle={(p as any).eventName ? `${(p as any).eventName} — Banquet Dinner` : "Banquet Dinner"}
          checkInTime={(p as any).banquetTime ? `${(p as any).banquetTime} — Check-in begins 30 min early` : "Check-in begins 30 minutes before dinner"}
          entranceFlow={[
            (p as any).banquetLocation ? `📍 Location: ${(p as any).banquetLocation}` : null,
            (p as any).banquetTable ? `🪑 ${(p as any).banquetTable}` : null,
            "Present this QR code at the banquet hall entrance. A staff member will scan your code — once scanned it cannot be reused. Wristbands will be issued at the door for re-entry.",
          ].filter(Boolean).join("\n")}
          qrDataUrl={p.banquetQR}
          tokenUsed={Boolean((p as any).banquetUsed)}
          eligible={p.banquetToken !== null && p.banquetToken !== undefined}
        />

        <PassportBox
          title="Pool Party Passport"
          icon="🏊"
          subtitle="Funtime Team Challenge 2026 — Pool Party"
          checkInTime="Pool Party — Check-in begins at 7:00 PM"
          entranceFlow="Show this QR code to the pool party doorman. Your code will be scanned and marked as used — one scan per person. A wristband will be issued for re-entry."
          qrDataUrl={p.poolPartyQR}
          tokenUsed={Boolean((p as any).poolPartyUsed)}
          eligible={p.poolPartyToken !== null && p.poolPartyToken !== undefined}
        />

        {/* ── Guest Pool Party Passes (A, B, C...) ── */}
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
                entranceFlow={`Guest pool party pass. Present at the pool party entrance for your guest. One scan per pass — cannot be reused. Pass ID: ${(p as any).scantronId}${g.suffix}`}
                qrDataUrl={g.used ? null : g.qrDataUrl}
                tokenUsed={g.used}
                eligible={!g.disabled}
              />
            ))}
          </>
        )}

        {/* ── Guest Banquet Passes (A, B, C...) ── */}
        {Array.isArray((p as any).guestBanquetQRs) && (p as any).guestBanquetQRs.length > 0 && (
          <>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-px bg-white/20" />
              <span className="text-white/40 text-xs font-semibold tracking-widest uppercase">Guest Banquet Passes</span>
              <div className="flex-1 h-px bg-white/20" />
            </div>
            {(p as any).guestBanquetQRs.map((g: { suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }) => (
              <PassportBox
                key={`bq-${g.suffix}`}
                title={`Guest Banquet Pass ${g.suffix}`}
                icon="🍽️"
                subtitle={`Guest Banquet Dinner Entry — Pass ${g.suffix}`}
                entranceFlow={`Guest banquet dinner pass. Present at the banquet hall entrance for your guest. One scan per pass — cannot be reused. Pass ID: ${(p as any).scantronId}${g.suffix}`}
                qrDataUrl={g.used ? null : g.qrDataUrl}
                tokenUsed={g.used}
                eligible={!g.disabled}
              />
            ))}
          </>
        )}

        {/* ── T-Shirt Distribution (only when event provides shirts) ── */}
        {Boolean(captainEventSettings?.tshirtsProvided) && (
          <div className="captain-card">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span>👕</span> Team T-Shirt Pickup
            </h3>
            <div className="space-y-2 text-sm text-white/70 mb-4">
              {captainEventSettings?.tshirtPickupLocation && (
                <p>📍 <span className="text-white/90">{captainEventSettings.tshirtPickupLocation}</span></p>
              )}
              {captainEventSettings?.tshirtPickupTime && (
                <p>🕒 <span className="text-white/90">{captainEventSettings.tshirtPickupTime}</span></p>
              )}
              <p className="text-white/50 text-xs leading-relaxed">
                As team captain, you collect all team T-shirts at once. After you have picked up
                and verified every shirt for your team, tap the button below. This records the
                pickup and marks your name purple on the Event Director's master sheet so staff
                know your team has been taken care of.
              </p>
            </div>
            {tshirtStatusQuery.data?.received ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-purple-500/15 border border-purple-400/40 px-4 py-3">
                <span className="text-purple-200 font-semibold flex items-center gap-2">
                  <span>✅</span> Shirts received
                  {tshirtStatusQuery.data.receivedAt && (
                    <span className="text-purple-300/70 text-xs font-normal">
                      {new Date(tshirtStatusQuery.data.receivedAt).toLocaleString()}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => captainBowlerId && markTshirts.mutate({ bowlerId: captainBowlerId, received: false })}
                  disabled={markTshirts.isPending}
                  className="text-xs text-purple-300/70 hover:text-purple-200 underline disabled:opacity-50"
                >
                  Undo
                </button>
              </div>
            ) : (
              <button
                onClick={() => captainBowlerId && markTshirts.mutate({ bowlerId: captainBowlerId, received: true })}
                disabled={markTshirts.isPending || !captainBowlerId}
                className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white shadow-lg hover:from-purple-400 hover:to-fuchsia-500 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {markTshirts.isPending ? "Saving…" : "Mark Team Shirts as Received"}
              </button>
            )}
          </div>
        )}

        {/* ── Responsibilities ── */}
        <div className="captain-card">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>📋</span> Captain Responsibilities
          </h3>
          <ul className="space-y-2 text-white/60 text-sm">
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Ensure all team members have signed up and are verified before event day</li>
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Confirm hotel reservations and payment status with each member</li>
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Arrive at Lane {p.laneNumber ?? "TBD"} by {normalizeSquadTime(p.squadTime) || "squad time"} on bowling day</li>
            <li className="flex items-start gap-2"><span className="text-cyan-400 flex-shrink-0">→</span> Practice starts <strong className="text-white">10 minutes before</strong> squad time — ensure your team is on the lanes early</li>
            <li className="flex items-start gap-2"><span className="text-purple-400 flex-shrink-0">→</span> Side pots &amp; brackets are at the <strong className="text-white">front desk</strong> — see the desk before your squad begins</li>
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Contact your Event Director for any roster changes or issues</li>
          </ul>
        </div>

      </div>

      <AppFooter />
    </div>
  );
}
