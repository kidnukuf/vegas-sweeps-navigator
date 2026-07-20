import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { SponsorAdBanner } from "@/components/SponsorAdBanner";

type Team = Record<string, unknown>;
type Member = Record<string, unknown>;

export default function TeamCaptain() {
  const [, setLocation] = useLocation();
  const EVENT_ID = 1;
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [captainCode, setCaptainCode] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: teams = [] } = trpc.teams.listByEvent.useQuery({ eventId: EVENT_ID });
  const { data: teamData, refetch: refetchTeam } = trpc.teams.getWithMembers.useQuery(
    { teamId: selectedTeamId! },
    { enabled: !!selectedTeamId && authenticated }
  );

  const verifyMutation = trpc.teams.verifyCaptain.useMutation({
    onSuccess: (data) => {
      const d = data as Record<string, unknown>;
      if (d.success) { setAuthenticated(true); toast.success("Captain verified!"); }
      else toast.error("Invalid captain code");
    },
    onError: (e) => toast.error(e.message),
  });

  const verifyMember = trpc.teams.verifyMember.useMutation({
    onSuccess: () => { toast.success("Member verified!"); refetchTeam(); },
    onError: (e) => toast.error(e.message),
  });

  const copyLink = () => {
    if (!selectedTeamId) return;
    const url = `${window.location.origin}/register?team_id=${selectedTeamId}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast.success("Registration link copied!");
    });
  };

  const members = (teamData as Record<string, unknown>)?.members as Member[] ?? [];
  const team = (teamData as Record<string, unknown>)?.team as Team ?? null;
  const completedCount = members.filter((m: Member) =>
    m.registrationStatus === "verified" || m.registrationStatus === "checked_in"
  ).length;
  const signedUpCount = members.filter((m: Member) =>
    m.registrationStatus === "signed_up" || m.registrationStatus === "verified" || m.registrationStatus === "checked_in"
  ).length;

  const getStatusStyle = (status: unknown) => {
    switch (String(status ?? "pre_registered")) {
      case "checked_in": return "bg-yellow-900/60 text-yellow-300 border border-yellow-500/30";
      case "verified": return "bg-green-900/60 text-green-300 border border-green-500/30";
      case "signed_up": return "bg-blue-900/60 text-blue-300 border border-blue-500/30";
      case "unmatched": return "bg-red-900/60 text-red-300 border border-red-500/30";
      default: return "bg-gray-800 text-gray-400 border border-white/10";
    }
  };

  const getStatusLabel = (status: unknown) => {
    switch (String(status ?? "pre_registered")) {
      case "checked_in": return "✅ Checked In";
      case "verified": return "🟢 Verified";
      case "signed_up": return "🔵 Signed Up";
      case "unmatched": return "⚠️ Unmatched";
      default: return "⬜ Pre-Reg";
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <div className="neon-card p-8 max-w-sm w-full neon-border-gold">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">⭐</div>
            <h1 className="text-2xl font-black neon-gold tracking-widest" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
              TEAM CAPTAIN
            </h1>
            <p className="text-gray-500 text-sm mt-1">Select your team and enter your captain code</p>
          </div>
          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Select Your Team</label>
              <select
                value={selectedTeamId ?? ""}
                onChange={(e) => setSelectedTeamId(Number(e.target.value))}
                className="neon-input"
              >
                <option value="">— Select Team —</option>
                {(teams as Team[]).map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.teamName ?? "")} (#{String(t.teamCode ?? "")})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Captain Code</label>
              <input
                type="password"
                value={captainCode}
                onChange={(e) => setCaptainCode(e.target.value)}
                className="neon-input"
                placeholder="Enter your captain code"
                onKeyDown={(e) => e.key === "Enter" && selectedTeamId && verifyMutation.mutate({ teamId: selectedTeamId, captainCode })}
              />
            </div>
          </div>
          <button
            onClick={() => selectedTeamId && verifyMutation.mutate({ teamId: selectedTeamId, captainCode })}
            disabled={verifyMutation.isPending || !selectedTeamId || !captainCode}
            className="neon-btn-gold w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifyMutation.isPending ? "Verifying..." : "⭐ Access Team Dashboard"}
          </button>
          <button onClick={() => setLocation("/")} className="w-full mt-3 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-yellow-500/30 px-4 py-4 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/")} className="text-gray-400 hover:text-white text-sm transition-colors">← Home</button>
            <span className="text-gray-600">|</span>
            <h1
              className="text-xl font-black"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700", textShadow: "0 0 20px rgba(255,215,0,0.5)" }}
            >
              ⭐ TEAM CAPTAIN
            </h1>
          </div>
          <button
            onClick={copyLink}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
              linkCopied
                ? "bg-green-600 text-white"
                : "bg-[#111] border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
            }`}
          >
            {linkCopied ? "✅ Copied!" : "📋 Copy Reg Link"}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Top sponsor banner */}
        <SponsorAdBanner slot="top" />

        {/* Team summary card */}
        {team && (
          <div className="bg-[#1a1a1a] rounded-2xl border border-yellow-500/20 p-5">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-black text-white" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
                  {String(team.teamName ?? "")}
                </h2>
                <p className="text-gray-400 text-sm mt-0.5">
                  {String(team.centerName ?? "")} • Team #{String(team.teamCode ?? "")}
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black" style={{ color: "#ffd700", textShadow: "0 0 15px rgba(255,215,0,0.4)" }}>
                  {completedCount}/{members.length}
                </div>
                <div className="text-xs text-gray-500">Verified</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{signedUpCount} signed up</span>
                <span>{completedCount} verified</span>
              </div>
              <div className="h-2 bg-[#111] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: members.length > 0 ? `${(completedCount / members.length) * 100}%` : "0%",
                    background: "linear-gradient(90deg, #ffd700, #00ffff)",
                    boxShadow: "0 0 8px rgba(255,215,0,0.5)",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Roster */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-semibold text-gray-300">Team Roster</h3>
            <span className="text-xs text-gray-500">{members.length} members</span>
          </div>
          <div className="divide-y divide-white/5">
            {members.map((m: Member, i: number) => (
              <div key={String(m.id)} className="px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                    style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", color: "#ffd700" }}
                  >
                    {i + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      {m.isCapitain ? "⭐ " : ""}
                      {String(m.legalFirstName ?? "")} {String(m.legalLastName ?? "")}
                    </div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">
                      {String(m.scantronId ?? "ID pending")}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusStyle(m.registrationStatus)}`}>
                    {getStatusLabel(m.registrationStatus)}
                  </span>
                  {m.registrationStatus === "signed_up" && (
                    <button
                      onClick={() => verifyMember.mutate({ bowlerId: m.id as number, captainTeamId: selectedTeamId! })}
                      disabled={verifyMember.isPending}
                      className="px-2 py-1 rounded text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                      style={{ background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.4)", color: "#ffd700" }}
                    >
                      Verify
                    </button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-500 text-sm">No members found for this team.</div>
            )}
          </div>
        </div>

        {/* Captain responsibilities */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-cyan-500/20 p-5">
          <h3 className="text-sm font-bold mb-3" style={{ color: "#00ffff", textShadow: "0 0 10px rgba(0,255,255,0.4)" }}>
            📋 CAPTAIN RESPONSIBILITIES
          </h3>
          <ul className="text-xs text-gray-400 space-y-2">
            <li className="flex gap-2">
              <span className="text-cyan-500 flex-shrink-0">→</span>
              Ensure all team members complete their sign-up before the event
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-500 flex-shrink-0">→</span>
              Verify each member once they have signed up (click Verify button above)
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-500 flex-shrink-0">→</span>
              Share the registration link with members who have not signed up yet
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-500 flex-shrink-0">→</span>
              Contact the Event Director if a member cannot be found in the system
            </li>
            <li className="flex gap-2">
              <span className="text-yellow-500 flex-shrink-0">⚠</span>
              All team members must be present and checked in at the door to bowl
            </li>
          </ul>
        </div>

        {/* Bottom sponsor banner */}
        <SponsorAdBanner slot="bottom" />
      </div>
    </div>
  );
}
