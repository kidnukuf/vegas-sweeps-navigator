/**
 * BowlerLogin — sign-up / sign-in for Bowlers
 * Design: warm, consumer-app feel — deep navy/purple gradient, gold accents,
 * bowling imagery. Completely different from the admin panel.
 * Includes Cloudflare Turnstile bot protection on all forms.
 */
import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Turnstile } from "@marsidev/react-turnstile";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { detectGroupSlug, GROUP_THEMES } from "@/lib/eventGroup";
import AppFooter from "@/components/AppFooter";

// ─── Local storage keys ───────────────────────────────────────────────────────
export const BOWLER_TOKEN_KEY = "vsn_bowler_token";
export const BOWLER_ID_KEY = "vsn_bowler_id";
export const BOWLER_IS_CAPTAIN_KEY = "vsn_is_captain";

export function getBowlerToken() {
  return localStorage.getItem(BOWLER_TOKEN_KEY);
}
export function clearBowlerSession() {
  localStorage.removeItem(BOWLER_TOKEN_KEY);
  localStorage.removeItem(BOWLER_ID_KEY);
  localStorage.removeItem(BOWLER_IS_CAPTAIN_KEY);
}

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

// ─── Component ────────────────────────────────────────────────────────────────
export default function BowlerLogin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [tab, setTab] = useState<"signin" | "signup">(
    new URLSearchParams(search).get("tab") === "signup" ? "signup" : "signin"
  );

  // ED contact popup state
  const [showEdContact, setShowEdContact] = useState(false);
  const [loginErrorMsg, setLoginErrorMsg] = useState("");

  // Sign-in state
  const [siFirst, setSiFirst] = useState("");
  const [siLast, setSiLast] = useState("");
  const [siPass, setSiPass] = useState("");
  const [siToken, setSiToken] = useState("");
  const siTurnstileRef = useRef<any>(null);

  // Sign-up state
  const [suFirst, setSuFirst] = useState("");
  const [suLast, setSuLast] = useState("");
  const [suPass, setSuPass] = useState("");
  const [suPass2, setSuPass2] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suToken, setSuToken] = useState("");
  const [suCenterId, setSuCenterId] = useState<number | null>(null);
  const [suCenterName, setSuCenterName] = useState<string>("");
  const [showCenterPicker, setShowCenterPicker] = useState(false);
  const [centerSearch, setCenterSearch] = useState("");
  const suTurnstileRef = useRef<any>(null);

  // Resolve eventId from domain/group slug — fully isolated per website
  const groupSlugForEvent = detectGroupSlug();
  const { data: groupEventData } = trpc.event.activeByGroupSlug.useQuery(
    { groupSlug: groupSlugForEvent },
    { enabled: !!groupSlugForEvent }
  );
  // Prefer sessionStorage (set by LeagueSelector or Home group picker), then slug-resolved event
  const [sessionEventId] = useState<number | null>(() => {
    const val = sessionStorage.getItem("selectedEventId");
    return val ? parseInt(val, 10) : null;
  });
  const eventId: number = sessionEventId ?? (groupEventData as any)?.id ?? 1;
  const currentEventName = (groupEventData as any)?.eventName as string | undefined;
  const centersQuery = trpc.bowlerAuth.listCenters.useQuery({ eventId }, { enabled: tab === "signup" });

  const signIn = trpc.bowlerAuth.signIn.useMutation({
    onSuccess: (data) => {
      localStorage.setItem(BOWLER_TOKEN_KEY, data.token);
      localStorage.setItem(BOWLER_ID_KEY, String(data.bowlerId));
      localStorage.setItem(BOWLER_IS_CAPTAIN_KEY, data.isCapitain ? "1" : "0");
      toast.success("Welcome back!");
      if (data.isCapitain) {
        navigate("/captain");
      } else {
        navigate("/bowler");
      }
    },
    onError: (err) => {
      toast.error(err.message);
      siTurnstileRef.current?.reset();
      setSiToken("");
      setLoginErrorMsg(err.message);
      setShowEdContact(true);
    },
  });

  const signUp = trpc.bowlerAuth.signUp.useMutation({
    onSuccess: (data) => {
      localStorage.setItem(BOWLER_TOKEN_KEY, data.token);
      localStorage.setItem(BOWLER_ID_KEY, String(data.bowlerId));
      localStorage.setItem(BOWLER_IS_CAPTAIN_KEY, data.isCapitain ? "1" : "0");
      toast.success("Account created! Welcome to B.O.B. Roll-off Passport.");
      if (data.isCapitain) {
        navigate("/captain-confirmation");
      } else {
        navigate("/bowler-confirmation");
      }
    },
    onError: (err) => {
      toast.error(err.message);
      suTurnstileRef.current?.reset();
      setSuToken("");
      setLoginErrorMsg(err.message);
      setShowEdContact(true);
    },
  });

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!siFirst || !siLast || !siPass) return toast.error("Please fill in all fields.");
    if (!siToken) return toast.error("Please complete the security check.");
    signIn.mutate({ firstName: siFirst.trim(), lastName: siLast.trim(), password: siPass, eventId, turnstileToken: siToken });
  }

  function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!suFirst || !suLast || !suPass) return toast.error("Please fill in all fields.");
    if (!suCenterId) return toast.error("Please select your bowling center.");
    if (suPass !== suPass2) return toast.error("Passwords do not match.");
    if (!suToken) return toast.error("Please complete the security check.");
    signUp.mutate({
      firstName: suFirst.trim(),
      lastName: suLast.trim(),
      password: suPass,
      email: suEmail || undefined,
      eventId,
      centerId: suCenterId,
      turnstileToken: suToken,
    });
  }

  const filteredCenters = (centersQuery.data ?? []).filter((c) =>
    c.centerName.toLowerCase().includes(centerSearch.toLowerCase())
  );

  return (
    <div className="bowler-portal-bg min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="bowler-portal-header px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm"
        >
          ← Home
        </button>
        {(() => {
          const groupSlug = detectGroupSlug();
          const groupTheme = GROUP_THEMES[groupSlug];
          const primaryColor = groupTheme.color;
          const logoUrl = groupTheme.logoUrl ?? "/manus-storage/bob-logo_c7d62f79.jpg";
          return (
            <div className="flex items-center gap-2 bob-header-group cursor-default select-none">
              <img
                src={logoUrl}
                alt={groupTheme.name}
                className="w-10 h-10 rounded-xl object-cover"
                style={{ filter: `drop-shadow(0 0 6px ${primaryColor}80)` }}
              />
              <div className="flex flex-col leading-tight">
                <span className="bob-header-title font-bold text-white text-base tracking-wide" style={{ fontFamily: "'Orbitron', sans-serif" }}>{groupTheme.name}</span>
                <span className="bob-header-subtitle text-xs font-semibold tracking-widest uppercase" style={{ color: primaryColor }}>{groupTheme.description}</span>
              </div>
            </div>
          );
        })()}
        <div className="w-16" />
      </header>

      {/* ── Hero ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Decorative bowling graphic */}
        <div className="bowler-hero-icon mb-6">
          <div className="bowling-ball-large">
            <div className="ball-shine" />
            <div className="ball-holes">
              <div className="hole" /><div className="hole" /><div className="hole" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-white text-center mb-2 tracking-tight">
          Bowler Portal
        </h1>
        {currentEventName && (
          <div className="mb-3 px-4 py-2 rounded-full text-center text-sm font-bold"
               style={{ background: "rgba(255,215,0,0.15)", color: "#ffd700", border: "1px solid rgba(255,215,0,0.4)" }}>
            📋 Registering for: {currentEventName}
          </div>
        )}
        <p className="text-white/85 text-center mb-8 max-w-sm">
          Sign in to view your event details, QR ticket, lane assignment, and more.
        </p>

        {/* ── Auth Card ── */}
        <div className="bowler-auth-card w-full max-w-md">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "signin" | "signup"); setSiToken(""); setSuToken(""); }}>
            <TabsList className="bowler-tabs-list w-full mb-6">
              <TabsTrigger value="signin" className="bowler-tab flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="bowler-tab flex-1">Create Account</TabsTrigger>
            </TabsList>

            {/* ── SIGN IN ── */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="bowler-label">First Name</Label>
                    <Input
                      className="bowler-input"
                      placeholder="e.g. Maria"
                      value={siFirst}
                      onChange={(e) => setSiFirst(e.target.value)}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <Label className="bowler-label">Last Name</Label>
                    <Input
                      className="bowler-input"
                      placeholder="e.g. Johnson"
                      value={siLast}
                      onChange={(e) => setSiLast(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div>
                  <Label className="bowler-label">Password</Label>
                  <Input
                    className="bowler-input"
                    type="password"
                    placeholder="Your password"
                    value={siPass}
                    onChange={(e) => setSiPass(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                {/* Turnstile widget */}
                <div className="flex justify-center pt-1">
                  <Turnstile
                    ref={siTurnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setSiToken(token)}
                    onExpire={() => setSiToken("")}
                    onError={() => { setSiToken(""); toast.error("Security check failed. Please try again."); }}
                    options={{ theme: "dark", size: "normal" }}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={signIn.isPending || !siToken}
                  className="bowler-btn-primary w-full"
                >
                  {signIn.isPending ? "Signing in…" : "Sign In →"}
                </Button>
              </form>
              <p className="text-center text-white/40 text-xs mt-4">
                Don't have an account?{" "}
                <button className="text-amber-400 underline" onClick={() => setTab("signup")}>
                  Create one
                </button>
              </p>
            </TabsContent>

            {/* ── SIGN UP ── */}
            <TabsContent value="signup">
                <div className="bowler-info-box mb-4">
                <span className="text-amber-300 font-semibold text-sm">📋 Name Verification</span>
                <p className="text-white/70 text-xs mt-1">
                  Your first name, last name, and bowling center must match the roster exactly. If you have trouble, contact your Event Director.
                </p>
              </div>
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="bowler-label">First Name</Label>
                    <Input
                      className="bowler-input"
                      placeholder="Legal first name"
                      value={suFirst}
                      onChange={(e) => setSuFirst(e.target.value)}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <Label className="bowler-label">Last Name</Label>
                    <Input
                      className="bowler-input"
                      placeholder="Legal last name"
                      value={suLast}
                      onChange={(e) => setSuLast(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                {/* ── Bowling Center picker ── */}
                <div>
                  <Label className="bowler-label">Bowling Center</Label>
                  <button
                    type="button"
                    onClick={() => { setCenterSearch(""); setShowCenterPicker(true); }}
                    className="bowler-input w-full text-left flex items-center justify-between gap-2 cursor-pointer"
                  >
                    {suCenterName ? (
                      <span className="text-white truncate">{suCenterName}</span>
                    ) : (
                      <span className="text-white/40">Select your bowling center…</span>
                    )}
                    <span className="text-white/50 text-xs shrink-0">▼</span>
                  </button>
                </div>
                <div>
                  <Label className="bowler-label">Email <span className="text-white/40">(optional)</span></Label>
                  <Input
                    className="bowler-input"
                    type="email"
                    placeholder="your@email.com"
                    value={suEmail}
                    onChange={(e) => setSuEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <Label className="bowler-label">Create Password</Label>
                  <Input
                    className="bowler-input"
                    type="password"
                    placeholder="At least 6 characters"
                    value={suPass}
                    onChange={(e) => setSuPass(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label className="bowler-label">Confirm Password</Label>
                  <Input
                    className="bowler-input"
                    type="password"
                    placeholder="Repeat password"
                    value={suPass2}
                    onChange={(e) => setSuPass2(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                {/* Turnstile widget */}
                <div className="flex justify-center pt-1">
                  <Turnstile
                    ref={suTurnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setSuToken(token)}
                    onExpire={() => setSuToken("")}
                    onError={() => { setSuToken(""); toast.error("Security check failed. Please try again."); }}
                    options={{ theme: "dark", size: "normal" }}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={signUp.isPending || !suToken}
                  className="bowler-btn-primary w-full"
                >
                  {signUp.isPending ? "Verifying name…" : "Create My Account →"}
                </Button>
              </form>
              <p className="text-center text-white/40 text-xs mt-4">
                Already have an account?{" "}
                <button className="text-amber-400 underline" onClick={() => setTab("signin")}>
                  Sign in
                </button>
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── ED Contact Dialog ── */}
      <Dialog open={showEdContact} onOpenChange={setShowEdContact}>
        <DialogContent className="bg-[#1a1040] border border-amber-500/30 text-white max-w-sm w-full">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
              <span className="text-2xl">⚠️</span> Unable to Sign In
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {loginErrorMsg && (
              <div className="rounded-xl px-4 py-3 text-sm text-red-300 font-medium"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
                {loginErrorMsg}
              </div>
            )}
            <p className="text-white/75 text-sm leading-relaxed">
              Your name or bowling center may not match the event roster exactly.
              Please double-check your spelling and try again, or contact your
              Event Director for help.
            </p>
            <div className="rounded-2xl p-4 text-center"
              style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)" }}>
              <p className="text-white/60 text-xs font-semibold tracking-widest uppercase mb-2">Event Director</p>
              <p className="text-white font-bold text-base mb-3">Cassie Davis</p>
              <a
                href="mailto:CaDavis@LSEnt.com?subject=B.O.B.%20Roll-off%20Passport%20%E2%80%94%20Sign-In%20Help&body=Hi%20Cassie%2C%0A%0AI%20am%20having%20trouble%20signing%20in%20to%20the%20B.O.B.%20Roll-off%20Passport.%0A%0AName%3A%20%0ABowling%20Center%3A%20%0AError%20message%3A%20"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-black text-sm transition-all duration-200 active:scale-95"
                style={{ background: "linear-gradient(135deg, #ffd700, #f59e0b)", boxShadow: "0 0 20px rgba(255,215,0,0.3)" }}
                onClick={() => setShowEdContact(false)}
              >
                <span className="text-lg">✉️</span>
                Email CaDavis@LSEnt.com
              </a>
            </div>
            <button
              onClick={() => setShowEdContact(false)}
              className="w-full py-2.5 rounded-xl text-white/60 text-sm font-medium transition-colors hover:text-white hover:bg-white/5"
            >
              Try Again
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Center Picker Dialog ── */}
      <Dialog open={showCenterPicker} onOpenChange={setShowCenterPicker}>
        <DialogContent className="bg-[#1a1040] border border-white/10 text-white max-w-sm w-full max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Select Your Bowling Center</DialogTitle>
          </DialogHeader>
          <Input
            className="bowler-input mt-2 shrink-0"
            placeholder="Search centers…"
            value={centerSearch}
            onChange={(e) => setCenterSearch(e.target.value)}
            autoFocus
          />
          <div className="overflow-y-auto flex-1 mt-3 space-y-1 pr-1">
            {centersQuery.isLoading && (
              <p className="text-white/50 text-sm text-center py-4">Loading centers…</p>
            )}
            {!centersQuery.isLoading && filteredCenters.length === 0 && (
              <p className="text-white/50 text-sm text-center py-4">No centers found.</p>
            )}
            {filteredCenters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSuCenterId(c.id);
                  setSuCenterName(c.centerName);
                  setShowCenterPicker(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  suCenterId === c.id
                    ? "bg-amber-500/30 text-amber-300 font-semibold"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {c.centerName}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AppFooter />
    </div>
  );
}
