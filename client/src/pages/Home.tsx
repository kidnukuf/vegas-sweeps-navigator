import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { ArrowRight, ClipboardCheck, ShieldCheck, Smartphone, TicketCheck, UsersRound, WifiOff } from "lucide-react";
import { getBowlerToken, BOWLER_IS_CAPTAIN_KEY } from "./BowlerLogin";
import {
  detectGroupSlug,
  detectWebsiteBrand,
  detectJuneGroupNumber,
  setJuneGroupNumber,
  GROUP_THEMES,
} from "@/lib/eventGroup";
import AppFooter from "@/components/AppFooter";

export default function Home() {
  const [, setLocation] = useLocation();
  const brand = detectWebsiteBrand();
  const isPrimaryDomain = typeof window !== "undefined" && ["www.bowlvegas.com", "bowlvegas.com"].includes(window.location.hostname.toLowerCase());
  const [juneGroup, setJuneGroup] = useState<number | null>(() => detectJuneGroupNumber());

  // For funtimeteamchallenge.com, require group selection before showing portal
  const needsGroupSelect = brand === "june" && juneGroup === null;

  const groupSlug = detectGroupSlug();
  const groupTheme = GROUP_THEMES[groupSlug];

  // Check if a bowler is already signed in
  const bowlerToken = getBowlerToken();
  const isCapitain = localStorage.getItem(BOWLER_IS_CAPTAIN_KEY) === "1";

  // Determine background and branding based on group
  const isValentine = groupSlug === "valentine";
  const isJune = brand === "june";
  const bgImage = (isValentine || isJune)
    ? undefined // Valentine & June use solid dark bg with gradient
    : "/manus-storage/bg-bowlers-orleans-bound_c7329b96.jpg";
  const primaryColor = groupTheme.color;
  const accentColor = groupTheme.accent;
  const publicTitle = isPrimaryDomain ? "Bowl Vegas" : groupTheme.name;
  const publicSubtitle = isPrimaryDomain ? "Event operations in one place" : "Your Official Event Passport";

  // ── Group selector screen for funtimeteamchallenge.com ──────────────────────
  if (needsGroupSelect) {
    return (
      <div className="min-h-screen text-white flex flex-col items-center justify-center px-4"
        style={{ background: "linear-gradient(135deg, #1a0a2e 0%, #2a0a4e 40%, #0d0820 100%)" }}>
        <div className="flex flex-col items-center gap-3 mb-10">
          <img
            src="/manus-storage/june-logo-2_937344ed.jpg"
            alt="Funtime Team Challenge"
            className="w-64 md:w-80 object-contain rounded-3xl"
            style={{ filter: "drop-shadow(0 0 32px rgba(212,175,55,0.7))" }}
          />
          <img
            src="/manus-storage/june-logo-1_a6163a08.jpg"
            alt="June Funtime"
            className="w-52 md:w-64 object-contain rounded-3xl"
            style={{ filter: "drop-shadow(0 0 20px rgba(212,175,55,0.5))" }}
          />
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-center mb-2 tracking-tight"
          style={{ fontFamily: "'Orbitron', sans-serif", background: "linear-gradient(135deg, #d4af37, #f5d060, #7b2fbe)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Funtime Team Challenge
        </h1>
        <p className="text-white/60 text-sm mb-10 text-center">Select your group to continue</p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => {
                setJuneGroupNumber(n);
                setJuneGroup(n);
              }}
              className="group relative overflow-hidden rounded-2xl py-8 text-center cursor-pointer transition-all duration-200 hover:scale-[1.04] active:scale-[0.97]"
              style={{
                background: "rgba(15,10,35,0.85)",
                border: "1px solid rgba(212,175,55,0.45)",
                boxShadow: "0 8px 32px rgba(212,175,55,0.2)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "radial-gradient(circle at 50% 50%, rgba(212,175,55,0.18), transparent 70%)" }} />
              <div className="relative">
                <div className="text-4xl font-black mb-1"
                  style={{ fontFamily: "'Orbitron', sans-serif", color: "#d4af37", textShadow: "0 0 20px rgba(212,175,55,0.6)" }}>
                  {n}
                </div>
                <div className="text-white/70 text-xs font-semibold uppercase tracking-wider">Group {n}</div>
              </div>
            </button>
          ))}
        </div>
        <p className="mt-10 text-white/25 text-xs text-center">
          Funtime Team Challenge — Event Management System
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white overflow-hidden relative"
      style={{
        backgroundImage: bgImage ? `url('${bgImage}')` : undefined,
        background: isValentine
          ? "linear-gradient(135deg, #1a0020 0%, #2d0035 30%, #1a0a2e 60%, #0d0015 100%)"
          : isJune
          ? "linear-gradient(135deg, #1a0a2e 0%, #2a0a4e 30%, #1a0a2e 60%, #0d0820 100%)"
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "scroll",
      }}
    >
      {/* Dark overlay for readability (only for image backgrounds) */}
      {bgImage && <div className="absolute inset-0 bg-black/60 pointer-events-none" />}

      <div className="relative z-10 flex flex-col items-center min-h-screen px-4 py-10">

        {/* ── Logo + Hero ── */}
        <div className="text-center mb-10">
          {/* App logo / Banner */}
          <div className="flex justify-center mb-4">
            {isPrimaryDomain ? (
              <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-[2rem] border border-cyan-300/50 bg-slate-950/80 shadow-2xl shadow-cyan-300/20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.34),transparent_44%),radial-gradient(circle_at_15%_85%,rgba(250,204,21,0.24),transparent_40%)]" />
                <div className="relative text-center" style={{ fontFamily: "'Orbitron', sans-serif" }}>
                  <p className="text-xs font-bold tracking-[0.35em] text-cyan-200">BOWL</p>
                  <p className="mt-1 text-4xl font-black tracking-tight text-amber-300">VEGAS</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/70">Navigator</p>
                </div>
              </div>
            ) : isValentine ? (
              // Valentine: show both images stacked — banner on top, logo below
              <div className="flex flex-col items-center gap-3">
                <img
                  src="/manus-storage/valentine-logo-2_51b648e0.jpg"
                  alt="Valentine Funtime"
                  className="w-72 md:w-96 object-contain drop-shadow-2xl rounded-3xl"
                  style={{ filter: `drop-shadow(0 0 32px rgba(233,30,140,0.7))` }}
                />
                <img
                  src="/manus-storage/valentine-logo-1_ace6cce5.jpg"
                  alt="Valentine Funtime 2027"
                  className="w-64 h-64 md:w-80 md:h-80 object-contain drop-shadow-2xl rounded-3xl"
                  style={{ filter: `drop-shadow(0 0 24px rgba(233,30,140,0.5))` }}
                />
              </div>
            ) : isJune ? (
              // June Funtime: show both images stacked — banner on top, logo below
              <div className="flex flex-col items-center gap-3">
                <img
                  src="/manus-storage/june-logo-2_937344ed.jpg"
                  alt="June Funtime Bowling Event"
                  className="w-72 md:w-96 object-contain drop-shadow-2xl rounded-3xl"
                  style={{ filter: `drop-shadow(0 0 32px rgba(212,175,55,0.7))` }}
                />
                <img
                  src="/manus-storage/june-logo-1_a6163a08.jpg"
                  alt="June Funtime Roll-Off"
                  className="w-64 h-64 md:w-80 md:h-80 object-contain drop-shadow-2xl rounded-3xl"
                  style={{ filter: `drop-shadow(0 0 24px rgba(212,175,55,0.5))` }}
                />
              </div>
            ) : (
              <img
                src="/manus-storage/bob-logo_c7d62f79.jpg"
                alt="B.O.B. Roll-off Passport"
                className="w-64 h-64 md:w-80 md:h-80 object-contain drop-shadow-2xl rounded-3xl"
                style={{ filter: "drop-shadow(0 0 32px rgba(255,215,0,0.6))" }}
              />
            )}
          </div>
          <h1
            className="bob-header-title text-4xl md:text-6xl font-black mb-1 tracking-tight cursor-default select-none"
            style={{
              fontFamily: "'Orbitron', 'Rajdhani', sans-serif",
              background: isValentine
                ? "linear-gradient(135deg, #e91e8c, #ff69b4, #ffd700)"
                : isJune
                ? "linear-gradient(135deg, #d4af37, #f5d060, #7b2fbe)"
                : "linear-gradient(135deg, #ffd700, #ff8c00, #00ffff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: `drop-shadow(0 0 30px ${primaryColor}99)`,
            }}
          >
            {publicTitle}
          </h1>
          <h2
            className="text-lg md:text-xl font-semibold mb-2"
            style={{ color: isValentine ? "#ff69b4" : isJune ? "#d4af37" : "#67e8f9", textShadow: `0 0 16px ${primaryColor}99` }}
          >
            {publicSubtitle}
          </h2>
          {isPrimaryDomain && (
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/75 md:text-base">
              Registration, team coordination, QR event passes, and live check-in tools for traveling bowling events.
            </p>
          )}
          <div className="mt-4 h-px w-64 mx-auto opacity-70"
            style={{ background: `linear-gradient(to right, transparent, ${primaryColor}, transparent)` }} />
        </div>

        {/* ══════════════════════════════════════════════════════
            BOWLER / CAPTAIN SECTION
            ══════════════════════════════════════════════════════ */}
        <div className="w-full max-w-4xl mb-12">
          <div className="text-center mb-6">
            <h2 className="text-sm font-bold text-white/90 uppercase tracking-widest mb-1">
              Bowlers &amp; Captains
            </h2>
            <p className="text-white/70 text-sm">Your personal event portal</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bowler Portal card */}
            <button
              onClick={() => setLocation(bowlerToken ? "/bowler" : "/bowler-login")}
              className="group relative overflow-hidden rounded-2xl text-left cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "rgba(15,12,41,0.82)",
                border: `1px solid ${primaryColor}73`,
                boxShadow: `0 8px 32px ${primaryColor}33`,
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: `radial-gradient(circle at 30% 50%, ${primaryColor}1f, transparent 70%)` }} />
              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">🎳</div>
                  {bowlerToken && !isCapitain && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold border"
                      style={{ background: `${primaryColor}33`, color: primaryColor, borderColor: `${primaryColor}66` }}>
                      Signed In
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Bowler Portal</h3>
                <p className="text-white/80 text-sm leading-relaxed">
                  {bowlerToken && !isCapitain
                    ? "View your profile, QR ticket, lane, and event details"
                    : "Sign in or create an account to access your event profile and QR ticket"}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm font-semibold group-hover:translate-x-1 transition-transform duration-200"
                    style={{ color: primaryColor }}>
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
                border: `1px solid ${primaryColor}8c`,
                boxShadow: `0 8px 32px ${primaryColor}40`,
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: `radial-gradient(circle at 70% 50%, ${primaryColor}24, transparent 70%)` }} />
              <div className="relative p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">⭐</div>
                  {bowlerToken && isCapitain && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold border"
                      style={{ background: `${primaryColor}4d`, color: "#fff", borderColor: `${primaryColor}80` }}>
                      Captain
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Team Captain Portal</h3>
                <p className="text-white/80 text-sm leading-relaxed">
                  {bowlerToken && isCapitain
                    ? "Manage your team roster, verify members, and track completion"
                    : "Captains: sign in to manage your team roster and verify members"}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm font-semibold group-hover:translate-x-1 transition-transform duration-200"
                    style={{ color: accentColor === primaryColor ? primaryColor : accentColor }}>
                    {bowlerToken && isCapitain ? "Go to My Team →" : "Captain Sign In →"}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <section className="w-full max-w-4xl rounded-3xl border border-cyan-300/15 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 backdrop-blur-md md:p-8" aria-labelledby="how-it-works-title">
          <div className="mb-6 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">How it works</p>
            <h2 id="how-it-works-title" className="mt-2 text-2xl font-black text-white md:text-3xl">Everything you need for event week.</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">The platform gives each role a clear starting point while the event team keeps rosters, access, and live operations synchronized.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><TicketCheck className="h-6 w-6 text-amber-300" /><h3 className="mt-4 font-bold text-white">1. Claim & sign up</h3><p className="mt-2 text-sm leading-relaxed text-slate-300">Bowlers use their claim code to create secure access to their event profile.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><Smartphone className="h-6 w-6 text-cyan-300" /><h3 className="mt-4 font-bold text-white">2. Carry your passport</h3><p className="mt-2 text-sm leading-relaxed text-slate-300">View squad, lanes, T-shirt information, and QR passes for eligible event activities.</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><UsersRound className="h-6 w-6 text-fuchsia-300" /><h3 className="mt-4 font-bold text-white">3. Keep teams aligned</h3><p className="mt-2 text-sm leading-relaxed text-slate-300">Captains can check their roster and guide team members through completion.</p></div>
          </div>
        </section>

        <section className="mt-6 w-full max-w-4xl overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.11] via-slate-950/80 to-cyan-300/[0.08] p-5 shadow-2xl shadow-black/20 md:p-8" aria-labelledby="director-workflow-title">
          <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">For Event Directors</p>
              <h2 id="director-workflow-title" className="mt-2 text-2xl font-black text-white md:text-3xl">Plan, validate, and run the event from one system.</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">Event Directors work from the secured Director Portal. It is separate from bowler sign-up and is built for event setup, roster correction, and live operations.</p>
              <button onClick={() => setLocation("/ed")} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition-transform duration-150 hover:brightness-110 active:scale-[0.97]">Open Event Director Portal <ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" /><div><h3 className="font-semibold text-white">Prepare the roster</h3><p className="mt-1 text-sm text-slate-300">Create the event, choose the exact Google Sheet tab, review center matches, and issue IDs and claim codes.</p></div></div>
              <div className="flex gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><h3 className="font-semibold text-white">Validate access</h3><p className="mt-1 text-sm text-slate-300">Confirm QR passes, guest tickets, banquet eligibility, and age-status information before event week.</p></div></div>
              <div className="flex gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4"><WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-300" /><div><h3 className="font-semibold text-white">Operate reliably on site</h3><p className="mt-1 text-sm text-slate-300">Export the offline scanner workflow for venue connectivity gaps, then bring used scans back into the event record.</p></div></div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="mt-8 text-center text-white/30 text-xs">
          <p>{groupTheme.name} — Event Management System</p>
          <p className="mt-1">Powered by local-first technology • Works offline</p>
          {isJune && juneGroup && (
            <p className="mt-2">
              <button
                onClick={() => { sessionStorage.removeItem("juneGroupNumber"); setJuneGroup(null); }}
                className="text-yellow-500/40 hover:text-yellow-400/70 transition-colors text-xs tracking-wider"
              >
                ← Change Group (currently Group {juneGroup})
              </button>
            </p>
          )}
          <p className="mt-3">
            <a
              href="/ed"
              className="text-white/20 transition-colors text-xs tracking-widest uppercase"
              style={{ ['--hover-color' as string]: `${primaryColor}99` }}
              onMouseEnter={e => (e.currentTarget.style.color = `${primaryColor}99`)}
              onMouseLeave={e => (e.currentTarget.style.color = '')}
            >
              ⚙ Event Director Terminal
            </a>
          </p>
        </div>
      </div>

      <AppFooter dark />
    </div>
  );
}
