/**
 * AdLanding — Digital advertisement / invite page for B.O.B. Roll-off Passport
 *
 * Marketing goals:
 *  1. Urgency + exclusivity ("Be the first")
 *  2. Social proof framing (seamless, modern, official)
 *  3. Clear value proposition (no app store, instant access)
 *  4. Friction-free CTA (one tap to add to home screen)
 *  5. How-it-works trust builder (3 steps)
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import AppFooter from "@/components/AppFooter";

// ─── PWA install prompt type ──────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// ─── Detect iOS ───────────────────────────────────────────────────────────────
function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isInStandaloneMode() {
  return ("standalone" in navigator && (navigator as any).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches;
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimatedNumber({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      let start = 0;
      const step = Math.ceil(target / 40);
      const timer = setInterval(() => {
        start = Math.min(start + step, target);
        setCount(start);
        if (start >= target) clearInterval(timer);
      }, 30);
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);
  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

export default function AdLanding() {
  const [, navigate] = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosInstructions, setShowIosInstructions] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (isIos()) {
      if (isInStandaloneMode()) {
        setInstalled(true);
      } else {
        setShowIosInstructions(true);
      }
      return;
    }
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
    } else {
      // Fallback: navigate to the bowler login
      navigate("/bowler-login");
    }
  }

  const APP_URL = "https://www.bobrolloffpassport.com";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-x-hidden">

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col items-center justify-center text-center px-5 py-16 sm:py-24 overflow-hidden"
        style={{
          background: "radial-gradient(ellipse 120% 80% at 50% 0%, #1a0a3e 0%, #0a0a0a 70%)",
        }}
      >
        {/* Glow orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-30 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #ffd700 0%, transparent 70%)" }} />
        <div className="absolute top-20 left-10 w-48 h-48 rounded-full opacity-10 blur-2xl pointer-events-none"
          style={{ background: "#a855f7" }} />
        <div className="absolute top-20 right-10 w-48 h-48 rounded-full opacity-10 blur-2xl pointer-events-none"
          style={{ background: "#3b82f6" }} />

        {/* Badge */}
        <div className="relative z-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6"
          style={{ background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.4)", color: "#ffd700" }}>
          🎳 Brand New · Exclusive Early Access
        </div>

        {/* Logo / Title */}
        <div className="relative z-10 mb-4">
          <img
            src="/manus-storage/bob-logo_c7d62f79.jpg"
            alt="B.O.B. Roll-off Passport"
            className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl mx-auto mb-5 shadow-2xl"
            style={{ boxShadow: "0 0 40px rgba(255,215,0,0.35)" }}
          />
        </div>

        <h1 className="relative z-10 text-4xl sm:text-6xl font-black leading-tight tracking-tight mb-3"
          style={{ fontFamily: "'Orbitron', sans-serif", textShadow: "0 0 40px rgba(255,215,0,0.5)" }}>
          <span style={{ color: "#ffd700" }}>BOWLERS</span>
          <br />
          <span className="text-white">ORLEANS BOUND</span>
        </h1>

        <p className="relative z-10 text-lg sm:text-2xl font-bold mb-2"
          style={{ color: "#c084fc" }}>
          Roll-off Passport
        </p>

        <p className="relative z-10 text-white/70 text-base sm:text-lg max-w-xl mb-10 leading-relaxed">
          Your official digital passport to the most exciting bowling getaway of the year.
          One tap. Zero hassle. Everything you need — right on your phone.
        </p>

        {/* Primary CTA */}
        {installed ? (
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="px-8 py-4 rounded-2xl font-black text-lg text-black"
              style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
              ✅ You're In! App Added to Home Screen
            </div>
            <button
              onClick={() => navigate("/bowler-login")}
              className="text-amber-400 underline text-sm font-semibold"
            >
              Open Passport Portal →
            </button>
          </div>
        ) : (
          <div className="relative z-10 flex flex-col items-center gap-4">
            <button
              onClick={handleInstall}
              className="group relative px-10 py-5 rounded-2xl font-black text-xl text-black transition-all duration-200 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #ffd700 0%, #f59e0b 50%, #ffd700 100%)",
                boxShadow: "0 0 40px rgba(255,215,0,0.5), 0 8px 32px rgba(0,0,0,0.4)",
              }}
            >
              <span className="flex items-center gap-3">
                <span className="text-2xl">📲</span>
                Add to Home Screen — It's FREE
              </span>
            </button>
            <p className="text-white/40 text-xs">
              No app store. No download. Works on iPhone &amp; Android.
            </p>
          </div>
        )}

        {/* iOS instructions */}
        {showIosInstructions && !installed && (
          <div className="relative z-10 mt-6 max-w-sm w-full rounded-2xl p-5 text-left"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,215,0,0.3)" }}>
            <p className="text-amber-300 font-bold text-sm mb-3">📱 Add to Home Screen on iPhone:</p>
            <ol className="space-y-2 text-white/80 text-sm list-none">
              <li><span className="text-amber-400 font-bold">1.</span> Tap the <strong className="text-white">Share</strong> button <span className="text-lg">⎙</span> at the bottom of Safari</li>
              <li><span className="text-amber-400 font-bold">2.</span> Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong></li>
              <li><span className="text-amber-400 font-bold">3.</span> Tap <strong className="text-white">Add</strong> — done! 🎳</li>
            </ol>
            <button onClick={() => setShowIosInstructions(false)}
              className="mt-4 text-white/40 text-xs underline">
              Got it, close
            </button>
          </div>
        )}
      </section>

      {/* ── SOCIAL PROOF BAR ─────────────────────────────────────────────────── */}
      <section className="py-8 px-4"
        style={{ background: "linear-gradient(90deg, #0f0a1e, #1a0a3e, #0f0a1e)" }}>
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-4 text-center">
          {[
            { value: 55, suffix: "+", label: "Registered Teams" },
            { value: 100, suffix: "%", label: "Digital & Paperless" },
            { value: 1, suffix: " Tap", label: "To Your QR Ticket" },
          ].map(({ value, suffix, label }) => (
            <div key={label}>
              <div className="text-2xl sm:text-4xl font-black" style={{ color: "#ffd700" }}>
                <AnimatedNumber target={value} suffix={suffix} />
              </div>
              <div className="text-white/50 text-xs sm:text-sm mt-1 font-medium">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── VALUE PROPOSITION ────────────────────────────────────────────────── */}
      <section className="py-16 px-5 max-w-2xl mx-auto w-full">
        <div className="text-center mb-12">
          <span className="text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full"
            style={{ color: "#c084fc", background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.3)" }}>
            Why You'll Love It
          </span>
          <h2 className="text-3xl sm:text-4xl font-black mt-4 mb-3">
            Your Entire Bowling Trip,<br />
            <span style={{ color: "#ffd700" }}>In One Place</span>
          </h2>
          <p className="text-white/60 text-base max-w-lg mx-auto">
            No more paper tickets. No more lost confirmations. The B.O.B. Roll-off Passport
            puts everything you need for your Orleans getaway right on your phone's home screen.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: "🎟️", title: "Digital QR Ticket", desc: "Your event entry QR code is always with you. Show it at the door — no printing required." },
            { icon: "🎳", title: "Lane & Squad Info", desc: "See your lane number, squad time, and team details the moment you log in." },
            { icon: "🏨", title: "Hotel & Banquet", desc: "Track your hotel reservation status and banquet seat assignment all in one place." },
            { icon: "📱", title: "Works Like a Native App", desc: "Add to your home screen and it opens full-screen, just like any app — no browser bars." },
            { icon: "⚡", title: "Instant Updates", desc: "Your Event Director can push real-time updates directly to your passport." },
            { icon: "🔒", title: "Secure & Private", desc: "Your data is protected. Only you and your Event Director can see your information." },
          ].map(({ icon, title, desc }) => (
            <div key={title}
              className="rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02]"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-bold text-white text-base mb-1">{title}</h3>
              <p className="text-white/55 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────────── */}
      <section className="py-16 px-5"
        style={{ background: "linear-gradient(180deg, transparent, rgba(255,215,0,0.04), transparent)" }}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full"
              style={{ color: "#ffd700", background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)" }}>
              How It Works
            </span>
            <h2 className="text-3xl sm:text-4xl font-black mt-4">
              Up &amp; Running in <span style={{ color: "#ffd700" }}>3 Steps</span>
            </h2>
          </div>

          <div className="space-y-6">
            {[
              {
                step: "01",
                icon: "📲",
                title: "Add to Your Home Screen",
                desc: "Tap the button below and follow the one-tap prompt. The app installs instantly — no app store, no waiting, no storage fees. It lives right on your phone's home screen like any other app.",
                color: "#ffd700",
              },
              {
                step: "02",
                icon: "✍️",
                title: "Create Your Account",
                desc: "Sign up with the name on your event registration. Your Event Director has already added you to the roster — just match your name and pick a password. Takes under 60 seconds.",
                color: "#c084fc",
              },
              {
                step: "03",
                icon: "🎳",
                title: "You're All Set — Enjoy the Trip!",
                desc: "Your digital passport is live. See your QR entry ticket, lane assignment, squad time, hotel status, and banquet seat — all in one beautiful, easy-to-use app.",
                color: "#34d399",
              },
            ].map(({ step, icon, title, desc, color }) => (
              <div key={step} className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black"
                  style={{ background: `${color}18`, border: `2px solid ${color}40`, color }}>
                  {icon}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black tracking-widest opacity-40" style={{ color }}>STEP {step}</span>
                  </div>
                  <h3 className="font-black text-white text-lg mb-1">{title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── URGENCY / EXCLUSIVITY BLOCK ──────────────────────────────────────── */}
      <section className="py-12 px-5 max-w-2xl mx-auto w-full">
        <div className="rounded-3xl p-8 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1a0a3e 0%, #0f172a 100%)",
            border: "1px solid rgba(255,215,0,0.25)",
            boxShadow: "0 0 60px rgba(255,215,0,0.08)",
          }}>
          <div className="absolute inset-0 opacity-5 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 0%, #ffd700, transparent 60%)" }} />
          <div className="relative z-10">
            <div className="text-4xl mb-4">🏆</div>
            <h2 className="text-2xl sm:text-3xl font-black mb-3">
              Be the <span style={{ color: "#ffd700" }}>First</span> to Experience It
            </h2>
            <p className="text-white/70 text-base max-w-md mx-auto mb-6 leading-relaxed">
              The B.O.B. Roll-off Passport is <strong className="text-white">brand new</strong> — built exclusively
              for this event. You're among the first bowlers in the country to use a fully digital
              event passport. Be ahead of the game. Add it now.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                onClick={handleInstall}
                className="px-8 py-4 rounded-xl font-black text-lg text-black transition-all duration-200 active:scale-95 w-full sm:w-auto"
                style={{
                  background: "linear-gradient(135deg, #ffd700, #f59e0b)",
                  boxShadow: "0 0 30px rgba(255,215,0,0.4)",
                }}
              >
                📲 Add to Home Screen Now
              </button>
              <a
                href={APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 rounded-xl font-bold text-base text-white/80 transition-all duration-200 w-full sm:w-auto text-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }}
              >
                Open in Browser →
              </a>
            </div>
            <p className="text-white/30 text-xs mt-4">
              Free forever · No credit card · Works on all devices
            </p>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIAL-STYLE QUOTE ───────────────────────────────────────────── */}
      <section className="py-12 px-5 max-w-xl mx-auto w-full text-center">
        <div className="text-4xl mb-4">💬</div>
        <blockquote className="text-xl sm:text-2xl font-bold text-white/90 italic leading-relaxed mb-4">
          "No more digging through emails for your confirmation number.
          Everything is right there on your home screen — it's the way
          bowling trips should work."
        </blockquote>
        <p className="text-white/40 text-sm font-semibold tracking-wide">
          — B.O.B. Roll-off Passport Team
        </p>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────────── */}
      <section className="py-16 px-5 text-center"
        style={{ background: "radial-gradient(ellipse 100% 60% at 50% 100%, #1a0a3e 0%, #000 70%)" }}>
        <h2 className="text-3xl sm:text-4xl font-black mb-3">
          Ready to Roll? 🎳
        </h2>
        <p className="text-white/60 text-base max-w-md mx-auto mb-8">
          Tap below to add the B.O.B. Roll-off Passport to your home screen.
          Your bowling getaway just got a whole lot smoother.
        </p>
        <button
          onClick={handleInstall}
          className="px-12 py-5 rounded-2xl font-black text-xl text-black transition-all duration-200 active:scale-95 mx-auto block"
          style={{
            background: "linear-gradient(135deg, #ffd700 0%, #f59e0b 50%, #ffd700 100%)",
            boxShadow: "0 0 50px rgba(255,215,0,0.45), 0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          📲 Download — Add to Home Screen
        </button>
        <p className="text-white/30 text-xs mt-4">
          {APP_URL}
        </p>
      </section>

      <AppFooter />
    </div>
  );
}
