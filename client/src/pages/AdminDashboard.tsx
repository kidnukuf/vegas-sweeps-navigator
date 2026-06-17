import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

// ─── Local storage key for ED session ────────────────────────────────────────
const ED_TOKEN_KEY = "vsn_ed_token";
function getEdToken() { return localStorage.getItem(ED_TOKEN_KEY); }
function clearEdToken() { localStorage.removeItem(ED_TOKEN_KEY); }

// ─── ED Login Gate ────────────────────────────────────────────────────────────
function EdLoginGate({ onAuth }: { onAuth: () => void }) {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = trpc.appAuth.login.useMutation({
    onSuccess: (data) => {
      if (data.user?.appRole !== "EventDirector") {
        toast.error("Access denied. Event Director credentials required.");
        return;
      }
      localStorage.setItem(ED_TOKEN_KEY, data.token ?? "");
      onAuth();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return toast.error("Enter username and password");
    login.mutate({ username, password });
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4">
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-yellow-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-orange-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Back */}
        <button onClick={() => setLocation("/")} className="text-gray-500 hover:text-white text-sm mb-8 flex items-center gap-1 transition-colors">
          ← Back to Home
        </button>

        {/* Icon */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎯</div>
          <h1 className="text-3xl font-black tracking-tight" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700", textShadow: "0 0 20px rgba(255,215,0,0.4)" }}>
            EVENT DIRECTOR
          </h1>
          <p className="text-gray-500 text-sm mt-1">Staff access only</p>
        </div>

        {/* Login card */}
        <form onSubmit={handleSubmit} className="bg-[#1a1a1a] border border-yellow-500/20 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="block text-yellow-400/80 text-xs font-bold uppercase tracking-wider mb-1.5">Username</label>
            <input
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 transition-colors"
              placeholder="ED username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-yellow-400/80 text-xs font-bold uppercase tracking-wider mb-1.5">Password</label>
            <input
              type="password"
              className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 transition-colors"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={login.isPending}
            className="w-full py-2.5 rounded-lg font-bold text-black transition-all duration-150 active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)", boxShadow: "0 4px 20px rgba(255,215,0,0.3)" }}
          >
            {login.isPending ? "Authenticating…" : "Access Dashboard →"}
          </button>
        </form>

        <p className="text-center text-gray-700 text-xs mt-4">
          Authorized personnel only. All actions are logged.
        </p>
      </div>
    </div>
  );
}

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

