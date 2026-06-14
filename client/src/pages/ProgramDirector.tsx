import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { SponsorAdBanner } from "@/components/SponsorAdBanner";

type Bowler = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  pre_registered: "bg-gray-800 text-gray-400 border border-white/10",
  signed_up: "bg-blue-900/60 text-blue-300 border border-blue-500/30",
  verified: "bg-green-900/60 text-green-300 border border-green-500/30",
  checked_in: "bg-yellow-900/60 text-yellow-300 border border-yellow-500/30",
  unmatched: "bg-red-900/60 text-red-300 border border-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pre_registered: "Pre-Reg",
  signed_up: "Signed Up",
  verified: "Verified",
  checked_in: "Checked In",
  unmatched: "Unmatched",
};

export default function ProgramDirector() {
  const [, setLocation] = useLocation();
  const EVENT_ID = 1;
  const [loggedIn, setLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCenter, setSelectedCenter] = useState<string>("all");

  const loginMutation = trpc.appAuth.login.useMutation({
    onSuccess: (data) => {
      const d = data as Record<string, unknown>;
      if (d.success) {
        setLoggedIn(true);
        toast.success("Welcome, Program Director");
      } else {
        toast.error("Invalid credentials");
      }
    },
    onError: () => toast.error("Login failed — check your credentials"),
  });

  const { data: centers = [] } = trpc.centers.list.useQuery(undefined, { enabled: loggedIn });
  const { data: bowlers = [], isLoading } = trpc.bowlers.adminList.useQuery(
    { eventId: EVENT_ID },
    { enabled: loggedIn }
  );

  const filteredBowlers = useMemo(() => {
    return (bowlers as Bowler[]).filter((b) => {
      const matchesCenter = selectedCenter === "all" || String(b.centerName ?? "") === selectedCenter;
      if (!matchesCenter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(b.legalFirstName ?? "").toLowerCase().includes(q) ||
        String(b.legalLastName ?? "").toLowerCase().includes(q) ||
        String(b.scantronId ?? "").includes(q) ||
        String(b.teamName ?? "").toLowerCase().includes(q)
      );
    });
  }, [bowlers, search, selectedCenter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Bowler[]>>();
    for (const b of filteredBowlers) {
      const center = String(b.centerName ?? "Unknown");
      const team = `Team ${b.teamCode ?? "??"} — ${b.teamName ?? ""}`;
      if (!map.has(center)) map.set(center, new Map());
      const teamMap = map.get(center)!;
      if (!teamMap.has(team)) teamMap.set(team, []);
      teamMap.get(team)!.push(b);
    }
    return map;
  }, [filteredBowlers]);

  const totalBowlers = (bowlers as Bowler[]).length;
  const checkedIn = (bowlers as Bowler[]).filter((b) => b.registrationStatus === "checked_in").length;
  const verified = (bowlers as Bowler[]).filter((b) => b.registrationStatus === "verified").length;
  const signedUp = (bowlers as Bowler[]).filter((b) => b.registrationStatus === "signed_up").length;

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <div className="neon-card p-8 max-w-sm w-full neon-border-gold">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">📊</div>
            <h1
              className="text-2xl font-black neon-gold tracking-widest"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              PROGRAM DIRECTOR
            </h1>
            <p className="text-gray-500 text-sm mt-1">Read-only league overview access</p>
          </div>
          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="neon-input"
                placeholder="Program Director username"
                onKeyDown={(e) => e.key === "Enter" && loginMutation.mutate({ username, password })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="neon-input"
                placeholder="Password"
                onKeyDown={(e) => e.key === "Enter" && loginMutation.mutate({ username, password })}
              />
            </div>
          </div>
          <button
            onClick={() => loginMutation.mutate({ username, password })}
            disabled={loginMutation.isPending || !username || !password}
            className="neon-btn-gold w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loginMutation.isPending ? "Signing In..." : "📊 Access Program View"}
          </button>
          <button onClick={() => setLocation("/")} className="w-full mt-3 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">
            ← Back to Home
          </button>
          <p className="text-xs text-gray-600 text-center mt-4">
            Credentials provided by the Event Director
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-yellow-500/30 px-4 py-4 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/")} className="text-gray-400 hover:text-white text-sm transition-colors">← Home</button>
            <span className="text-gray-600">|</span>
            <h1
              className="text-xl font-black"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700", textShadow: "0 0 20px rgba(255,215,0,0.5)" }}
            >
              📊 PROGRAM DIRECTOR
            </h1>
          </div>
          <span className="text-xs text-gray-500 bg-[#111] px-3 py-1 rounded-full border border-white/10">
            Read-Only View
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="bg-[#111] border-b border-white/10 px-4 py-3">
        <div className="max-w-6xl mx-auto grid grid-cols-4 gap-3">
          {[
            { label: "Total Bowlers", value: totalBowlers, color: "text-white" },
            { label: "Signed Up", value: signedUp, color: "text-blue-400" },
            { label: "Verified", value: verified, color: "text-green-400" },
            { label: "Checked In", value: checkedIn, color: "text-yellow-400" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Top sponsor banner */}
        <SponsorAdBanner slot="top" />

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="🔍 Search by name, ID, team..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-3 bg-[#1a1a1a] border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
          />
          <select
            value={selectedCenter}
            onChange={(e) => setSelectedCenter(e.target.value)}
            className="px-4 py-3 bg-[#1a1a1a] border border-white/20 rounded-xl text-white focus:outline-none focus:border-yellow-500 transition-colors"
          >
            <option value="all">All Centers</option>
            {(centers as Record<string, unknown>[]).map((c) => (
              <option key={String(c.id)} value={String(c.name)}>{String(c.name)}</option>
            ))}
          </select>
        </div>

        {/* Hierarchical roster — read only */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading roster...</div>
        ) : (
          <div className="space-y-4">
            {Array.from(grouped.entries()).map(([centerName, teamMap]) => {
              const centerBowlers = Array.from(teamMap.values()).flat();
              const centerCheckedIn = centerBowlers.filter((b) => b.registrationStatus === "checked_in").length;
              return (
                <div key={centerName} className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
                  <div className="px-5 py-3 bg-gradient-to-r from-yellow-500/15 to-transparent border-b border-yellow-500/20 flex items-center justify-between">
                    <h2 className="text-base font-bold text-yellow-400">🏠 {centerName}</h2>
                    <span className="text-xs text-gray-400">{centerBowlers.length} bowlers • {centerCheckedIn} checked in</span>
                  </div>
                  {Array.from(teamMap.entries()).map(([teamLabel, members]) => {
                    const allVerified = members.every((m) => m.registrationStatus === "verified" || m.registrationStatus === "checked_in");
                    const allSignedUp = members.every((m) => ["signed_up", "verified", "checked_in"].includes(String(m.registrationStatus)));
                    const teamBorderColor = allVerified ? "border-green-500/20 bg-green-500/5" : allSignedUp ? "border-yellow-500/20 bg-yellow-500/5" : "border-white/5";
                    return (
                      <div key={teamLabel} className={`border-b last:border-0 ${teamBorderColor}`}>
                        <div className="px-5 py-2 border-b border-white/5 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-300">{teamLabel}</h3>
                          <span className="text-xs text-gray-500">{members.length} members</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-500 text-xs border-b border-white/5">
                                <th className="px-4 py-2 text-left">ID</th>
                                <th className="px-4 py-2 text-left">Name</th>
                                <th className="px-4 py-2 text-left">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {members.map((b) => (
                                <tr key={String(b.id)} className="border-b border-white/5 hover:bg-white/3">
                                  <td className="px-4 py-2 font-mono text-yellow-400 text-xs">{String(b.scantronId ?? "—")}</td>
                                  <td className="px-4 py-2 font-semibold text-sm">
                                    {b.isCapitain ? "⭐ " : ""}
                                    {String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[String(b.registrationStatus ?? "pre_registered")]}`}>
                                      {STATUS_LABELS[String(b.registrationStatus ?? "pre_registered")] ?? String(b.registrationStatus)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {grouped.size === 0 && (
              <div className="text-center py-12 text-gray-500">
                {search ? "No bowlers match your search." : "No bowlers found. Import data to get started."}
              </div>
            )}
          </div>
        )}

        {/* Bottom sponsor banner */}
        <SponsorAdBanner slot="bottom" />
      </div>
    </div>
  );
}
