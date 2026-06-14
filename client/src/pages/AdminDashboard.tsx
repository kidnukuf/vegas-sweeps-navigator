import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Bowler = Record<string, unknown>;

// Team completion color: gray = incomplete, yellow = all signed up, green = captain verified
function getTeamColor(members: Bowler[]): { bg: string; border: string; label: string } {
  const allVerified = members.every((m) => m.registrationStatus === "verified" || m.registrationStatus === "checked_in");
  const allSignedUp = members.every((m) => m.registrationStatus === "signed_up" || m.registrationStatus === "verified" || m.registrationStatus === "checked_in");
  if (allVerified) return { bg: "bg-green-500/10", border: "border-green-500/30", label: "text-green-400" };
  if (allSignedUp) return { bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "text-yellow-400" };
  return { bg: "bg-gray-800/50", border: "border-white/10", label: "text-gray-400" };
}

const STATUS_COLORS: Record<string, string> = {
  pre_registered: "bg-gray-700 text-gray-300",
  signed_up: "bg-blue-900 text-blue-300",
  verified: "bg-green-900 text-green-300",
  checked_in: "bg-yellow-900 text-yellow-300",
  unmatched: "bg-red-900 text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  pre_registered: "Pre-Reg",
  signed_up: "Signed Up",
  verified: "Verified",
  checked_in: "Checked In",
  unmatched: "Unmatched",
};

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"roster" | "audit" | "doormen" | "qrtest" | "unmatched">("roster");
  const [editingBowler, setEditingBowler] = useState<Bowler | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [showAllFields, setShowAllFields] = useState(false);
  const [newDoorman, setNewDoorman] = useState({ designation: "", password: "" });
  const [testQr, setTestQr] = useState<{ qrDataUrl: string; tokenValue: string } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [collapsedCenters, setCollapsedCenters] = useState<Set<string>>(new Set());
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"hierarchy" | "flat">("hierarchy");

  const toggleCenter = (name: string) => setCollapsedCenters((prev) => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });
  const toggleTeam = (key: string) => setCollapsedTeams((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const EVENT_ID = 1;

  const { data: bowlers = [], isLoading, refetch } = trpc.bowlers.adminList.useQuery({ eventId: EVENT_ID });
  const { data: stats } = trpc.bowlers.stats.useQuery({ eventId: EVENT_ID });
  const { data: auditLog = [] } = trpc.audit.list.useQuery({ eventId: EVENT_ID, limit: 200 });
  const { data: doormen = [], refetch: refetchDoormen } = trpc.appAuth.listDoormen.useQuery({ eventId: EVENT_ID });
  const unmatchedBowlers = useMemo(() => (bowlers as Bowler[]).filter((b) => b.registrationStatus === "unmatched"), [bowlers]);

  const updateBowler = trpc.bowlers.update.useMutation({
    onSuccess: () => { toast.success("Bowler updated"); refetch(); setEditingBowler(null); },
    onError: (e) => toast.error(e.message),
  });

  const createDoorman = trpc.appAuth.createDoorman.useMutation({
    onSuccess: () => { toast.success("Doorman created"); refetchDoormen(); setNewDoorman({ designation: "", password: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const exportCSV = () => {
    const rows = (bowlers as Bowler[]);
    if (!rows.length) { toast.error("No data to export"); return; }
    const headers = ["ScantronID","FirstName","LastName","Phone","Email","Center","Team","Status","CheckIn","Room","Banquet"];
    const csv = [headers.join(","), ...rows.map((b) => [
      b.scantronId, b.legalFirstName, b.legalLastName, b.phone, b.email,
      b.centerName, b.teamName, b.registrationStatus, b.checkinDate, b.roomType, b.banquetAmount
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "vegas-sweeps-roster.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Roster exported to CSV");
  };

  const generateTestQr = trpc.tokens.generateTest.useMutation({
    onSuccess: (data) => setTestQr(data),
  });

  const validateToken = trpc.tokens.validate.useMutation({
    onSuccess: (data) => {
      if ((data as Record<string, unknown>).isTest) setTestResult("✅ TEST QR SYSTEM WORKING — Token scanned and invalidated successfully");
      else if (data.success) setTestResult("✅ VALID — Bowler checked in");
      else setTestResult(`❌ ${(data as Record<string, unknown>).error}`);
    },
  });

  const grouped = useMemo(() => {
    const filtered = (bowlers as Bowler[]).filter((b) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(b.legalFirstName ?? "").toLowerCase().includes(q) ||
        String(b.legalLastName ?? "").toLowerCase().includes(q) ||
        String(b.scantronId ?? "").includes(q) ||
        String(b.phone ?? "").includes(q) ||
        String(b.centerName ?? "").toLowerCase().includes(q) ||
        String(b.teamName ?? "").toLowerCase().includes(q) ||
        String(b.teamCode ?? "").includes(q)
      );
    });

    const centerMap = new Map<string, Map<string, Bowler[]>>();
    for (const b of filtered) {
      const center = String(b.centerName ?? "Unknown Center");
      const team = `Team ${b.teamCode ?? "??"} — ${b.teamName ?? ""}`;
      if (!centerMap.has(center)) centerMap.set(center, new Map());
      const teamMap = centerMap.get(center)!;
      if (!teamMap.has(team)) teamMap.set(team, []);
      teamMap.get(team)!.push(b);
    }
    return centerMap;
  }, [bowlers, search]);

  const statCards = [
    { label: "Total", value: (stats as Record<string, unknown>)?.total ?? 0, color: "text-white" },
    { label: "Pre-Reg", value: (stats as Record<string, unknown>)?.preRegistered ?? 0, color: "text-gray-400" },
    { label: "Signed Up", value: (stats as Record<string, unknown>)?.signedUp ?? 0, color: "text-blue-400" },
    { label: "Verified", value: (stats as Record<string, unknown>)?.verified ?? 0, color: "text-green-400" },
    { label: "Checked In", value: (stats as Record<string, unknown>)?.checkedIn ?? 0, color: "text-yellow-400" },
    { label: "Unmatched", value: (stats as Record<string, unknown>)?.unmatched ?? 0, color: "text-red-400" },
  ];

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="bg-[#1a1a1a] border-b border-yellow-500/30 px-4 py-4 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/")} className="text-gray-400 hover:text-white text-sm">← Home</button>
            <span className="text-gray-600">|</span>
            <h1 className="text-2xl font-black" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700", textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>
              🎯 EVENT DIRECTOR
            </h1>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-semibold transition-colors">📤 Export CSV</button>
            <button onClick={() => setLocation("/import")} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold transition-colors">📥 Import Data</button>
          </div>
        </div>
      </div>

      <div className="bg-[#111] border-b border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto grid grid-cols-3 sm:grid-cols-6 gap-3">
          {statCards.map((s) => (
            <div key={s.label} className="text-center">
              <div className={`text-2xl font-black ${s.color}`}>{String(s.value)}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#111] border-b border-white/10 px-4">
        <div className="max-w-7xl mx-auto flex gap-1">
          {(["roster", "doormen", "qrtest", "audit", "unmatched"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-semibold capitalize transition-colors border-b-2 ${activeTab === tab ? "border-yellow-500 text-yellow-400" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
              {tab === "qrtest" ? "QR Test" : tab === "unmatched" ? `Unmatched${unmatchedBowlers.length > 0 ? ` (${unmatchedBowlers.length})` : ""}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "roster" && (
          <div>
            <div className="mb-4 flex gap-3 flex-wrap">
              <input type="text" placeholder="🔍 Search by name, ID, phone, center, team..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-4 py-3 bg-[#1a1a1a] border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500" />
              <div className="flex gap-1 bg-[#1a1a1a] border border-white/20 rounded-xl p-1">
                <button onClick={() => setViewMode("hierarchy")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === "hierarchy" ? "bg-yellow-500 text-black" : "text-gray-400 hover:text-white"}`}>Hierarchy</button>
                <button onClick={() => setViewMode("flat")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${viewMode === "flat" ? "bg-yellow-500 text-black" : "text-gray-400 hover:text-white"}`}>Flat List</button>
              </div>
            </div>
            {isLoading ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3 animate-pulse">🎳</div>
                <div className="text-gray-500">Loading roster...</div>
              </div>
            ) : (bowlers as Bowler[]).length === 0 ? (
              <div className="text-center py-16 bg-[#1a1a1a] rounded-2xl border border-white/10">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-bold text-yellow-400 mb-2">No Bowlers Imported Yet</h3>
                <p className="text-gray-400 mb-6 max-w-md mx-auto">Upload your roster CSV or Google Sheet to pre-generate all 10-digit scantron IDs and populate the dashboard.</p>
                <button onClick={() => setLocation("/import")} className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl text-lg transition-colors">
                  📥 Import Bowler Data
                </button>
              </div>
            ) : viewMode === "flat" ? (
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-gray-500 text-xs border-b border-white/10">
                      <th className="px-4 py-2 text-left">ID</th><th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">Center</th><th className="px-4 py-2 text-left">Team</th>
                      <th className="px-4 py-2 text-left">Phone</th><th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Actions</th>
                    </tr></thead>
                    <tbody>
                      {(bowlers as Bowler[]).filter((b) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return String(b.legalFirstName ?? "").toLowerCase().includes(q) || String(b.legalLastName ?? "").toLowerCase().includes(q) || String(b.scantronId ?? "").includes(q) || String(b.phone ?? "").includes(q) || String(b.centerName ?? "").toLowerCase().includes(q) || String(b.teamName ?? "").toLowerCase().includes(q);
                      }).map((b) => (
                        <tr key={String(b.id)} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-2 font-mono text-yellow-400 text-xs">{String(b.scantronId ?? "—")}</td>
                          <td className="px-4 py-2 font-semibold">{b.isCapitain ? "⭐ " : ""}{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{String(b.centerName ?? "—")}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{String(b.teamName ?? "—")}</td>
                          <td className="px-4 py-2 text-gray-400">{String(b.phone ?? "—")}</td>
                          <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[String(b.registrationStatus ?? "pre_registered")]}`}>{STATUS_LABELS[String(b.registrationStatus ?? "pre_registered")] ?? String(b.registrationStatus)}</span></td>
                          <td className="px-4 py-2"><button onClick={() => { setEditingBowler(b); setEditFields({ legalFirstName: String(b.legalFirstName ?? ""), legalLastName: String(b.legalLastName ?? ""), phone: String(b.phone ?? ""), email: String(b.email ?? ""), notes: String(b.notes ?? "") }); }} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors">Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {Array.from(grouped.entries()).map(([centerName, teamMap]) => {
                  const isCollapsed = collapsedCenters.has(centerName);
                  const centerBowlers = Array.from(teamMap.values()).flat();
                  const checkedInCount = centerBowlers.filter((b) => b.registrationStatus === "checked_in").length;
                  return (
                  <div key={centerName} className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
                    <button onClick={() => toggleCenter(centerName)} className="w-full px-5 py-3 bg-gradient-to-r from-yellow-500/20 to-transparent border-b border-yellow-500/30 flex items-center justify-between hover:from-yellow-500/30 transition-colors">
                      <h2 className="text-lg font-bold text-yellow-400">🏠 {centerName}</h2>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{centerBowlers.length} bowlers • {checkedInCount} checked in</span>
                        <span className="text-gray-400 text-sm">{isCollapsed ? "▶" : "▼"}</span>
                      </div>
                    </button>
                    {!isCollapsed && Array.from(teamMap.entries()).map(([teamLabel, members]) => {
                      const teamKey = `${centerName}::${teamLabel}`;
                      const isTeamCollapsed = collapsedTeams.has(teamKey);
                      const tc = getTeamColor(members);
                      const teamCheckedIn = members.filter((m) => m.registrationStatus === "checked_in").length;
                      return (
                      <div key={teamLabel} className={`border-b border-white/5 last:border-0 ${tc.bg}`}>
                        <button onClick={() => toggleTeam(teamKey)} className={`w-full px-5 py-2 border-b ${tc.border} flex items-center justify-between hover:bg-white/5 transition-colors`}>
                          <h3 className={`text-sm font-semibold ${tc.label}`}>{teamLabel}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">{members.length} bowlers • {teamCheckedIn} in</span>
                            <span className="text-gray-500 text-xs">{isTeamCollapsed ? "▶" : "▼"}</span>
                          </div>
                        </button>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-500 text-xs border-b border-white/5">
                                <th className="px-4 py-2 text-left">ID</th>
                                <th className="px-4 py-2 text-left">Name</th>
                                <th className="px-4 py-2 text-left">Phone</th>
                                <th className="px-4 py-2 text-left">Check-In</th>
                                <th className="px-4 py-2 text-left">Room</th>
                                <th className="px-4 py-2 text-left">Banquet</th>
                                <th className="px-4 py-2 text-left">Status</th>
                                <th className="px-4 py-2 text-left">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {members.map((b) => (
                                <tr key={String(b.id)} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                  <td className="px-4 py-2 font-mono text-yellow-400 text-xs">{String(b.scantronId ?? "—")}</td>
                                  <td className="px-4 py-2 font-semibold">{b.isCapitain ? "⭐ " : ""}{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</td>
                                  <td className="px-4 py-2 text-gray-400">{String(b.phone ?? "—")}</td>
                                  <td className="px-4 py-2 text-gray-400 text-xs">{String(b.checkinDate ?? "—")}</td>
                                  <td className="px-4 py-2 text-gray-400 text-xs">{String(b.roomType ?? "—")}</td>
                                  <td className="px-4 py-2 text-gray-400 text-xs">{b.banquetAmount ? `$${b.banquetAmount}` : "—"}</td>
                                  <td className="px-4 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[String(b.registrationStatus ?? "pre_registered")]}`}>
                                      {STATUS_LABELS[String(b.registrationStatus ?? "pre_registered")] ?? String(b.registrationStatus)}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2">
                                    <button onClick={() => { setEditingBowler(b); setEditFields({ legalFirstName: String(b.legalFirstName ?? ""), legalLastName: String(b.legalLastName ?? ""), phone: String(b.phone ?? ""), email: String(b.email ?? ""), notes: String(b.notes ?? "") }); }}
                                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors">Edit</button>
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
                  <div className="text-center py-12 text-gray-500">{search ? "No bowlers match your search." : "No bowlers found. Import data to get started."}</div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "doormen" && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-yellow-400 mb-4">Doorman Accounts</h2>
            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-3">Create New Doorman</h3>
              <div className="flex gap-3 flex-wrap">
                <input placeholder="Designation (e.g. DM1)" value={newDoorman.designation}
                  onChange={(e) => setNewDoorman({ ...newDoorman, designation: e.target.value })}
                  className="flex-1 min-w-[120px] px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
                <input type="password" placeholder="Password" value={newDoorman.password}
                  onChange={(e) => setNewDoorman({ ...newDoorman, password: e.target.value })}
                  className="flex-1 min-w-[120px] px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
                <button onClick={() => createDoorman.mutate({ designation: newDoorman.designation, password: newDoorman.password, eventId: EVENT_ID })}
                  disabled={!newDoorman.designation || !newDoorman.password || createDoorman.isPending}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold rounded-lg text-sm transition-colors">
                  {createDoorman.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {(doormen as Record<string, unknown>[]).map((d) => (
                <div key={String(d.id)} className="flex items-center justify-between bg-[#1a1a1a] rounded-xl border border-white/10 px-4 py-3">
                  <div><span className="font-bold text-cyan-400">{String(d.designation)}</span><span className="text-gray-500 text-sm ml-3">{String(d.username)}</span></div>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${d.active ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>{d.active ? "Active" : "Inactive"}</span>
                </div>
              ))}
              {(doormen as unknown[]).length === 0 && <p className="text-gray-500 text-sm">No doorman accounts created yet.</p>}
            </div>
          </div>
        )}

        {activeTab === "qrtest" && (
          <div className="max-w-lg">
            <h2 className="text-xl font-bold text-yellow-400 mb-2">QR Code System Test</h2>
            <p className="text-gray-400 text-sm mb-5">Generates a test QR using reserved ID <span className="font-mono text-yellow-400">0000000000</span> — never assigned to a real bowler. Tests scanner, network, and token invalidation.</p>
            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 text-center">
              {!testQr ? (
                <button onClick={() => { generateTestQr.mutate({ eventId: EVENT_ID }); setTestResult(null); }}
                  disabled={generateTestQr.isPending}
                  className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl text-lg transition-all active:scale-95">
                  {generateTestQr.isPending ? "Generating..." : "🔲 Generate Test QR"}
                </button>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-3 font-mono break-all">{testQr.tokenValue}</p>
                  <img src={testQr.qrDataUrl} alt="Test QR" className="mx-auto rounded-xl border-2 border-yellow-500/50 mb-4" style={{ width: 220 }} />
                  <div className="flex gap-3 justify-center flex-wrap">
                    <button onClick={() => validateToken.mutate({ tokenValue: testQr.tokenValue, doormanId: 0, method: "QR" })}
                      disabled={validateToken.isPending}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-sm transition-colors">
                      {validateToken.isPending ? "Scanning..." : "✅ Simulate Scan"}
                    </button>
                    <button onClick={() => { setTestQr(null); setTestResult(null); }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Reset</button>
                  </div>
                  {testResult && (
                    <div className={`mt-4 p-3 rounded-xl text-sm font-semibold ${testResult.startsWith("✅") ? "bg-green-900/50 text-green-300 border border-green-500/30" : "bg-red-900/50 text-red-300 border border-red-500/30"}`}>
                      {testResult}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "unmatched" && (
          <div>
            <h2 className="text-xl font-bold text-red-400 mb-2">⚠️ Unmatched Sign-Ups</h2>
            <p className="text-gray-400 text-sm mb-5">These bowlers signed up but could not be matched to a pre-registered record. Link them manually to an existing bowler record, or mark as new.</p>
            {unmatchedBowlers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No unmatched sign-ups. All bowlers matched successfully.</div>
            ) : (
              <div className="space-y-3">
                {unmatchedBowlers.map((b) => (
                  <div key={String(b.id)} className="bg-[#1a1a1a] rounded-xl border border-red-500/30 p-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-bold text-white">{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</div>
                      <div className="text-gray-400 text-sm">{String(b.phone ?? "")} · {String(b.email ?? "No email")}</div>
                      <div className="text-gray-500 text-xs mt-1">Signed up: {b.createdAt ? new Date(b.createdAt as string).toLocaleString() : "—"}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingBowler(b); setEditFields({ legalFirstName: String(b.legalFirstName ?? ""), legalLastName: String(b.legalLastName ?? ""), phone: String(b.phone ?? ""), email: String(b.email ?? ""), notes: String(b.notes ?? ""), registrationStatus: "signed_up" }); setShowAllFields(true); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold transition-colors">Link / Edit</button>
                      <span className="px-2 py-1 bg-red-900/50 text-red-300 rounded text-xs">Unmatched</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "audit" && (
          <div>
            <h2 className="text-xl font-bold text-yellow-400 mb-4">Audit Log</h2>
            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-white/10">
                      <th className="px-4 py-2 text-left">Time</th>
                      <th className="px-4 py-2 text-left">Role</th>
                      <th className="px-4 py-2 text-left">Action</th>
                      <th className="px-4 py-2 text-left">Target</th>
                      <th className="px-4 py-2 text-left">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditLog as Record<string, unknown>[]).map((log) => (
                      <tr key={String(log.id)} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{new Date(log.timestamp as string).toLocaleString()}</td>
                        <td className="px-4 py-2 text-cyan-400 text-xs">{String(log.actorRole ?? "")}</td>
                        <td className="px-4 py-2 font-mono text-xs text-yellow-400">{String(log.action ?? "")}</td>
                        <td className="px-4 py-2 text-gray-400 text-xs">{log.targetId ? `${log.targetType}#${log.targetId}` : "—"}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{String(log.details ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(auditLog as unknown[]).length === 0 && <div className="text-center py-8 text-gray-500 text-sm">No audit log entries yet.</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {editingBowler && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-yellow-500/30 p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-yellow-400 mb-4">Edit Bowler — {String(editingBowler.scantronId ?? "")}</h3>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {(["legalFirstName", "legalLastName", "phone", "email"] as const).map((field) => (
                <div key={field}>
                  <label className="text-xs text-gray-400 mb-1 block capitalize">{field.replace(/([A-Z])/g, " $1")}</label>
                  <input value={editFields[field] ?? ""} onChange={(e) => setEditFields({ ...editFields, [field]: e.target.value })}
                    className="w-full px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
                </div>
              ))}
              <button onClick={() => setShowAllFields(!showAllFields)} className="text-xs text-cyan-400 hover:text-cyan-300 underline">
                {showAllFields ? "Hide extended fields" : "Show hotel, payment, banquet, lane, notes..."}
              </button>
              {showAllFields && (
                <>
                  {(["checkinDate", "checkoutDate", "roomType", "roomNumber", "banquetAmount", "laneAssignment", "squadTime", "notes"] as const).map((field) => (
                    <div key={field}>
                      <label className="text-xs text-gray-400 mb-1 block capitalize">{field.replace(/([A-Z])/g, " $1")}</label>
                      <input value={editFields[field] ?? ""} onChange={(e) => setEditFields({ ...editFields, [field]: e.target.value })}
                        className="w-full px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Registration Status Override</label>
                    <select value={editFields.registrationStatus ?? ""} onChange={(e) => setEditFields({ ...editFields, registrationStatus: e.target.value })}
                      className="w-full px-3 py-2 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500">
                      <option value="">— no change —</option>
                      <option value="pre_registered">Pre-Registered</option>
                      <option value="signed_up">Signed Up</option>
                      <option value="verified">Verified</option>
                      <option value="checked_in">Checked In</option>
                      <option value="unmatched">Unmatched</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => updateBowler.mutate({ id: editingBowler.id as number, fields: editFields, actorRole: "EventDirector" })}
                disabled={updateBowler.isPending}
                className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors">
                {updateBowler.isPending ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={() => setEditingBowler(null)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
