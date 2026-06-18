/**
 * CaptainDashboard — team management portal for a signed-in Team Captain
 * Shows: captain profile, team roster, verify buttons, completion ring, shareable link
 * Design: bold, organized — darker navy with gold team accents, table-centric layout
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getBowlerToken, clearBowlerSession } from "./BowlerLogin";

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

  const verifyBowler = trpc.bowlerAuth.verifyBowler.useMutation({
    onSuccess: () => {
      toast.success("Bowler verified!");
      teamQuery.refetch();
    },
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

  const verifiedCount = roster.filter((b) => b.captainVerified || b.registrationStatus === "verified" || b.registrationStatus === "checked_in").length;
  const signedUpCount = roster.filter((b) => b.registrationStatus !== "pre_registered").length;
  const displayName = p.preferredName || `${p.legalFirstName} ${p.legalLastName}`;

  // Shareable registration link
  const regLink = `${window.location.origin}/register?team=${p.teamCode}&center=${p.centerId}`;

  return (
    <div className="captain-portal-bg min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="captain-portal-header px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">⭐</span>
          <span className="font-bold text-white text-base">Captain Portal</span>
        </div>
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
                <p className="text-amber-300 text-sm mt-1">🎳 Lane {p.laneNumber} · {p.squadTime ?? ""}</p>
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

        {/* ── Responsibilities ── */}
        <div className="captain-card">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>📋</span> Captain Responsibilities
          </h3>
          <ul className="space-y-2 text-white/60 text-sm">
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Ensure all team members have signed up and are verified before event day</li>
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Confirm hotel reservations and payment status with each member</li>
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Arrive at Lane {p.laneNumber ?? "TBD"} by {p.squadTime ?? "squad time"} on bowling day</li>
            <li className="flex items-start gap-2"><span className="text-amber-400 flex-shrink-0">→</span> Contact your Event Director for any roster changes or issues</li>
          </ul>
        </div>

      </div>
    </div>
  );
}
