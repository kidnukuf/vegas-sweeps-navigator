/**
 * BowlerDashboard — personal portal for a signed-in bowler
 * Shows: profile card, QR ticket, team/lane/event info, hotel & payment status
 * Design: warm consumer app — navy/purple gradient, gold highlights
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getBowlerToken, clearBowlerSession, BOWLER_IS_CAPTAIN_KEY } from "./BowlerLogin";

// ─── Status badge colors ──────────────────────────────────────────────────────
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

// ─── QR Ticket component ──────────────────────────────────────────────────────
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
    </div>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/10 last:border-0">
      <span className="text-lg w-6 text-center flex-shrink-0">{icon}</span>
      <div>
        <p className="text-white/50 text-xs">{label}</p>
        <p className="text-white font-medium text-sm">{value}</p>
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

  return (
    <div className="bowler-portal-bg min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="bowler-portal-header px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎳</span>
          <span className="font-bold text-white text-base">B.O.B. Roll-off Passport</span>
        </div>
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

        {/* ── Profile Card ── */}
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

        {/* ── QR Ticket ── */}
        <div className="bowler-card text-center">
          <h3 className="text-white font-semibold mb-4 flex items-center justify-center gap-2">
            <span>🎫</span> My Entry Ticket
          </h3>
          <QRTicket bowlerId={p.id} scantronId={p.scantronId} />
        </div>

        {/* ── Event Info ── */}
        <div className="bowler-card">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>📅</span> Event Details
          </h3>
          <InfoRow icon="🏆" label="Event" value={p.eventName ?? undefined} />
          <InfoRow icon="📍" label="Bowling Center" value={p.centerName ?? undefined} />
          <InfoRow icon="👥" label="Team" value={p.teamName ? `${p.teamName} (${p.teamCode})` : undefined} />
          <InfoRow icon="🎳" label="Lane" value={p.laneNumber ? `Lane ${p.laneNumber}` : undefined} />
          <InfoRow icon="🕐" label="Squad Time" value={p.squadTime ?? undefined} />
          <InfoRow icon="📆" label="Bowling Date" value={p.bowlingDate ?? undefined} />
        </div>

        {/* ── Hotel Info ── */}
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

        {/* ── Payment Status ── */}
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

        {/* ── Contact Info ── */}
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

      </div>
    </div>
  );
}