function AdminDashboardInner({ onSignOut }: { onSignOut: () => void }) {
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
  const [accountFilter, setAccountFilter] = useState<"all" | "signed_up" | "not_signed_up">("all");

  const toggleCenter = (name: string) => setCollapsedCenters((prev) => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });
  const toggleTeam = (key: string) => setCollapsedTeams((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  // ─── Active event selection (multi-event support) ──────────────────────────
  const SELECTED_EVENT_KEY = "vsn_selected_event_id";
  const [selectedEventId, setSelectedEventId] = useState<number>(() => {
    const saved = Number(localStorage.getItem(SELECTED_EVENT_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const EVENT_ID = selectedEventId;
  const selectEvent = (id: number) => {
    setSelectedEventId(id);
    localStorage.setItem(SELECTED_EVENT_KEY, String(id));
  };

  const { data: events = [], refetch: refetchEvents } = trpc.event.list.useQuery();
  const activeEvent = useMemo(
    () => (events as Record<string, unknown>[]).find((e) => Number(e.id) === EVENT_ID) ?? null,
    [events, EVENT_ID]
  );

  // Event create / rename state
  const [showEventMenu, setShowEventMenu] = useState(false);
  const [eventModal, setEventModal] = useState<null | { mode: "create" | "rename"; name: string; year: string; id?: number }>(null);

  const createEventMut = trpc.event.create.useMutation({
    onSuccess: (res) => {
      toast.success("Event created");
      setEventModal(null);
      refetchEvents();
      if (res?.id) selectEvent(res.id);
    },
    onError: (e) => toast.error(e.message),
  });
  const renameEventMut = trpc.event.rename.useMutation({
    onSuccess: () => { toast.success("Event renamed"); setEventModal(null); refetchEvents(); },
    onError: (e) => toast.error(e.message),
  });

  const { data: bowlers = [], isLoading, refetch } = trpc.bowlers.adminList.useQuery({ eventId: EVENT_ID });
  const { data: stats } = trpc.bowlers.stats.useQuery({ eventId: EVENT_ID });
  const { data: auditLog = [] } = trpc.audit.list.useQuery({ eventId: EVENT_ID, limit: 200 });
  const { data: doormen = [], refetch: refetchDoormen } = trpc.appAuth.listDoormen.useQuery({ eventId: EVENT_ID });
  const unmatchedBowlers = useMemo(() => (bowlers as Bowler[]).filter((b) => b.registrationStatus === "unmatched"), [bowlers]);

  const resetBowlerPassword = trpc.bowlers.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password cleared — bowler can now re-register");
      setEditingBowler(null);
      setConfirmReset(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const [confirmReset, setConfirmReset] = useState(false);

  // ─── Permanent bowler deletion ─────────────────────────────────────
  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const deleteBowlerMut = trpc.bowlers.delete.useMutation({
    onSuccess: () => {
      toast.success("Bowler permanently deleted");
      setEditingBowler(null);
      setShowDeletePanel(false);
      setDeleteConfirmText("");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateBowler = trpc.bowlers.update.useMutation({
    onSuccess: () => { toast.success("Bowler updated"); refetch(); setEditingBowler(null); },
    onError: (e) => toast.error(e.message),
  });

  // Reset destructive-action panels whenever the edited bowler changes.
  useEffect(() => {
    setConfirmReset(false);
    setShowDeletePanel(false);
    setDeleteConfirmText("");
  }, [editingBowler?.id]);

  const createDoorman = trpc.appAuth.createDoorman.useMutation({
    onSuccess: () => { toast.success("Doorman created"); refetchDoormen(); setNewDoorman({ designation: "", password: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const [showExportMenu, setShowExportMenu] = useState(false);

  const eventSlug = useMemo(() => {
    const name = String(activeEvent?.eventName ?? "event");
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
  }, [activeEvent]);

  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportFullRoster = () => {
    const rows = (bowlers as Bowler[]);
    if (!rows.length) { toast.error("No data to export"); return; }
    downloadCSV(`${eventSlug}-full-roster.csv`,
      ["ScantronID","FirstName","LastName","Phone","Email","Center","Team","Status","CheckIn","Room","Banquet","LaneAssignment","SquadTime"],
      rows.map((b) => [b.scantronId,b.legalFirstName,b.legalLastName,b.phone,b.email,b.centerName,b.teamName,b.registrationStatus,b.checkinDate,b.roomType,b.banquetAmount,b.laneAssignment,b.squadTime] as string[])
    );
    toast.success("Full roster exported"); setShowExportMenu(false);
  };

  const exportByCenter = () => {
    const rows = (bowlers as Bowler[]);
    if (!rows.length) { toast.error("No data to export"); return; }
    // Group by center and create separate CSV sections
    const grouped: Record<string, Bowler[]> = {};
    rows.forEach((b) => { const c = String(b.centerName ?? "Unknown"); if (!grouped[c]) grouped[c] = []; grouped[c].push(b); });
    const headers = ["Center","ScantronID","FirstName","LastName","Team","Status","Phone"];
    const allRows: string[][] = [];
    Object.entries(grouped).forEach(([center, members]) => {
      allRows.push([`=== ${center} (${members.length} bowlers) ===`, "", "", "", "", "", ""]);
      members.forEach((b) => allRows.push([center,b.scantronId,b.legalFirstName,b.legalLastName,b.teamName,b.registrationStatus,b.phone] as string[]));
    });
    downloadCSV(`${eventSlug}-by-center.csv`, headers, allRows);
    toast.success("Per-center export done"); setShowExportMenu(false);
  };

  const exportCheckedIn = () => {
    const rows = (bowlers as Bowler[]).filter((b) => b.registrationStatus === "checked_in");
    if (!rows.length) { toast.error("No checked-in bowlers yet"); return; }
    downloadCSV(`${eventSlug}-checkedin.csv`,
      ["ScantronID","FirstName","LastName","Center","Team","Phone","LaneAssignment","SquadTime"],
      rows.map((b) => [b.scantronId,b.legalFirstName,b.legalLastName,b.centerName,b.teamName,b.phone,b.laneAssignment,b.squadTime] as string[])
    );
    toast.success("Check-in status exported"); setShowExportMenu(false);
  };

  const exportAuditLog = () => {
    const logs = (auditLog as Record<string, unknown>[]);
    if (!logs.length) { toast.error("No audit log entries yet"); return; }
    downloadCSV(`${eventSlug}-audit-log.csv`,
      ["Timestamp","Action","ActorRole","ActorId","TargetType","TargetId","Details"],
      logs.map((l) => [l.createdAt,l.action,l.actorRole,l.actorId,l.targetType,l.targetId,l.details] as string[])
    );
    toast.success("Audit log exported"); setShowExportMenu(false);
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
      if (accountFilter === "signed_up" && !b.passwordHash) return false;
      if (accountFilter === "not_signed_up" && !!b.passwordHash) return false;
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

  const notSignedUpCount = useMemo(() => (bowlers as Bowler[]).filter((b) => !b.passwordHash).length, [bowlers]);
  const signedUpCount = useMemo(() => (bowlers as Bowler[]).filter((b) => !!b.passwordHash).length, [bowlers]);

  const statCards = [
    { label: "Total", value: (stats as Record<string, unknown>)?.total ?? 0, color: "text-white", filter: "all" as const },
    { label: "Pre-Reg", value: (stats as Record<string, unknown>)?.preRegistered ?? 0, color: "text-gray-400", filter: null },
    { label: "Signed Up", value: signedUpCount, color: "text-green-400", filter: "signed_up" as const },
    { label: "Not Signed Up", value: notSignedUpCount, color: "text-orange-400", filter: "not_signed_up" as const },
    { label: "Checked In", value: (stats as Record<string, unknown>)?.checkedIn ?? 0, color: "text-yellow-400", filter: null },
    { label: "Unmatched", value: (stats as Record<string, unknown>)?.unmatched ?? 0, color: "text-red-400", filter: null },
  ];

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="bg-[#1a1a1a] border-b border-yellow-500/30 px-4 py-4 sticky top-0 z-40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/")} className="text-gray-400 hover:text-white text-sm">← Home</button>
            <button onClick={onSignOut} className="text-red-400/60 hover:text-red-400 text-xs ml-2 transition-colors">Sign Out</button>
            <span className="text-gray-600">|</span>
            <h1 className="text-2xl font-black" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700", textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>
              🎯 EVENT DIRECTOR
            </h1>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <button onClick={() => setShowExportMenu(!showExportMenu)} className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-sm font-semibold transition-colors">📤 Export ▾</button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-yellow-500/30 rounded-xl shadow-xl z-50 min-w-[200px] overflow-hidden">
                  <button onClick={exportFullRoster} className="w-full px-4 py-2.5 text-left text-sm hover:bg-yellow-500/10 text-yellow-300 transition-colors">📋 Full Roster</button>
                  <button onClick={exportByCenter} className="w-full px-4 py-2.5 text-left text-sm hover:bg-yellow-500/10 text-yellow-300 transition-colors">🏠 Per-Center Roster</button>
                  <button onClick={exportCheckedIn} className="w-full px-4 py-2.5 text-left text-sm hover:bg-yellow-500/10 text-cyan-300 transition-colors">✅ Check-In Status</button>
                  <button onClick={exportAuditLog} className="w-full px-4 py-2.5 text-left text-sm hover:bg-yellow-500/10 text-gray-300 transition-colors">📜 Audit Log</button>
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setShowEventMenu(!showEventMenu)} className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm font-semibold transition-colors">🗓️ Events ▾</button>
              {showEventMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-yellow-500/30 rounded-xl shadow-xl z-50 min-w-[260px] overflow-hidden">
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">Switch active event</div>
                  {(events as Record<string, unknown>[]).map((e) => {
                    const id = Number(e.id);
                    const isActive = id === EVENT_ID;
                    return (
                      <button
                        key={id}
                        onClick={() => { selectEvent(id); setShowEventMenu(false); }}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between gap-2 ${isActive ? "bg-yellow-500/15 text-yellow-300" : "hover:bg-white/5 text-gray-200"}`}
                      >
                        <span className="truncate">{String(e.eventName)} <span className="text-gray-500">· {String(e.eventYear)}</span></span>
                        {isActive && <span className="text-[10px] text-yellow-400">● active</span>}
                      </button>
                    );
                  })}
                  <div className="border-t border-white/10">
                    <button onClick={() => { setEventModal({ mode: "create", name: "", year: String(new Date().getFullYear()) }); setShowEventMenu(false); }} className="w-full px-4 py-2.5 text-left text-sm hover:bg-green-500/10 text-green-300 transition-colors">＋ Create New Event</button>
                    <button
                      onClick={() => { if (activeEvent) { setEventModal({ mode: "rename", name: String(activeEvent.eventName), year: String(activeEvent.eventYear), id: EVENT_ID }); } setShowEventMenu(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-yellow-500/10 text-yellow-300 transition-colors"
                    >✏️ Rename Current Event</button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setLocation("/import")} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-semibold transition-colors">📥 Import Data</button>
          </div>
        </div>
      </div>

      {/* Active event title bar */}
      <div className="bg-gradient-to-r from-yellow-500/10 via-purple-500/5 to-transparent border-b border-yellow-500/20 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-gray-500">Active Event</span>
          <span className="text-lg font-bold text-yellow-300" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
            {activeEvent ? `${activeEvent.eventName} · ${activeEvent.eventYear}` : `Event #${EVENT_ID}`}
          </span>
          <span className="text-xs text-gray-500">All data below is scoped to this event</span>
        </div>
      </div>

      <div className="bg-[#111] border-b border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto grid grid-cols-3 sm:grid-cols-6 gap-3">
          {statCards.map((s) => (
            <button
              key={s.label}
              onClick={() => { if (s.filter) { setAccountFilter(s.filter); setActiveTab("roster"); } }}
              className={`text-center rounded-xl px-2 py-1.5 transition-colors ${
                s.filter
                  ? accountFilter === s.filter
                    ? "bg-yellow-500/20 ring-1 ring-yellow-500/50 cursor-pointer"
                    : "hover:bg-white/5 cursor-pointer"
                  : "cursor-default"
              }`}
            >
              <div className={`text-2xl font-black ${s.color}`}>{String(s.value)}</div>
              <div className={`text-xs ${s.filter ? "text-gray-400" : "text-gray-500"}`}>{s.label}</div>
            </button>
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
              {accountFilter !== "all" && (
                <button
                  onClick={() => setAccountFilter("all")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/20 border border-orange-500/40 text-orange-300 rounded-xl text-xs font-semibold hover:bg-orange-500/30 transition-colors"
                >
                  {accountFilter === "not_signed_up" ? "⚠ Not Signed Up" : "✓ Signed Up"} ✕
                </button>
              )}
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
                        if (accountFilter === "signed_up" && !b.passwordHash) return false;
                        if (accountFilter === "not_signed_up" && !!b.passwordHash) return false;
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return String(b.legalFirstName ?? "").toLowerCase().includes(q) || String(b.legalLastName ?? "").toLowerCase().includes(q) || String(b.scantronId ?? "").includes(q) || String(b.phone ?? "").includes(q) || String(b.centerName ?? "").toLowerCase().includes(q) || String(b.teamName ?? "").toLowerCase().includes(q);
                      }).map((b) => {
                        const hasAccount = !!b.passwordHash;
                        return (
                        <tr key={String(b.id)} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${hasAccount ? "bg-green-950/40" : ""}`}>
                          <td className="px-4 py-2 font-mono text-yellow-400 text-xs">{String(b.scantronId ?? "—")}</td>
                          <td className="px-4 py-2 font-semibold">
                            <div className="flex items-center gap-2">
                              <span>{b.isCapitain ? "⭐ " : ""}{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</span>
                              {hasAccount && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">✓ Signed Up</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{String(b.centerName ?? "—")}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{String(b.teamName ?? "—")}</td>
                          <td className="px-4 py-2 text-gray-400">{String(b.phone ?? "—")}</td>
                          <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[String(b.registrationStatus ?? "pre_registered")]}`}>{STATUS_LABELS[String(b.registrationStatus ?? "pre_registered")] ?? String(b.registrationStatus)}</span></td>
                          <td className="px-4 py-2"><button onClick={() => { setEditingBowler(b); setEditFields({ legalFirstName: String(b.legalFirstName ?? ""), legalLastName: String(b.legalLastName ?? ""), phone: String(b.phone ?? ""), email: String(b.email ?? ""), notes: String(b.notes ?? ""), sanctionNumber: String(b.sanctionNumber ?? ""), gamesPlayed: String(b.gamesPlayed ?? ""), bestAverage: String(b.bestAverage ?? ""), tshirtSize: String(b.tshirtSize ?? ""), under21: b.under21 ? "true" : "false", leagueMember: b.leagueMember ? "true" : "false" }); }} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors">Edit</button></td>
                        </tr>
                        );
                      })}
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
                              {members.map((b) => {
                                const hasAccount = !!b.passwordHash;
                                return (
                                <tr key={String(b.id)} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${hasAccount ? "bg-green-950/40" : ""}`}>
                                  <td className="px-4 py-2 font-mono text-yellow-400 text-xs">{String(b.scantronId ?? "—")}</td>
                                  <td className="px-4 py-2 font-semibold">
                                    <div className="flex items-center gap-2">
                                      <span>{b.isCapitain ? "⭐ " : ""}{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</span>
                                      {hasAccount && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">✓ Signed Up</span>}
                                    </div>
                                  </td>
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
                                    <button onClick={() => { setEditingBowler(b); setEditFields({ legalFirstName: String(b.legalFirstName ?? ""), legalLastName: String(b.legalLastName ?? ""), phone: String(b.phone ?? ""), email: String(b.email ?? ""), notes: String(b.notes ?? ""), sanctionNumber: String(b.sanctionNumber ?? ""), gamesPlayed: String(b.gamesPlayed ?? ""), bestAverage: String(b.bestAverage ?? ""), tshirtSize: String(b.tshirtSize ?? ""), under21: b.under21 ? "true" : "false", leagueMember: b.leagueMember ? "true" : "false" });
                                    }}
                                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors">Edit</button>
                                  </td>
                                </tr>
                                );
                              })}
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
                      <button onClick={() => { setEditingBowler(b); setEditFields({ legalFirstName: String(b.legalFirstName ?? ""), legalLastName: String(b.legalLastName ?? ""), phone: String(b.phone ?? ""), email: String(b.email ?? ""), notes: String(b.notes ?? ""), registrationStatus: "signed_up", sanctionNumber: String(b.sanctionNumber ?? ""), gamesPlayed: String(b.gamesPlayed ?? ""), bestAverage: String(b.bestAverage ?? ""), tshirtSize: String(b.tshirtSize ?? ""), under21: b.under21 ? "true" : "false", leagueMember: b.leagueMember ? "true" : "false" }); setShowAllFields(true); }}
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
                  {/* Bowling stats fields from new sheet */}
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Bowling Stats</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["sanctionNumber", "gamesPlayed", "bestAverage", "tshirtSize"] as const).map((field) => (
                        <div key={field}>
                          <label className="text-xs text-gray-400 mb-1 block">{field === "sanctionNumber" ? "Sanction #" : field === "gamesPlayed" ? "# Games" : field === "bestAverage" ? "Best Avg" : "T-Shirt Size"}</label>
                          <input value={editFields[field] ?? ""} onChange={(e) => setEditFields({ ...editFields, [field]: e.target.value })}
                            className="w-full px-2 py-1.5 bg-[#111] border border-white/20 rounded text-white text-sm focus:outline-none focus:border-yellow-500" />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={editFields.under21 === "true" || editFields.under21 === "1"}
                          onChange={(e) => setEditFields({ ...editFields, under21: e.target.checked ? "true" : "false" })}
                          className="accent-yellow-500" />
                        Under 21
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={editFields.leagueMember === "true" || editFields.leagueMember === "1"}
                          onChange={(e) => setEditFields({ ...editFields, leagueMember: e.target.checked ? "true" : "false" })}
                          className="accent-yellow-500" />
                        League Member
                      </label>
                    </div>
                  </div>
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
              <button onClick={() => { setEditingBowler(null); setConfirmReset(false); }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">Cancel</button>
            </div>

            {/* Reset Password section */}
            <div className="mt-4 pt-4 border-t border-white/10">
              {!confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  disabled={!editingBowler.passwordHash}
                  className="w-full py-2 bg-red-900/40 hover:bg-red-800/60 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg text-sm font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {editingBowler.passwordHash ? "🔑 Reset Password (allow bowler to re-register)" : "No account — password not set"}
                </button>
              ) : (
                <div className="bg-red-900/20 border border-red-500/40 rounded-lg p-3 space-y-2">
                  <p className="text-red-300 text-sm font-semibold">Clear this bowler's password?</p>
                  <p className="text-gray-400 text-xs">Their account will be removed and they will need to sign up again on the Bowler Portal.</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => resetBowlerPassword.mutate({ id: editingBowler.id as number, actorRole: "EventDirector" })}
                      disabled={resetBowlerPassword.isPending}
                      className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors"
                    >
                      {resetBowlerPassword.isPending ? "Resetting..." : "Yes, Reset Password"}
                    </button>
                    <button onClick={() => setConfirmReset(false)} className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Permanent delete section */}
            <div className="mt-4 pt-4 border-t border-red-500/20">
              {!showDeletePanel ? (
                <button
                  onClick={() => { setShowDeletePanel(true); setDeleteConfirmText(""); }}
                  className="w-full py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-600/40 text-red-400 hover:text-red-300 rounded-lg text-sm font-semibold transition-colors"
                >
                  🗑️ Delete Bowler Permanently
                </button>
              ) : (
                <div className="bg-red-950/30 border border-red-600/50 rounded-lg p-3 space-y-2">
                  <p className="text-red-300 text-sm font-bold">⚠️ This action is PERMANENT.</p>
                  <p className="text-gray-300 text-xs">
                    This will permanently delete <span className="text-white font-semibold">{String(editingBowler.legalFirstName ?? "")} {String(editingBowler.legalLastName ?? "")}</span> and all of their related records (hotel, payment, tokens, wristbands, check-ins). <span className="text-red-300 font-semibold">The data cannot be recovered.</span>
                  </p>
                  <label className="block text-xs text-gray-400 mt-2">Type <span className="font-mono text-red-300 font-bold">DELETE</span> to confirm:</label>
                  <input
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full bg-black/50 border border-red-500/40 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-red-400"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => deleteBowlerMut.mutate({ id: editingBowler.id as number, actorRole: "EventDirector" })}
                      disabled={deleteConfirmText !== "DELETE" || deleteBowlerMut.isPending}
                      className="flex-1 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {deleteBowlerMut.isPending ? "Deleting..." : "Permanently Delete"}
                    </button>
                    <button onClick={() => { setShowDeletePanel(false); setDeleteConfirmText(""); }} className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Event create / rename modal */}
      {eventModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" onClick={() => setEventModal(null)}>
          <div className="bg-[#1a1a1a] border border-yellow-500/30 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-yellow-400 mb-4">{eventModal.mode === "create" ? "Create New Event" : "Rename Event"}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Event Name</label>
                <input
                  value={eventModal.name}
                  onChange={(e) => setEventModal({ ...eventModal, name: e.target.value })}
                  placeholder="e.g. Funtime Team Challenge 2027"
                  className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Year</label>
                <input
                  type="number"
                  value={eventModal.year}
                  onChange={(e) => setEventModal({ ...eventModal, year: e.target.value })}
                  className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  const name = eventModal.name.trim();
                  const year = parseInt(eventModal.year, 10);
                  if (!name) { toast.error("Event name is required"); return; }
                  if (!Number.isFinite(year)) { toast.error("Valid year is required"); return; }
                  if (eventModal.mode === "create") createEventMut.mutate({ eventName: name, eventYear: year });
                  else if (eventModal.id) renameEventMut.mutate({ id: eventModal.id, eventName: name, eventYear: year });
                }}
                disabled={createEventMut.isPending || renameEventMut.isPending}
                className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors disabled:opacity-50"
              >
                {createEventMut.isPending || renameEventMut.isPending ? "Saving..." : eventModal.mode === "create" ? "Create Event" : "Save Name"}
              </button>
              <button onClick={() => setEventModal(null)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [isAuthed, setIsAuthed] = useState(() => !!getEdToken());
  if (!isAuthed) return <EdLoginGate onAuth={() => setIsAuthed(true)} />;
  return <AdminDashboardInner onSignOut={() => { clearEdToken(); setIsAuthed(false); }} />;
}
