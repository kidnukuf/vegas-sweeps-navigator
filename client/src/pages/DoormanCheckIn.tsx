import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

type DoormanTab = "checkin" | "passport";
type PassportMode = "pool" | "banquet";
type PassportScanResult = "granted" | "used" | "disabled" | "invalid" | null;

type BowlerResult = Record<string, unknown>;

export default function DoormanCheckIn() {
  const [, setLocation] = useLocation();
  const [designation, setDesignation] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [doormanId, setDoormanId] = useState<number>(0);
  const [scannedToken, setScannedToken] = useState("");
  const [checkInResult, setCheckInResult] = useState<{ success: boolean; message: string; bowlerName?: string } | null>(null);
  const [showDenied, setShowDenied] = useState(false);
  const [wristbandMode, setWristbandMode] = useState(false);
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reentrySearch, setReentrySearch] = useState("");
  const [reentryQuery, setReentryQuery] = useState("");
  const [selectedBowler, setSelectedBowler] = useState<BowlerResult | null>(null);
  const [reentryBowler, setReentryBowler] = useState<BowlerResult | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [lastCheckedIn, setLastCheckedIn] = useState<{ name: string; scantronId: string; center: string; team?: string; laneNumber?: string; squadTime?: string; timeSlot?: string; bowlingDate?: string; isCapitain?: boolean } | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Passport scanner state
  const [doormanTab, setDoormanTab] = useState<DoormanTab>("checkin");
  const [passportMode, setPassportMode] = useState<PassportMode>("pool");
  const [passportScanResult, setPassportScanResult] = useState<PassportScanResult>(null);
  const [passportBowlerName, setPassportBowlerName] = useState("");
  const [passportMessage, setPassportMessage] = useState("");
  const [passportScanning, setPassportScanning] = useState(false);
  const [passportManualToken, setPassportManualToken] = useState("");
  const passportScannerRef = useRef<any>(null);
  const passportDivId = "passport-qr-reader";

  // SSE subscription — real-time token invalidation from other doorman tablets
  useEffect(() => {
    if (!loggedIn) return;
    const es = new EventSource("/api/events/stream");
    es.onopen = () => setSseConnected(true);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as Record<string, unknown>;
        if (msg.type === "TOKEN_INVALIDATED") {
          toast.info(`Token used at ${String(msg.designation ?? "another station")} — ${String(msg.bowlerName ?? "")}`);
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => setSseConnected(false);
    return () => es.close();
  }, [loggedIn]);

  const passportScanMutation = trpc.bowlerAuth.scanPassport.useMutation({
    onSuccess: (data) => {
      setPassportScanResult(data.result);
      setPassportMessage(data.message);
      if ("bowlerName" in data && data.bowlerName) setPassportBowlerName(data.bowlerName);
      stopPassportScanner();
    },
    onError: (err) => {
      setPassportScanResult("invalid");
      setPassportMessage(err.message);
      stopPassportScanner();
    },
  });

  function stopPassportScanner() {
    setPassportScanning(false);
    if (passportScannerRef.current) {
      try { passportScannerRef.current.stop(); } catch { /* ignore */ }
      passportScannerRef.current = null;
    }
  }

  function handlePassportScanSuccess(decodedText: string) {
    const match = decodedText.match(/\/scan\/(pool|banquet)\/([a-f0-9]+)/i);
    if (match) {
      passportScanMutation.mutate({ tokenValue: match[2], passportType: match[1] as PassportMode });
    } else {
      passportScanMutation.mutate({ tokenValue: decodedText.trim(), passportType: passportMode });
    }
  }

  function handlePassportManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passportManualToken.trim()) return;
    const match = passportManualToken.trim().match(/\/scan\/(pool|banquet)\/([a-f0-9]+)/i);
    if (match) {
      passportScanMutation.mutate({ tokenValue: match[2], passportType: match[1] as PassportMode });
    } else {
      passportScanMutation.mutate({ tokenValue: passportManualToken.trim(), passportType: passportMode });
    }
    setPassportManualToken("");
  }

  const loginMutation = trpc.appAuth.doormanLogin.useMutation({
    onSuccess: (data) => {
      const d = data as Record<string, unknown>;
      if (d.success) {
        setLoggedIn(true);
        setDoormanId(Number(d.doormanId ?? 0));
        toast.success(`Welcome, ${designation}!`);
      } else {
        toast.error("Invalid credentials");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const searchQuery_q = trpc.bowlers.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 }
  );
  const reentryQuery_q = trpc.bowlers.search.useQuery(
    { query: reentryQuery },
    { enabled: reentryQuery.length >= 2 }
  );

  const validateToken = trpc.tokens.validate.useMutation({
    onSuccess: (data: Record<string, unknown>) => {
      if (data.success) {
        const b = (data.bowler ?? {}) as Record<string, unknown>;
        const name = String(data.bowlerName ?? "");
        const sid = String(b.scantronId ?? data.scantronId ?? "");
        const center = String(b.centerName ?? data.centerName ?? "");
        const team = b.teamName ? String(b.teamName) : undefined;
        const laneNumber = b.laneNumber ? String(b.laneNumber) : undefined;
        const squadTime = b.squadTime ? String(b.squadTime) : undefined;
        const timeSlot = b.timeSlot ? String(b.timeSlot) : undefined;
        const bowlingDate = b.bowlingDate ? String(b.bowlingDate) : undefined;
        const isCapitain = Boolean(b.isCapitain);
        setCheckInResult({ success: true, message: `ENTRY GRANTED`, bowlerName: name });
        setLastCheckedIn({ name, scantronId: sid, center, team, laneNumber, squadTime, timeSlot, bowlingDate, isCapitain });
        setShowDenied(false);
        toast.success("Check-in successful!");
        setTimeout(() => setCheckInResult(null), 5000);
      } else {
        setCheckInResult({ success: false, message: `DENIED — ${data.error}` });
        setShowDenied(true);
        toast.error(String(data.error ?? "Invalid token"));
        setTimeout(() => { setShowDenied(false); setCheckInResult(null); }, 4000);
      }
    },
    onError: (e) => {
      setCheckInResult({ success: false, message: `DENIED — ${e.message}` });
      setShowDenied(true);
      setTimeout(() => { setShowDenied(false); setCheckInResult(null); }, 4000);
    },
  });

  const issueWristband = trpc.wristbands.issue.useMutation({
    onSuccess: () => {
      toast.success("Wristband issued. Remind guest of wristband policy.");
      setWristbandMode(false);
      setReentryBowler(null);
      setReentrySearch("");
      setReentryQuery("");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const denyWristband = trpc.wristbands.deny.useMutation({
    onSuccess: () => {
      toast.error("Re-entry denied and logged.");
      setShowDenied(true);
      setTimeout(() => setShowDenied(false), 3000);
    },
  });

  // Auto-focus token input after login
  useEffect(() => {
    if (loggedIn && tokenInputRef.current) {
      tokenInputRef.current.focus();
    }
  }, [loggedIn]);

  // Initialize passport QR scanner
  useEffect(() => {
    if (!passportScanning) return;
    let mounted = true;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (!mounted) return;
      const scanner = new Html5Qrcode(passportDivId);
      passportScannerRef.current = scanner;
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => { if (mounted) handlePassportScanSuccess(decodedText); },
        () => { /* ignore */ }
      ).catch(() => {
        toast.error("Camera access denied. Use manual entry.");
        setPassportScanning(false);
      });
    });
    return () => {
      mounted = false;
      if (passportScannerRef.current) {
        try { passportScannerRef.current.stop(); } catch { /* ignore */ }
        passportScannerRef.current = null;
      }
    };
  }, [passportScanning]);

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] rounded-2xl border border-cyan-500/40 p-8 max-w-sm w-full shadow-[0_0_40px_rgba(0,255,255,0.1)]">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🚪</div>
            <h1 className="text-2xl font-black tracking-widest" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#00ffff", textShadow: "0 0 20px rgba(0,255,255,0.6)" }}>
              DOORMAN LOGIN
            </h1>
            <p className="text-gray-500 text-sm mt-1">B.O.B. Roll-off Passport 2026</p>
          </div>
          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Username</label>
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Enter username"
                className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                onKeyDown={(e) => e.key === "Enter" && loginMutation.mutate({ designation, password })} />
            </div>
          </div>
          <button onClick={() => loginMutation.mutate({ designation, password })}
            disabled={loginMutation.isPending || !designation || !password}
            className="w-full py-3 font-black rounded-xl text-lg transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #ffd700, #ffaa00)", color: "#000", boxShadow: "0 0 20px rgba(255,215,0,0.4)" }}>
            {loginMutation.isPending ? "Signing in..." : "🔐 Sign In"}
          </button>
          <button onClick={() => setLocation("/")} className="w-full mt-3 py-2 text-gray-500 hover:text-gray-300 text-sm transition-colors">← Back to Home</button>
        </div>
      </div>
    );
  }

  const reentryBowlerData = (reentryQuery_q.data?.[0] ?? reentryBowler) as BowlerResult | null;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white relative">
      {/* DENIED FLASH OVERLAY */}
      {showDenied && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          style={{ animation: "deniedFlash 0.4s ease-in-out 3", background: "rgba(220,0,0,0.15)" }}>
          <div className="text-center">
            <div className="text-8xl font-black text-red-500 tracking-widest" style={{ textShadow: "0 0 40px rgba(255,0,0,0.9), 0 0 80px rgba(255,0,0,0.5)" }}>
              ⛔ DENIED
            </div>
            {checkInResult && <div className="text-red-300 text-xl mt-2 font-semibold">{checkInResult.message}</div>}
          </div>
        </div>
      )}

      {/* GRANTED FLASH */}
      {checkInResult?.success && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(0,200,0,0.08)" }}>
          <div className="text-center bg-[#0a1a0a] border-2 border-green-500 rounded-3xl px-10 py-8 shadow-[0_0_60px_rgba(0,255,0,0.4)]">
            <div className="text-7xl font-black text-green-400 tracking-widest" style={{ textShadow: "0 0 30px rgba(0,255,0,0.8)" }}>
              ✅ GRANTED
            </div>
            <div className="text-green-300 text-2xl mt-2 font-bold">{checkInResult.bowlerName}</div>
          </div>
        </div>
      )}

      {/* Tab Selector */}
      <div className="bg-[#111] border-b border-white/10 px-4 py-2 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto flex gap-1">
          <button onClick={() => setDoormanTab("checkin")}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${doormanTab === "checkin" ? "bg-yellow-500 text-black" : "text-gray-400 hover:text-white"}`}>
            🎳 Bowling Check-In
          </button>
          <button onClick={() => setDoormanTab("passport")}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${doormanTab === "passport" ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}>
            🎫 Passport Scanner
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="bg-[#1a1a1a] border-b border-yellow-500/30 px-4 py-4 sticky top-[52px] z-40">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold" style={{ color: "#00ffff" }}>{designation}</span>
            <span className="text-gray-600">|</span>
            <h1 className="text-xl font-black" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700", textShadow: "0 0 15px rgba(255,215,0,0.5)" }}>
              🚪 DOORMAN CHECK-IN
            </h1>
            <span title={sseConnected ? "Live sync active" : "Connecting..."}
              className={`w-2 h-2 rounded-full ${sseConnected ? "bg-green-400" : "bg-gray-600"}`} />
          </div>
          <button onClick={() => setWristbandMode(!wristbandMode)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${wristbandMode ? "bg-green-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
            {wristbandMode ? "✅ Wristband Mode ON" : "🔄 Reentry Mode"}
          </button>
        </div>
      </div>

      {/* Persistent Reminder Panel */}
      {!reminderDismissed && (
        <div className="bg-yellow-900/30 border-b border-yellow-500/40 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-start justify-between gap-3">
            <div className="text-xs text-yellow-300 leading-relaxed">
              <strong>⚠️ DOORMAN CHECKLIST:</strong> (1) Verify government-issued photo ID matches name on record. (2) Check wristband condition — if damaged, tampered, or appears swapped, deny re-entry immediately. (3) When issuing wristbands, verbally state: <em>"This wristband is issued ONE TIME ONLY. Tampering or swapping means DENIED re-entry. No exceptions."</em>
            </div>
            <button onClick={() => setReminderDismissed(true)} className="text-yellow-500 hover:text-yellow-300 text-xs shrink-0">Dismiss</button>
          </div>
        </div>
      )}

      {/* ── PASSPORT SCANNER TAB ─────────────────────────────────────────── */}
      {doormanTab === "passport" && (
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Passport scan result overlay */}
          {passportScanResult && (
            <div className={`rounded-2xl p-6 text-center shadow-2xl ${
              passportScanResult === "granted" ? "bg-green-700 border-2 border-green-400" :
              passportScanResult === "used" ? "bg-red-800 border-2 border-red-500" :
              passportScanResult === "disabled" ? "bg-orange-700 border-2 border-orange-500" :
              "bg-gray-800 border-2 border-gray-600"
            }`}>
              <div className="text-7xl mb-3">
                {passportScanResult === "granted" ? "✅" : passportScanResult === "used" ? "🚫" : passportScanResult === "disabled" ? "⛔" : "❌"}
              </div>
              <div className="text-3xl font-black text-white mb-1">
                {passportScanResult === "granted" ? "Entry Granted" : passportScanResult === "used" ? "Already Redeemed" : passportScanResult === "disabled" ? "Not Eligible" : "Invalid QR Code"}
              </div>
              {passportBowlerName && <div className="text-xl text-white/90 mb-1">{passportBowlerName}</div>}
              <div className="text-white/70 text-sm mb-4">{passportMessage}</div>
              <button onClick={() => { setPassportScanResult(null); setPassportBowlerName(""); setPassportMessage(""); }}
                className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl border border-white/30">
                Scan Next →
              </button>
            </div>
          )}

          {!passportScanResult && (
            <>
              {/* Mode selector */}
              <div className="bg-[#1a1a1a] rounded-2xl p-1 flex gap-1 border border-white/10">
                <button onClick={() => setPassportMode("pool")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                    passportMode === "pool" ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                  }`}>
                  🏊 Pool Party
                </button>
                <button onClick={() => setPassportMode("banquet")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                    passportMode === "banquet" ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                  }`}>
                  🍽️ Banquet Dinner
                </button>
              </div>

              {/* Camera scanner */}
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
                {passportScanning ? (
                  <div>
                    <div id={passportDivId} className="w-full" />
                    <div className="p-3 text-center">
                      <button onClick={stopPassportScanner}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">
                        Stop Camera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="text-6xl mb-4">📷</div>
                    <p className="text-gray-500 text-sm mb-4">Tap to activate camera and scan a bowler's passport QR code.</p>
                    <button onClick={() => setPassportScanning(true)}
                      className={`w-full py-4 font-black text-lg rounded-xl text-white ${
                        passportMode === "pool" ? "bg-gradient-to-r from-cyan-500 to-blue-600" : "bg-gradient-to-r from-purple-500 to-pink-600"
                      }`}>
                      Start Camera Scan
                    </button>
                  </div>
                )}
              </div>

              {/* Manual entry */}
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-4">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Manual Entry</p>
                <form onSubmit={handlePassportManualSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste QR URL or token..."
                    value={passportManualToken}
                    onChange={(e) => setPassportManualToken(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 font-mono"
                  />
                  <button type="submit"
                    disabled={passportScanMutation.isPending || !passportManualToken.trim()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-amber-900 font-black rounded-lg disabled:opacity-50">
                    {passportScanMutation.isPending ? "..." : "Scan"}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CHECK-IN TAB ─────────────────────────────────────────────────────── */}
      {doormanTab === "checkin" && (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Last Checked-In Bowler Card */}
        {lastCheckedIn && (
          <div className="bg-[#0a1a0a] rounded-2xl border-2 border-green-500/60 p-5 shadow-[0_0_40px_rgba(0,255,0,0.2)]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-xs text-green-400 font-semibold mb-2 tracking-widest">✅ ENTRY GRANTED</div>
                <div className="text-2xl font-black text-white mb-0.5">
                  {lastCheckedIn.isCapitain && <span className="text-yellow-400 mr-1">⭐</span>}
                  {lastCheckedIn.name}
                </div>
                <div className="text-sm text-gray-400 mb-2">{lastCheckedIn.center}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {lastCheckedIn.team && (
                    <div className="bg-[#111] rounded-lg px-3 py-2">
                      <div className="text-gray-500 mb-0.5">Team</div>
                      <div className="text-cyan-300 font-semibold">{lastCheckedIn.team}</div>
                    </div>
                  )}
                  {lastCheckedIn.laneNumber && (
                    <div className="bg-[#111] rounded-lg px-3 py-2">
                      <div className="text-gray-500 mb-0.5">Lane</div>
                      <div className="text-yellow-400 font-black text-base">{lastCheckedIn.laneNumber}</div>
                    </div>
                  )}
                  {(lastCheckedIn.squadTime || lastCheckedIn.timeSlot) && (
                    <div className="bg-[#111] rounded-lg px-3 py-2">
                      <div className="text-gray-500 mb-0.5">Squad Time</div>
                      <div className="text-white font-semibold">{lastCheckedIn.squadTime ?? lastCheckedIn.timeSlot}</div>
                    </div>
                  )}
                  {lastCheckedIn.bowlingDate && (
                    <div className="bg-[#111] rounded-lg px-3 py-2">
                      <div className="text-gray-500 mb-0.5">Date</div>
                      <div className="text-white font-semibold">{lastCheckedIn.bowlingDate}</div>
                    </div>
                  )}
                </div>
                <div className="text-xs font-mono mt-3 text-yellow-400/80">{lastCheckedIn.scantronId}</div>
              </div>
              <div className="text-5xl shrink-0">🎳</div>
            </div>
          </div>
        )}

        {/* QR Scan / Token Entry */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">QR Code / Bluetooth Scanner / Manual Token</h2>
          <p className="text-xs text-gray-600 mb-3">Bluetooth HID scanners auto-input here. Camera scan or type token manually.</p>
          <div className="flex gap-3">
            <input ref={tokenInputRef} value={scannedToken} onChange={(e) => setScannedToken(e.target.value)}
              placeholder="Scan QR or enter token..."
              className="flex-1 px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500 font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && scannedToken) {
                  validateToken.mutate({ tokenValue: scannedToken, method: "QR", doormanId: doormanId || undefined });
                  setScannedToken("");
                }
              }} />
            <button onClick={() => { if (!scannedToken) return; validateToken.mutate({ tokenValue: scannedToken, method: "QR", doormanId: doormanId || undefined }); setScannedToken(""); }}
              disabled={validateToken.isPending || !scannedToken}
              className="px-5 py-2 font-black rounded-lg text-sm transition-all active:scale-95 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #ffd700, #ffaa00)", color: "#000", boxShadow: "0 0 15px rgba(255,215,0,0.3)" }}>
              {validateToken.isPending ? "..." : "SCAN"}
            </button>
          </div>
        </div>

        {/* Name/Phone/ID Search */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Search by Name, Phone, or Scantron ID</h2>
          <div className="flex gap-3 mb-3">
            <input value={search} onChange={(e) => { setSearch(e.target.value); setSearchQuery(e.target.value); }}
              placeholder="Name, phone, or 9-digit ID..."
              className="flex-1 px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500" />
          </div>
          {(searchQuery_q.data ?? []).length > 0 && (
            <div className="space-y-2">
              {(searchQuery_q.data as BowlerResult[]).map((b) => (
                <div key={String(b.id)} className="flex items-center justify-between p-3 bg-[#111] rounded-xl border border-white/10">
                  <div>
                    <div className="font-bold text-white">{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</div>
                    <div className="text-xs text-gray-400">{String(b.centerName ?? "")} • {String(b.phone ?? "")}</div>
                    <div className="text-xs font-mono" style={{ color: "#ffd700" }}>{String(b.scantronId ?? "")}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedBowler(b)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      style={{ background: "#ffd700", color: "#000" }}>
                      Check In
                    </button>
                    <button onClick={() => denyWristband.mutate({ bowlerId: b.id as number, eventId: 1, doormanId: doormanId || 0, reason: "Wristband Compromised" })}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg text-xs font-bold transition-colors">
                      🚫 Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wristband / Reentry Mode */}
        {wristbandMode && (
          <div className="bg-[#1a1a1a] rounded-2xl border border-green-500/30 p-5">
            <h2 className="text-sm font-semibold text-green-400 mb-1">🔄 Reentry Wristband Issuance</h2>
            <div className="bg-yellow-900/30 border border-yellow-500/30 rounded-xl p-3 mb-4 text-xs text-yellow-300">
              ⚠️ <strong>MANDATORY DOORMAN PROMPT:</strong> Before issuing, verbally state to the guest: <em>"This wristband is issued ONE TIME ONLY. If it is damaged, tampered with, altered, or appears to have been swapped to another person, re-entry will be DENIED. No exceptions."</em> Confirm they understand before proceeding.
            </div>
            <div className="flex gap-3 mb-3">
              <input value={reentrySearch} onChange={(e) => { setReentrySearch(e.target.value); setReentryQuery(e.target.value); }}
                placeholder="Search bowler for wristband..."
                className="flex-1 px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-green-500" />
            </div>
            {reentryBowlerData && (
              <div className="p-4 bg-[#111] rounded-xl border border-green-500/30">
                <div className="font-bold text-white mb-1">{String(reentryBowlerData.legalFirstName ?? "")} {String(reentryBowlerData.legalLastName ?? "")}</div>
                <div className="text-xs text-gray-400 mb-1">{String(reentryBowlerData.centerName ?? "")} • {String(reentryBowlerData.phone ?? "")}</div>
                <div className="text-xs font-mono text-yellow-400 mb-3">{String(reentryBowlerData.scantronId ?? "")}</div>
                <div className="flex gap-3">
                  <button onClick={() => issueWristband.mutate({ bowlerId: reentryBowlerData.id as number, eventId: 1, doormanId: doormanId || 0 })}
                    disabled={issueWristband.isPending}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-sm transition-colors">
                    {issueWristband.isPending ? "Issuing..." : "✅ Issue Wristband"}
                  </button>
                  <button onClick={() => denyWristband.mutate({ bowlerId: reentryBowlerData.id as number, eventId: 1, doormanId: doormanId || 0, reason: "Wristband Compromised" })}
                    disabled={denyWristband.isPending}
                    className="flex-1 py-2 bg-red-700 hover:bg-red-600 rounded-lg font-bold text-sm transition-colors">
                    🚫 Deny — Wristband Compromised
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Check-in Confirmation Modal */}
      {selectedBowler && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-yellow-500/40 p-6 max-w-sm w-full text-center shadow-[0_0_40px_rgba(255,215,0,0.15)]">
            <div className="text-5xl mb-3">🎳</div>
            <h3 className="text-xl font-black mb-1" style={{ color: "#ffd700" }}>Confirm Check-In</h3>
            <div className="bg-[#111] rounded-xl p-4 mb-5">
              <div className="font-bold text-white text-lg">{String(selectedBowler.legalFirstName ?? "")} {String(selectedBowler.legalLastName ?? "")}</div>
              <div className="text-sm text-gray-400">{String(selectedBowler.centerName ?? "")} • Team {String(selectedBowler.teamCode ?? "")}</div>
              <div className="font-mono text-sm mt-1" style={{ color: "#ffd700" }}>{String(selectedBowler.scantronId ?? "")}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => {
                validateToken.mutate({ tokenValue: `MANUAL:${selectedBowler.id}`, method: "manual", doormanId: doormanId || undefined });
                setSelectedBowler(null);
              }} className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-black transition-colors">
                ✅ GRANT ENTRY
              </button>
              <button onClick={() => setSelectedBowler(null)} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes deniedFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
