/**
 * BowlerConfirmation.tsx
 * Post-sign-up confirmation flow for bowlers:
 *   Step 1 — Show 10-digit ID + collect phone & email
 *   Step 2 — Animated color burst splash "Bowlers Orleans Bound"
 *   Step 3 — Event details card + Pool Party & Banquet Dinner passport boxes
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

import { normalizeSquadTime } from "@/lib/squadTime";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import AppFooter from "@/components/AppFooter";

// ─── PWA install popup types ──────────────────────────────────────────────────
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const BOWLER_TOKEN_KEY = "vsn_bowler_token";

function formatId(id: number): string {
  return String(id).padStart(10, "0");
}

export default function BowlerConfirmation() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem(BOWLER_TOKEN_KEY) ?? "";
  const [step, setStep] = useState<"contact" | "splash" | "passport">("contact");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<any>(null);

  // If no token, redirect to login
  useEffect(() => {
    if (!token) navigate("/bowler-login");
  }, [token]);

  const submitMutation = trpc.bowlerAuth.submitContactInfo.useMutation({
    onSuccess: (data) => {
      setProfile(data);
      setStep("splash");
      // Auto-advance from splash to passport after 3 seconds
      setTimeout(() => setStep("passport"), 3000);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleSubmitContact(e: React.FormEvent) {
    e.preventDefault();
    if (!phone && !email) {
      toast.error("Please enter at least a phone number or email address.");
      return;
    }
    submitMutation.mutate({ token, phone: phone || undefined, email: email || undefined });
  }

  // ── Step 1: Contact Info ────────────────────────────────────────────────────
  if (step === "contact") {
    // We need the bowler ID — fetch it from the me query
    return <ContactStep token={token} phone={phone} setPhone={setPhone} email={email} setEmail={setEmail} onSubmit={handleSubmitContact} isLoading={submitMutation.isPending} />;
  }

  // ── Step 2: Color Burst Splash ──────────────────────────────────────────────
  if (step === "splash") {
    return <SplashStep />;
  }

  // ── Step 3: Passport Page ───────────────────────────────────────────────────
  return <PassportStep profile={profile} onDone={() => navigate("/bowler")} />;
}

// ─── Contact Step ─────────────────────────────────────────────────────────────
function ContactStep({ token, phone, setPhone, email, setEmail, onSubmit, isLoading }: {
  token: string;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}) {
  const { data: me } = trpc.bowlerAuth.me.useQuery({ token }, { enabled: !!token });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#0a1a3d] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-xs font-bold tracking-[0.3em] text-amber-400 uppercase mb-2">B.O.B. Roll-off Passport</div>
          <h1 className="text-3xl font-black text-white mb-1">Welcome!</h1>
          <p className="text-purple-300 text-sm">Your account has been created successfully.</p>
        </div>

        {/* Bowler ID Card */}
        {me && (
          <div className="bg-gradient-to-r from-amber-500 to-yellow-400 rounded-2xl p-5 mb-6 shadow-2xl shadow-amber-500/30">
            <div className="text-center">
              <div className="text-xs font-bold tracking-widest text-amber-900 uppercase mb-1">Your Bowler ID</div>
              <div className="text-4xl font-black text-amber-900 tracking-widest font-mono">
                {formatId(me.id)}
              </div>
              <div className="text-sm text-amber-800 mt-1">
                {me.legalFirstName} {me.legalLastName}
              </div>
            </div>
          </div>
        )}

        {/* Contact Info Form */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <h2 className="text-white font-bold text-lg mb-1">Complete Your Profile</h2>
          <p className="text-purple-300 text-sm mb-5">Add your contact info so we can reach you about the event.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label className="text-purple-200 text-sm font-medium">Phone Number</Label>
              <Input
                type="tel"
                placeholder="(555) 555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 bg-white/10 border-white/30 text-white placeholder:text-white/40 focus:border-amber-400"
              />
            </div>
            <div>
              <Label className="text-purple-200 text-sm font-medium">Email Address</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 bg-white/10 border-white/30 text-white placeholder:text-white/40 focus:border-amber-400"
              />
            </div>

            {/* Early arrival prompt */}
            <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-sm">
              <span className="font-bold">⏰ Arrive Early!</span> We recommend arriving <strong>30 minutes early</strong> — lines form quickly at check-in!
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-amber-900 font-black text-lg py-3 rounded-xl"
            >
              {isLoading ? "Saving..." : "Continue →"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Splash Step ──────────────────────────────────────────────────────────────
function SplashStep() {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      {/* Animated color burst background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-pink-800 to-amber-600 animate-pulse" />
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-30 animate-ping"
            style={{
              width: `${Math.random() * 200 + 50}px`,
              height: `${Math.random() * 200 + 50}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `hsl(${Math.random() * 360}, 80%, 60%)`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${Math.random() * 2 + 1}s`,
            }}
          />
        ))}
      </div>

      {/* Overlay text */}
      <div className="relative z-10 text-center px-6">
        <div
          className="text-6xl md:text-8xl font-black text-white drop-shadow-2xl leading-tight"
          style={{ textShadow: "0 0 40px rgba(255,200,0,0.8), 0 0 80px rgba(255,100,0,0.5)" }}
        >
          BOWLERS
        </div>
        <div
          className="text-5xl md:text-7xl font-black text-amber-300 drop-shadow-2xl"
          style={{ textShadow: "0 0 40px rgba(255,200,0,0.8), 0 0 80px rgba(255,100,0,0.5)" }}
        >
          ORLEANS
        </div>
        <div
          className="text-6xl md:text-8xl font-black text-white drop-shadow-2xl"
          style={{ textShadow: "0 0 40px rgba(255,200,0,0.8), 0 0 80px rgba(255,100,0,0.5)" }}
        >
          BOUND!
        </div>
        <div className="mt-6 text-white/70 text-lg animate-bounce">Loading your passport...</div>
      </div>
    </div>
  );
}

// ─── Passport Step ────────────────────────────────────────────────────────────
function PassportStep({ profile, onDone }: { profile: any; onDone: () => void }) {
  if (!profile) return null;

  const bowlerName = `${profile.legalFirstName} ${profile.legalLastName}`;
  const eventDates = profile.startDate && profile.endDate
    ? `${profile.startDate} – ${profile.endDate}`
    : profile.bowlingDate ?? "Date TBD";

  // PWA install popup — fires once after passport page loads
  const [pwaPopupOpen, setPwaPopupOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIosDevice] = useState(() => /iphone|ipad|ipod/i.test(navigator.userAgent));
  const [isStandalone] = useState(() =>
    ("standalone" in window.navigator && (window.navigator as any).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches
  );

  useEffect(() => {
    if (isStandalone) return;
    const alreadyDismissed = sessionStorage.getItem("pwa_popup_dismissed") === "1";
    if (alreadyDismissed) return;

    if (isIosDevice) {
      // Show popup immediately for iOS
      setPwaPopupOpen(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPwaPopupOpen(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isIosDevice, isStandalone]);

  function handlePwaDismiss() {
    sessionStorage.setItem("pwa_popup_dismissed", "1");
    setPwaPopupOpen(false);
  }

  async function handlePwaInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      sessionStorage.setItem("pwa_popup_dismissed", "1");
      setPwaPopupOpen(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#0a1a3d] p-4 pb-10">

      {/* ── PWA Install Popup ── */}
      <Dialog open={pwaPopupOpen} onOpenChange={(open) => { if (!open) handlePwaDismiss(); }}>
        <DialogContent className="bg-zinc-900 border border-cyan-500/40 text-white max-w-sm mx-auto rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-cyan-300 text-lg font-extrabold flex items-center gap-2">
              📲 Add to Your Home Screen
            </DialogTitle>
            <DialogDescription className="text-white/70 text-sm leading-relaxed">
              Install the B.O.B. Roll-off Passport app for instant access to your QR codes — no browser needed!
            </DialogDescription>
          </DialogHeader>

          {/* Android / Chrome — native install */}
          {deferredPrompt && (
            <div className="space-y-3 pt-1">
              <button
                onClick={handlePwaInstall}
                className="w-full py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.97] transition-all text-black font-bold text-sm tracking-wide"
              >
                ⬇️ Install App
              </button>
              <button
                onClick={handlePwaDismiss}
                className="w-full py-2 text-white/50 hover:text-white/80 text-sm transition-colors"
              >
                Maybe later
              </button>
            </div>
          )}

          {/* iOS — manual instructions */}
          {isIosDevice && !deferredPrompt && (
            <div className="space-y-3 pt-1">
              <ol className="space-y-2 text-cyan-200/80 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold flex-shrink-0">1.</span>
                  Tap the <span className="text-cyan-300 font-semibold">Share ⬆</span> button at the bottom of Safari
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold flex-shrink-0">2.</span>
                  Scroll down and tap <span className="text-cyan-300 font-semibold">“Add to Home Screen”</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400 font-bold flex-shrink-0">3.</span>
                  Tap <span className="text-cyan-300 font-semibold">“Add”</span> — your passport is one tap away!
                </li>
              </ol>
              <button
                onClick={handlePwaDismiss}
                className="w-full mt-2 py-2 rounded-xl border border-white/20 text-white/60 hover:text-white text-sm transition-colors"
              >
                Got it!
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center pt-8 mb-6">
          <div className="text-xs font-bold tracking-[0.3em] text-amber-400 uppercase mb-1">B.O.B. Roll-off Passport</div>
          <h1 className="text-2xl font-black text-white">{bowlerName}</h1>
          <div className="text-amber-300 font-mono text-lg tracking-widest">{formatId(profile.id)}</div>
        </div>

        {/* Event Details Card */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 mb-5">
          <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest mb-3">Event Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-purple-300">Event</span>
              <span className="text-white font-medium">{profile.eventName ?? "B.O.B. Roll-off"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-300">Event Dates</span>
              <span className="text-white font-medium">{eventDates}</span>
            </div>
            {profile.squadTime && (
              <div className="flex justify-between">
                <span className="text-purple-300">Squad Time</span>
                <span className="text-white font-medium">{normalizeSquadTime(profile.squadTime)}</span>
              </div>
            )}
            {profile.laneNumber && (
              <div className="flex justify-between">
                <span className="text-purple-300">Starting Lane</span>
                <span className="text-white font-bold text-lg">{profile.laneNumber}</span>
              </div>
            )}
            {profile.centerName && (
              <div className="flex justify-between">
                <span className="text-purple-300">Bowling Center</span>
                <span className="text-white font-medium">{profile.centerName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Early Arrival Prompt */}
        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-sm mb-5">
          <span className="font-bold">⏰ Arrive Early!</span> We recommend arriving <strong>30 minutes early</strong> — lines form quickly at check-in!
        </div>

        {/* Passport Boxes */}
        <div className="space-y-4">
          <PassportBox
            title="Pool Party Passport"
            icon="🏊"
            color="from-cyan-500 to-blue-600"
            qrDataUrl={profile.poolPartyQR}
            isUsed={Boolean(profile.poolPartyUsed)}
            isDisabled={!profile.poolPartyToken}
          />
          <PassportBox
            title="Banquet Dinner Passport"
            icon="🍽️"
            color="from-purple-500 to-pink-600"
            qrDataUrl={profile.banquetQR}
            isUsed={Boolean(profile.banquetUsed)}
            isDisabled={!profile.banquetToken}
          />
          {/* Guest Pool Party Passes */}
          {Array.isArray(profile.guestPoolQRs) && profile.guestPoolQRs.length > 0 && (
            <>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 h-px bg-white/20" />
                <span className="text-white/50 text-xs font-semibold tracking-widest uppercase">Guest Pool Passes</span>
                <div className="flex-1 h-px bg-white/20" />
              </div>
              {profile.guestPoolQRs.map((g: { suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }) => (
                <PassportBox
                  key={g.suffix}
                  title={`Guest Pool Pass ${g.suffix}`}
                  icon="🎟️"
                  color="from-teal-500 to-cyan-600"
                  qrDataUrl={g.used ? null : g.qrDataUrl}
                  isUsed={g.used}
                  isDisabled={g.disabled}
                />
              ))}
            </>
          )}
        </div>

        {/* PWA Install Prompt */}
        <PwaInstallPrompt />

        {/* Go to Dashboard */}
        <Button
          onClick={onDone}
          className="w-full mt-6 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-amber-900 font-black text-lg py-3 rounded-xl"
        >
          Go to My Dashboard →
        </Button>
      </div>

      <AppFooter />
    </div>
  );
}

function PassportBox({ title, icon, color, qrDataUrl, isUsed, isDisabled }: {
  title: string; icon: string; color: string;
  qrDataUrl: string | null; isUsed: boolean; isDisabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-2xl overflow-hidden border border-white/20 shadow-xl`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full bg-gradient-to-r ${color} p-4 flex items-center justify-between text-white`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div className="text-left">
            <div className="font-black text-base">{title}</div>
            <div className="text-xs opacity-80">
              {isDisabled ? "Not Eligible" : isUsed ? "✓ Redeemed" : "Tap to view QR code"}
            </div>
          </div>
        </div>
        <span className="text-xl">{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Body */}
      {expanded && (
        <div className="bg-white/10 backdrop-blur-sm p-5 text-center">
          {isDisabled ? (
            <div className="py-4">
              <div className="text-4xl mb-3">ℹ️</div>
              <p className="text-white/80 text-sm leading-relaxed">
                You are not currently registered for this event. If you are interested in attending, please see your <strong className="text-amber-300">Team Captain</strong> before the event begins.
              </p>
            </div>
          ) : isUsed ? (
            <div className="py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-white font-bold text-lg">Already Redeemed</p>
              <p className="text-white/60 text-sm mt-1">This passport has been used for entry.</p>
            </div>
          ) : qrDataUrl ? (
            <div>
              <div className="bg-white rounded-xl p-3 inline-block mb-3 shadow-lg">
                <img src={qrDataUrl} alt={`${title} QR Code`} className="w-48 h-48" />
              </div>
              <p className="text-white/70 text-xs">Show this QR code to the doorman for entry.</p>
            </div>
          ) : (
            <div className="py-4 text-white/60 text-sm">QR code not available yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
