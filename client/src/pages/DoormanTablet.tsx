import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Confetti particle ────────────────────────────────────────────────────────
interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  shape: "rect" | "circle";
}

function ConfettiBurst({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>(0);

  const COLORS = ["#00ff88", "#00e5ff", "#ffd700", "#ff6b6b", "#c084fc", "#34d399", "#f9a825", "#ffffff"];

  const spawnParticles = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.45;
    const particles: Particle[] = [];
    for (let i = 0; i < 120; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 10;
      particles.push({
        id: i,
        x: cx + (Math.random() - 0.5) * 80,
        y: cy + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 5 + Math.random() * 7,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
        shape: Math.random() > 0.4 ? "rect" : "circle",
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      particlesRef.current = [];
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    spawnParticles();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particlesRef.current = particlesRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.35,
          vx: p.vx * 0.98,
          rotation: p.rotation + p.rotationSpeed,
          opacity: p.y > canvas.height * 0.85 ? Math.max(0, p.opacity - 0.04) : p.opacity,
        }))
        .filter((p) => p.opacity > 0 && p.y < canvas.height + 20);

      for (const p of particlesRef.current) {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        if (p.shape === "rect") {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, spawnParticles]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      className="fixed inset-0 z-[110] pointer-events-none"
    />
  );
}

type PassportMode = "pool" | "banquet" | "guest-pool";
type ScanResult = "granted" | "used" | "disabled" | "invalid" | null;
type TabletTab = "passport" | "checkin";

// ─── PIN Pad ──────────────────────────────────────────────────────────────────
function PinPad({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [eventId] = useState<number>(() => {
    const saved = Number(localStorage.getItem("vsn_selected_event_id"));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });

  const pinQuery = trpc.getTabletPin.useQuery({ eventId }, { retry: false });

  function handleDigit(d: string) {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length >= 4) {
      const correct = String(pinQuery.data?.pin ?? "");
      if (correct && next === correct) {
        onUnlock();
      } else if (correct && next.length === correct.length) {
        setShaking(true);
        setError(true);
        setTimeout(() => { setPin(""); setShaking(false); }, 700);
      }
    }
  }

  function handleBackspace() {
    setPin((p) => p.slice(0, -1));
    setError(false);
  }

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center p-6">
      {/* Glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-cyan-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-purple-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-xs">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🚪</div>
          <h1 className="text-3xl font-black tracking-widest text-white" style={{ fontFamily: "'Rajdhani', sans-serif", textShadow: "0 0 20px rgba(0,255,255,0.4)" }}>
            DOORMAN TABLET
          </h1>
          <p className="text-gray-500 text-sm mt-1">Enter PIN to unlock scanner</p>
        </div>

        {/* PIN dots */}
        <div className={`flex justify-center gap-4 mb-8 transition-transform ${shaking ? "animate-[shake_0.4s_ease-in-out]" : ""}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < pin.length
                  ? error ? "bg-red-500 border-red-500" : "bg-cyan-400 border-cyan-400"
                  : "bg-transparent border-white/30"
              }`}
            />
          ))}
        </div>

        {error && <p className="text-red-400 text-center text-sm mb-4 font-semibold">Incorrect PIN — try again</p>}

        {/* PIN Pad grid */}
        <div className="grid grid-cols-3 gap-3">
          {digits.map((d, i) => (
            <button
              key={i}
              onClick={() => d === "⌫" ? handleBackspace() : d ? handleDigit(d) : undefined}
              disabled={!d}
              className={`h-16 rounded-2xl text-2xl font-black transition-all active:scale-90 ${
                d === "⌫"
                  ? "bg-red-900/60 text-red-300 border border-red-500/30 hover:bg-red-800/60"
                  : d
                  ? "bg-[#1a1a1a] text-white border border-white/10 hover:bg-[#252525] hover:border-cyan-500/30"
                  : "opacity-0 pointer-events-none"
              }`}
              style={d && d !== "⌫" ? { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" } : {}}
            >
              {d}
            </button>
          ))}
        </div>

        {pinQuery.data?.pin === null && (
          <p className="text-yellow-400/60 text-center text-xs mt-6">
            No PIN set yet — ask the Event Director to set one in the admin dashboard.
          </p>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(4px); }
        }
        @keyframes grantedPop {
          0%   { transform: scale(0.6) translateY(30px); opacity: 0; }
          60%  { transform: scale(1.08) translateY(-6px); opacity: 1; }
          80%  { transform: scale(0.97) translateY(2px); }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes checkmarkBounce {
          0%   { transform: scale(0.4) rotate(-20deg); opacity: 0; }
          50%  { transform: scale(1.3) rotate(8deg); opacity: 1; }
          75%  { transform: scale(0.9) rotate(-4deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Sound effects ───────────────────────────────────────────────────────────
const STRIKE_SOUND = "/manus-storage/strike-success_748b3acc.wav";
const BUZZER_SOUND = "/manus-storage/scan-denied_e1267ac8.wav";

function playSound(url: string) {
  try {
    const audio = new Audio(url);
    audio.volume = 0.85;
    audio.play().catch(() => { /* autoplay blocked — ignore */ });
  } catch { /* ignore */ }
}

// ─── Scanner UI ───────────────────────────────────────────────────────────────
function TabletScanner({ onLock }: { onLock: () => void }) {
  const [tab, setTab] = useState<TabletTab>("passport");
  const [passportMode, setPassportMode] = useState<PassportMode>("pool");
  const [scanResult, setScanResult] = useState<ScanResult>(null);
  const [bowlerName, setBowlerName] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [scannedToken, setScannedToken] = useState("");
  const [checkInResult, setCheckInResult] = useState<{ success: boolean; message: string; bowlerName?: string } | null>(null);
  const [showDenied, setShowDenied] = useState(false);
  const [lastGranted, setLastGranted] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [checkmarkPop, setCheckmarkPop] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [inactiveTimer, setInactiveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const scannerRef = useRef<any>(null);
  const checkinScannerRef = useRef<any>(null);
  const [checkinScanning, setCheckinScanning] = useState(false);
  const passportDivId = "tablet-passport-qr";
  const checkinDivId = "tablet-checkin-qr";
  const tokenInputRef = useRef<HTMLInputElement>(null);

  // Auto-lock after 10 minutes of inactivity
  function resetInactivity() {
    if (inactiveTimer) clearTimeout(inactiveTimer);
    const t = setTimeout(() => { onLock(); toast.info("Tablet locked due to inactivity"); }, 10 * 60 * 1000);
    setInactiveTimer(t);
  }
  useEffect(() => {
    resetInactivity();
    window.addEventListener("touchstart", resetInactivity);
    window.addEventListener("click", resetInactivity);
    return () => {
      window.removeEventListener("touchstart", resetInactivity);
      window.removeEventListener("click", resetInactivity);
      if (inactiveTimer) clearTimeout(inactiveTimer);
    };
  }, []);

  // SSE for real-time sync
  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    return () => es.close();
  }, []);

  const passportScan = trpc.bowlerAuth.scanPassport.useMutation({
    onSuccess: (data) => {
      setScanResult(data.result);
      setScanMessage(data.message);
      if ("bowlerName" in data && data.bowlerName) setBowlerName(data.bowlerName);
      stopScanner();
      if (data.result === "granted") {
        playSound(STRIKE_SOUND);
        setShowConfetti(true);
        setCheckmarkPop(true);
        setTimeout(() => setShowConfetti(false), 3500);
        setTimeout(() => setCheckmarkPop(false), 3000);
      } else {
        playSound(BUZZER_SOUND);
      }
    },
    onError: (err) => { setScanResult("invalid"); setScanMessage(err.message); stopScanner(); },
  });

  const validateToken = trpc.tokens.validate.useMutation({
    onSuccess: (data: Record<string, unknown>) => {
      if (data.success) {
        const name = String(data.bowlerName ?? "");
        playSound(STRIKE_SOUND);
        setCheckInResult({ success: true, message: "ENTRY GRANTED", bowlerName: name });
        setLastGranted(name);
        setShowDenied(false);
        setShowConfetti(true);
        setCheckmarkPop(true);
        setTimeout(() => setShowConfetti(false), 3500);
        setTimeout(() => setCheckmarkPop(false), 3000);
        setTimeout(() => setCheckInResult(null), 5000);
      } else {
        playSound(BUZZER_SOUND);
        setCheckInResult({ success: false, message: `DENIED — ${data.error}` });
        setShowDenied(true);
        setTimeout(() => { setShowDenied(false); setCheckInResult(null); }, 4000);
      }
    },
    onError: (e) => {
      playSound(BUZZER_SOUND);
      setCheckInResult({ success: false, message: `DENIED — ${e.message}` });
      setShowDenied(true);
      setTimeout(() => { setShowDenied(false); setCheckInResult(null); }, 4000);
    },
  });

  function stopScanner() {
    setScanning(false);
    if (scannerRef.current) {
      try { scannerRef.current.stop(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
  }

  function stopCheckinScanner() {
    setCheckinScanning(false);
    if (checkinScannerRef.current) {
      try { checkinScannerRef.current.stop(); } catch { /* ignore */ }
      checkinScannerRef.current = null;
    }
  }

  function handlePassportScan(decodedText: string) {
    const match = decodedText.match(/\/scan\/(pool|banquet|guest-pool)\/([a-zA-Z0-9]+)/i);
    if (match) {
      passportScan.mutate({ tokenValue: match[2], passportType: match[1] as PassportMode });
    } else {
      passportScan.mutate({ tokenValue: decodedText.trim(), passportType: passportMode });
    }
  }

  function handleCheckinScan(decodedText: string) {
    validateToken.mutate({ tokenValue: decodedText.trim(), method: "QR" });
    stopCheckinScanner();
  }

  // Start passport camera
  useEffect(() => {
    if (!scanning) return;
    let mounted = true;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (!mounted) return;
      const scanner = new Html5Qrcode(passportDivId);
      scannerRef.current = scanner;
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (text: string) => { if (mounted) handlePassportScan(text); },
        () => {}
      ).catch(() => { toast.error("Camera access denied"); setScanning(false); });
    });
    return () => {
      mounted = false;
      if (scannerRef.current) { try { scannerRef.current.stop(); } catch { /* ignore */ } scannerRef.current = null; }
    };
  }, [scanning]);

  // Start check-in camera
  useEffect(() => {
    if (!checkinScanning) return;
    let mounted = true;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (!mounted) return;
      const scanner = new Html5Qrcode(checkinDivId);
      checkinScannerRef.current = scanner;
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (text: string) => { if (mounted) handleCheckinScan(text); },
        () => {}
      ).catch(() => { toast.error("Camera access denied"); setCheckinScanning(false); });
    });
    return () => {
      mounted = false;
      if (checkinScannerRef.current) { try { checkinScannerRef.current.stop(); } catch { /* ignore */ } checkinScannerRef.current = null; }
    };
  }, [checkinScanning]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Confetti canvas */}
      <ConfettiBurst active={showConfetti} />

      {/* DENIED flash */}
      {showDenied && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(220,0,0,0.15)" }}>
          <div className="text-center">
            <div className="text-8xl font-black text-red-500 tracking-widest" style={{ textShadow: "0 0 40px rgba(255,0,0,0.9)" }}>
              ⛔ DENIED
            </div>
            {checkInResult && <div className="text-red-300 text-xl mt-2 font-semibold">{checkInResult.message}</div>}
          </div>
        </div>
      )}

      {/* GRANTED flash — animated checkmark pop-up */}
      {checkInResult?.success && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          style={{ background: "rgba(0,200,0,0.10)" }}>
          <div
            className="text-center rounded-3xl px-10 py-8"
            style={{
              background: "linear-gradient(135deg, #052e16, #14532d)",
              border: "3px solid #22c55e",
              boxShadow: "0 0 80px rgba(34,197,94,0.6), 0 0 160px rgba(34,197,94,0.2)",
              animation: checkmarkPop ? "grantedPop 0.45s cubic-bezier(0.23,1,0.32,1) both" : "none",
            }}
          >
            <div
              className="text-[6rem] leading-none mb-2"
              style={{
                filter: "drop-shadow(0 0 24px rgba(34,197,94,0.9))",
                animation: checkmarkPop ? "checkmarkBounce 0.5s cubic-bezier(0.23,1,0.32,1) 0.1s both" : "none",
              }}
            >
              ✅
            </div>
            <div className="text-5xl font-black text-green-400 tracking-widest mb-2" style={{ textShadow: "0 0 30px rgba(0,255,0,0.8)" }}>
              GRANTED
            </div>
            {checkInResult.bowlerName && (
              <div className="text-green-200 text-2xl font-bold mt-1">{checkInResult.bowlerName}</div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#111] border-b border-cyan-500/30 px-4 py-3 sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-black" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#00ffff" }}>🚪 DOORMAN TABLET</span>
          <span title={sseConnected ? "Live sync" : "Connecting"} className={`w-2 h-2 rounded-full ${sseConnected ? "bg-green-400" : "bg-gray-600"}`} />
        </div>
        <button onClick={onLock} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white transition-colors">
          🔒 Lock
        </button>
      </div>

      {/* Tab selector */}
      <div className="bg-[#111] border-b border-white/10 px-4 py-2">
        <div className="max-w-lg mx-auto flex gap-1">
          <button onClick={() => setTab("passport")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === "passport" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white" : "text-gray-400 hover:text-white"}`}>
            🎫 Passport Scanner
          </button>
          <button onClick={() => setTab("checkin")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === "checkin" ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-black" : "text-gray-400 hover:text-white"}`}>
            🎳 Bowling Check-In
          </button>
        </div>
      </div>

      {/* ── PASSPORT SCANNER ─────────────────────────────────────────────────── */}
      {tab === "passport" && (
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Scan result */}
          {scanResult && (
            <div className={`rounded-2xl p-6 text-center shadow-2xl ${
              scanResult === "granted" ? "bg-green-700 border-2 border-green-400" :
              scanResult === "used" ? "bg-red-800 border-2 border-red-500" :
              scanResult === "disabled" ? "bg-orange-700 border-2 border-orange-500" :
              "bg-gray-800 border-2 border-gray-600"
            }`}>
              <div className="text-7xl mb-3">
                {scanResult === "granted" ? "✅" : scanResult === "used" ? "🚫" : scanResult === "disabled" ? "⛔" : "❌"}
              </div>
              <div className="text-3xl font-black text-white mb-1">
                {scanResult === "granted" ? "Entry Granted" : scanResult === "used" ? "Already Redeemed" : scanResult === "disabled" ? "Not Eligible" : "Invalid QR Code"}
              </div>
              {bowlerName && <div className="text-xl text-white/90 mb-1">{bowlerName}</div>}
              <div className="text-white/70 text-sm mb-4">{scanMessage}</div>
              <button onClick={() => { setScanResult(null); setBowlerName(""); setScanMessage(""); }}
                className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl border border-white/30 transition-colors">
                Scan Next →
              </button>
            </div>
          )}

          {!scanResult && (
            <>
              {/* Mode selector */}
              <div className="bg-[#1a1a1a] rounded-2xl p-1 flex gap-1 border border-white/10 flex-wrap">
                <button onClick={() => setPassportMode("pool")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${passportMode === "pool" ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}>
                  🏊 Pool Party
                </button>
                <button onClick={() => setPassportMode("banquet")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${passportMode === "banquet" ? "bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}>
                  🍽️ Banquet Dinner
                </button>
                <button onClick={() => setPassportMode("guest-pool")}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${passportMode === "guest-pool" ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}>
                  🎟️ Guest Pool
                </button>
              </div>

              {/* Camera */}
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
                {scanning ? (
                  <div>
                    <div id={passportDivId} className="w-full" />
                    <div className="p-3 text-center">
                      <button onClick={stopScanner} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Stop Camera</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="text-6xl mb-4">📷</div>
                    <p className="text-gray-500 text-sm mb-4">Tap to activate camera and scan a bowler's passport QR code.</p>
                    <button onClick={() => setScanning(true)}
                      className={`w-full py-4 font-black text-lg rounded-xl text-white transition-all active:scale-95 ${passportMode === "pool" ? "bg-gradient-to-r from-cyan-500 to-blue-600" : passportMode === "guest-pool" ? "bg-gradient-to-r from-teal-500 to-cyan-600" : "bg-gradient-to-r from-purple-500 to-pink-600"}`}>
                      📷 Start Camera Scan
                    </button>
                  </div>
                )}
              </div>

              {/* Manual entry */}
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-4">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Manual Entry</p>
                <form onSubmit={(e) => { e.preventDefault(); if (!manualToken.trim()) return; const m = manualToken.trim().match(/\/scan\/(pool|banquet|guest-pool)\/([a-f0-9-]+)/i); if (m) { passportScan.mutate({ tokenValue: m[2], passportType: m[1] as PassportMode }); } else { passportScan.mutate({ tokenValue: manualToken.trim(), passportType: passportMode }); } setManualToken(""); }} className="flex gap-2">
                  <input type="text" placeholder="Paste QR URL or token..." value={manualToken} onChange={(e) => setManualToken(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500 font-mono" />
                  <button type="submit" disabled={passportScan.isPending || !manualToken.trim()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-amber-900 font-black rounded-lg disabled:opacity-50 transition-colors">
                    {passportScan.isPending ? "..." : "Scan"}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── BOWLING CHECK-IN ──────────────────────────────────────────────────── */}
      {tab === "checkin" && (
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {lastGranted && !checkInResult && (
            <div className="bg-[#0a1a0a] rounded-2xl border border-green-500/40 p-4 flex items-center gap-3">
              <div className="text-3xl">✅</div>
              <div>
                <div className="text-xs text-green-400 font-semibold uppercase tracking-widest">Last Entry Granted</div>
                <div className="text-lg font-bold text-white">{lastGranted}</div>
              </div>
            </div>
          )}

          {/* Camera scan */}
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden">
            {checkinScanning ? (
              <div>
                <div id={checkinDivId} className="w-full" />
                <div className="p-3 text-center">
                  <button onClick={stopCheckinScanner} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">Stop Camera</button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="text-6xl mb-4">📷</div>
                <p className="text-gray-500 text-sm mb-4">Scan a bowler's entry ticket QR code to check them in.</p>
                <button onClick={() => setCheckinScanning(true)}
                  className="w-full py-4 font-black text-lg rounded-xl text-black transition-all active:scale-95"
                  style={{ background: "linear-gradient(135deg, #ffd700, #ffaa00)", boxShadow: "0 0 20px rgba(255,215,0,0.3)" }}>
                  📷 Start Camera Scan
                </button>
              </div>
            )}
          </div>

          {/* Manual / Bluetooth HID */}
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-4">
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Manual / Bluetooth Scanner</p>
            <div className="flex gap-3">
              <input ref={tokenInputRef} value={scannedToken} onChange={(e) => setScannedToken(e.target.value)}
                placeholder="Scan QR or enter token..."
                className="flex-1 px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500 font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && scannedToken) {
                    validateToken.mutate({ tokenValue: scannedToken, method: "QR" });
                    setScannedToken("");
                  }
                }} />
              <button onClick={() => { if (!scannedToken) return; validateToken.mutate({ tokenValue: scannedToken, method: "QR" }); setScannedToken(""); }}
                disabled={validateToken.isPending || !scannedToken}
                className="px-5 py-2 font-black rounded-lg text-sm transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #ffd700, #ffaa00)", color: "#000" }}>
                {validateToken.isPending ? "..." : "SCAN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function DoormanTablet() {
  const [unlocked, setUnlocked] = useState(false);
  return unlocked
    ? <TabletScanner onLock={() => setUnlocked(false)} />
    : <PinPad onUnlock={() => setUnlocked(true)} />;
}
