import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { getBowlerToken, BOWLER_IS_CAPTAIN_KEY } from "./BowlerLogin";

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: event } = trpc.event.active.useQuery();

  // Check if a bowler is already signed in
  const bowlerToken = getBowlerToken();
  const isCapitain = localStorage.getItem(BOWLER_IS_CAPTAIN_KEY) === "1";

  return (
    <div
      className="min-h-screen text-white overflow-hidden relative"
      style={{
        backgroundImage: "url('/manus-storage/bg-bowlers-orleans-bound_c7329b96.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/60 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-10">

        {/* ── Logo + Hero ── */}
        <div className="text-center mb-10">
          {/* App logo */}
          <div className="flex justify-center mb-4">
            <img
              src="/manus-storage/logo-no-bg_c2fbc3b5.png"
              alt="B.O.B. Roll-off Passport"
              className="w-40 h-40 md:w-52 md:h-52 object-contain drop-shadow-2xl"
              style={{ filter: "drop-shadow(0 0 24px rgba(255,215,0,0.5))" }}
            />
          </div>
          <h1
            className="text-4xl md:text-6xl font-black mb-2 tracking-tight"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              background: "linear-gradient(135deg, #ffd700, #ff8c00, #00ffff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 30px rgba(255,215,0,0.6))",
            }}
          >
            B.O.B. Roll-off Passport
          </h1>
          <h2
            className="text-xl md:text-2xl font-bold text-cyan-300 mb-2"
            style={{ textShadow: "0 0 20px rgba(0,255,255,0.7)" }}
          >
            Bowlers Orleans Bound
          </h2>
          {event && (
            <p className="text-yellow-200/80 text-base mt-1">
              {(event as Record<string, unknown>).eventName as string} •{" "}
              {(event as Record<string, unknown>).bowlingDate as string}
            </p>
          )}
          <div className="mt-4 h-px w-64 mx-auto bg-gradient-to-r from-transparent via-yellow-400 to-transparent opacity-70" />
        </div>

        {/* ══════════════════════════════════════════════════════
            BOWLER / CAPTAIN SECTION
            ══════════════════════════════════════════════════════ */}
        <div className="w-full max-w-4xl mb-12">
          <div className="text-center mb-6">
            <h2 className="text-sm font-bold text-white/70 uppercase tracking-widest mb-1">
              Bowlers &amp; Captains
            </h2>
            <p className="text-white/40 text-sm">Your personal event portal</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bowler Portal card */}
            <button
              onClick={() => setLocation(bowlerToken ? "/bowler" : "/bowler-login")}
              className="group relative overflow-hidden rounded-2xl text-left cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "rgba(15,12,41,0.82)",
                border: "1px solid rgba(245,158,11,0.45)",
                boxShadow: "0 8px 32px rgba(245,158,11,0.2)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "radial-gradient(circle at 30% 50%, rgba(245,158,11,0.12), transparent 70%)" }} />
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
                <p className="text-white/55 text-sm leading-relaxed">
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
                background: "rgba(10,15,30,0.82)",
                border: "1px solid rgba(245,158,11,0.55)",
                boxShadow: "0 8px 32px rgba(245,158,11,0.25)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "radial-gradient(circle at 70% 50%, rgba(245,158,11,0.14), transparent 70%)" }} />
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
                <p className="text-white/55 text-sm leading-relaxed">
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

        {/* Footer */}
        <div className="mt-8 text-center text-white/30 text-xs">
          <p>B.O.B. Roll-off Passport Event Management System</p>
          <p className="mt-1">Powered by local-first technology • Works offline</p>
        </div>
      </div>
    </div>
  );
}
