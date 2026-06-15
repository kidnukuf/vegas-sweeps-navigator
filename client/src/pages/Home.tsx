import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getBowlerToken, BOWLER_IS_CAPTAIN_KEY } from "./BowlerLogin";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: event } = trpc.event.active.useQuery();

  // Check if a bowler is already signed in
  const bowlerToken = getBowlerToken();
  const isCapitain = localStorage.getItem(BOWLER_IS_CAPTAIN_KEY) === "1";

  const staffRoles = [
    {
      icon: "🎯",
      title: "Event Director",
      desc: "Full admin access — manage all bowlers, centers, and events",
      path: "/admin",
      color: "from-yellow-500 to-orange-500",
      glow: "shadow-yellow-500/40",
    },
    {
      icon: "📋",
      title: "Program Director",
      desc: "League-scoped oversight and reporting",
      path: "/program-director",
      color: "from-cyan-500 to-blue-500",
      glow: "shadow-cyan-500/40",
    },
    {
      icon: "🚪",
      title: "Doorman",
      desc: "Check-in guests and scan QR tickets at the door",
      path: "/doorman",
      color: "from-purple-500 to-pink-500",
      glow: "shadow-purple-500/40",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white overflow-hidden relative">
      {/* Animated background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-12">

        {/* ── Hero ── */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-4 animate-bounce">🎳</div>
          <h1
            className="text-5xl md:text-7xl font-black mb-3 tracking-tight"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              background: "linear-gradient(135deg, #ffd700, #ff8c00, #00ffff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(255,215,0,0.5))",
            }}
          >
            VEGAS SWEEPS
          </h1>
          <h2
            className="text-2xl md:text-3xl font-bold text-cyan-400 mb-2"
            style={{ textShadow: "0 0 20px rgba(0,255,255,0.6)" }}
          >
            FUNTIME
          </h2>
          {event && (
            <p className="text-gray-400 text-lg mt-2">
              {(event as Record<string, unknown>).eventName as string} •{" "}
              {(event as Record<string, unknown>).bowlingDate as string}
            </p>
          )}
          <div className="mt-4 h-px w-64 mx-auto bg-gradient-to-r from-transparent via-yellow-500 to-transparent" />
        </div>

        {/* ══════════════════════════════════════════════════════
            BOWLER / CAPTAIN SECTION — warm consumer design
            ══════════════════════════════════════════════════════ */}
        <div className="w-full max-w-4xl mb-12">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white/80 uppercase tracking-widest text-sm mb-1">
              Bowlers & Captains
            </h2>
            <p className="text-white/40 text-sm">Your personal event portal</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bowler Portal card */}
            <button
              onClick={() => setLocation(bowlerToken ? "/bowler" : "/bowler-login")}
              className="group relative overflow-hidden rounded-2xl text-left cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #0f0c29 0%, #302b63 60%, #24243e 100%)",
                border: "1px solid rgba(245,158,11,0.3)",
                boxShadow: "0 8px 32px rgba(245,158,11,0.15)",
              }}
            >
              {/* Glow overlay on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "radial-gradient(circle at 30% 50%, rgba(245,158,11,0.1), transparent 70%)" }} />

              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">🎳</div>
                  {bowlerToken && !isCapitain && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Signed In
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Bowler Portal</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  {bowlerToken && !isCapitain
                    ? "View your profile, QR ticket, lane, and event details"
                    : "Sign in or create an account to access your event profile and QR ticket"}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-amber-400 text-sm font-semibold group-hover:translate-x-1 transition-transform duration-200">
                    {bowlerToken && !isCapitain ? "Go to My Profile →" : "Sign In / Sign Up →"}
                  </span>
                </div>
              </div>
            </button>

            {/* Captain Portal card */}
            <button
              onClick={() => setLocation(bowlerToken && isCapitain ? "/captain" : "/captain-login")}
              className="group relative overflow-hidden rounded-2xl text-left cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #0a0f1e 0%, #0f172a 60%, #1e1b4b 100%)",
                border: "1px solid rgba(245,158,11,0.5)",
                boxShadow: "0 8px 32px rgba(245,158,11,0.2)",
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "radial-gradient(circle at 70% 50%, rgba(245,158,11,0.12), transparent 70%)" }} />

              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">⭐</div>
                  {bowlerToken && isCapitain && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/30 text-amber-200 border border-amber-400/50">
                      Captain
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Team Captain Portal</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  {bowlerToken && isCapitain
                    ? "Manage your team roster, verify members, and track completion"
                    : "Captains: sign in to manage your team roster and verify members"}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-amber-300 text-sm font-semibold group-hover:translate-x-1 transition-transform duration-200">
                    {bowlerToken && isCapitain ? "Go to My Team →" : "Captain Sign In →"}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            STAFF / ADMIN SECTION — neon dark design
            ══════════════════════════════════════════════════════ */}
        <div className="w-full max-w-4xl">
          <div className="text-center mb-6">
            <div className="flex items-center gap-3 justify-center mb-1">
              <div className="h-px flex-1 bg-white/10" />
              <h2 className="text-sm font-bold text-white/40 uppercase tracking-widest">Staff Access</h2>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <p className="text-white/30 text-xs">Protected — authorized personnel only</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {staffRoles.map((role) => (
              <button
                key={role.path}
                onClick={() => setLocation(role.path)}
                className={`group relative p-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm
                  hover:border-white/30 hover:bg-white/10 transition-all duration-200
                  hover:shadow-2xl ${role.glow} hover:scale-[1.02] active:scale-[0.98]
                  text-left cursor-pointer`}
              >
                <div
                  className={`absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-200 bg-gradient-to-br ${role.color}`}
                />
                <div className="text-3xl mb-3">{role.icon}</div>
                <h3 className="text-base font-bold text-white mb-1">{role.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{role.desc}</p>
                <div
                  className={`mt-3 h-0.5 w-0 group-hover:w-full transition-all duration-300 bg-gradient-to-r ${role.color}`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-600 text-sm">
          <p>Vegas Sweeps Funtime Event Management System</p>
          <p className="mt-1 text-xs">Powered by local-first technology • Works offline</p>
        </div>
      </div>
    </div>
  );
}
