/**
 * CaptainLogin — Team Captain Portal sign-up / sign-in
 * Bold, authoritative design distinct from the bowler warm portal.
 * Captains must be flagged as isCapitain=1 in the bowlers table.
 * Includes Cloudflare Turnstile bot protection on all forms.
 */
import { useState, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { BOWLER_TOKEN_KEY, BOWLER_ID_KEY, BOWLER_IS_CAPTAIN_KEY } from "./BowlerLogin";
import { Turnstile } from "@marsidev/react-turnstile";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

export default function CaptainLogin() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const [tab, setTab] = useState<"signin" | "signup">(
    new URLSearchParams(search).get("tab") === "signup" ? "signup" : "signin"
  );

  // Sign-in state
  const [siFirst, setSiFirst] = useState("");
  const [siLast, setSiLast] = useState("");
  const [siPass, setSiPass] = useState("");
  const [siToken, setSiToken] = useState("");
  const siTurnstileRef = useRef<any>(null);

  // Sign-up state
  const [suFirst, setSuFirst] = useState("");
  const [suLast, setSuLast] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suPass, setSuPass] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suToken, setSuToken] = useState("");
  const [suCenterId, setSuCenterId] = useState<number | null>(null);
  const [suCenterName, setSuCenterName] = useState<string>("");
  const [showCenterPicker, setShowCenterPicker] = useState(false);
  const [centerSearch, setCenterSearch] = useState("");
  const suTurnstileRef = useRef<any>(null);

  const eventQuery = trpc.event.active.useQuery();
  const eventId = eventQuery.data?.id ?? 0;
  const centersQuery = trpc.bowlerAuth.listCenters.useQuery({ eventId: Number(eventId) }, { enabled: tab === "signup" && Number(eventId) > 0 });

  const signIn = trpc.bowlerAuth.signIn.useMutation({
    onSuccess: (data) => {
      if (!data.isCapitain) {
        toast.error("This account is not a Team Captain. Use the Bowler Portal instead.");
        siTurnstileRef.current?.reset();
        setSiToken("");
        return;
      }
      localStorage.setItem(BOWLER_TOKEN_KEY, data.token);
      localStorage.setItem(BOWLER_ID_KEY, String(data.bowlerId));
      localStorage.setItem(BOWLER_IS_CAPTAIN_KEY, "1");
      toast.success("Welcome back, Captain!");
      navigate("/captain");
    },
    onError: (err) => {
      toast.error(err.message);
      siTurnstileRef.current?.reset();
      setSiToken("");
    },
  });

  const signUp = trpc.bowlerAuth.signUp.useMutation({
    onSuccess: (data) => {
      if (!data.isCapitain) {
        toast.error("Your name was found, but you are not listed as a Team Captain. Use the Bowler Portal instead.");
        suTurnstileRef.current?.reset();
        setSuToken("");
        return;
      }
      localStorage.setItem(BOWLER_TOKEN_KEY, data.token);
      localStorage.setItem(BOWLER_ID_KEY, String(data.bowlerId));
      localStorage.setItem(BOWLER_IS_CAPTAIN_KEY, "1");
      toast.success("Account created! Welcome, Captain.");
      navigate("/captain-confirmation");
    },
    onError: (err) => {
      toast.error(err.message);
      suTurnstileRef.current?.reset();
      setSuToken("");
    },
  });

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) { toast.error("Event not loaded yet."); return; }
    if (!siToken) { toast.error("Please complete the security check."); return; }
    signIn.mutate({ firstName: siFirst.trim(), lastName: siLast.trim(), eventId: Number(eventId), password: siPass, turnstileToken: siToken });
  }

  function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) { toast.error("Event not loaded yet."); return; }
    if (!suCenterId) { toast.error("Please select your bowling center."); return; }
    if (suPass !== suConfirm) { toast.error("Passwords do not match."); return; }
    if (!suToken) { toast.error("Please complete the security check."); return; }
    signUp.mutate({ firstName: suFirst.trim(), lastName: suLast.trim(), eventId: Number(eventId), centerId: suCenterId, password: suPass, email: suEmail || undefined, phone: suPhone || undefined, turnstileToken: suToken });
  }

  const filteredCenters = (centersQuery.data ?? []).filter((c) =>
    c.centerName.toLowerCase().includes(centerSearch.toLowerCase())
  );

  return (
    <div className="captain-login-bg min-h-screen flex flex-col">
      {/* Header */}
      <header className="captain-login-header px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="text-sm text-gold-400 hover:text-gold-300 transition-colors">
          ← Back to Home
        </button>
        <div className="flex items-center gap-2 bob-header-group cursor-default select-none">
          <img
            src="/manus-storage/bob-logo_c7d62f79.jpg"
            alt="B.O.B. Roll-off Passport"
            className="w-10 h-10 rounded-xl object-cover"
            style={{ filter: "drop-shadow(0 0 6px rgba(255,215,0,0.5))" }}
          />
          <div className="flex flex-col leading-tight">
            <span className="bob-header-title font-black text-white text-base tracking-widest uppercase" style={{ fontFamily: "'Orbitron', sans-serif" }}>B.O.B. Roll-off Passport</span>
            <span className="bob-header-subtitle text-amber-300 text-xs font-semibold tracking-widest uppercase">Bowlers Orleans Bound</span>
          </div>
        </div>
        <div className="w-24" />
      </header>

      {/* Hero */}
      <div className="captain-login-hero flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Badge */}
        <div className="captain-badge mb-8">
          <div className="captain-badge-inner">
            <span className="text-5xl">⭐</span>
          </div>
        </div>

        <h1 className="captain-login-title">TEAM CAPTAIN</h1>
        <p className="captain-login-subtitle" style={{ color: 'rgba(255,255,255,0.9)' }}>Command your roster. Lead your team to Vegas.</p>

        {/* Event info */}
        {eventQuery.data && (
          <div className="captain-event-pill">
            🎳 {String(eventQuery.data.eventName ?? "")} · {eventQuery.data.bowlingDate ? new Date(String(eventQuery.data.bowlingDate)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}
          </div>
        )}

        {/* Auth card */}
        <div className="captain-auth-card">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "signin" | "signup"); setSiToken(""); setSuToken(""); }}>
            <TabsList className="captain-tabs-list">
              <TabsTrigger value="signin" className="captain-tab">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="captain-tab">Create Account</TabsTrigger>
            </TabsList>

            {/* SIGN IN */}
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                <p className="text-sm text-white/80 text-center mb-4">
                  Sign in with the name on your event registration.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="captain-label">First Name</Label>
                    <Input
                      value={siFirst}
                      onChange={(e) => setSiFirst(e.target.value)}
                      placeholder="First"
                      required
                      className="captain-input"
                    />
                  </div>
                  <div>
                    <Label className="captain-label">Last Name</Label>
                    <Input
                      value={siLast}
                      onChange={(e) => setSiLast(e.target.value)}
                      placeholder="Last"
                      required
                      className="captain-input"
                    />
                  </div>
                </div>
                <div>
                  <Label className="captain-label">Password</Label>
                  <Input
                    type="password"
                    value={siPass}
                    onChange={(e) => setSiPass(e.target.value)}
                    placeholder="Your password"
                    required
                    className="captain-input"
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
                  disabled={signIn.isPending || !eventId || !siToken}
                  className="captain-submit-btn w-full"
                >
                  {signIn.isPending ? "Signing in…" : "⭐ Enter Command Center"}
                </Button>
              </form>
            </TabsContent>

            {/* SIGN UP */}
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                <div className="captain-notice">
                  <span className="text-yellow-400 font-bold">Captains only.</span> Your name must be on the event roster as a Team Captain.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="captain-label">First Name</Label>
                    <Input
                      value={suFirst}
                      onChange={(e) => setSuFirst(e.target.value)}
                      placeholder="First"
                      required
                      className="captain-input"
                    />
                  </div>
                  <div>
                    <Label className="captain-label">Last Name</Label>
                    <Input
                      value={suLast}
                      onChange={(e) => setSuLast(e.target.value)}
                      placeholder="Last"
                      required
                      className="captain-input"
                    />
                  </div>
                </div>
                {/* ── Bowling Center picker ── */}
                <div>
                  <Label className="captain-label">Bowling Center</Label>
                  <button
                    type="button"
                    onClick={() => { setCenterSearch(""); setShowCenterPicker(true); }}
                    className="captain-input w-full text-left flex items-center justify-between gap-2 cursor-pointer"
                  >
                    {suCenterName ? (
                      <span className="text-white truncate">{suCenterName}</span>
                    ) : (
                      <span className="text-white/40">Select your bowling center…</span>
                    )}
                    <span className="text-white/50 text-xs shrink-0">▼</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="captain-label">Email (optional)</Label>
                    <Input
                      type="email"
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                      placeholder="captain@email.com"
                      className="captain-input"
                    />
                  </div>
                  <div>
                    <Label className="captain-label">Phone (optional)</Label>
                    <Input
                      value={suPhone}
                      onChange={(e) => setSuPhone(e.target.value)}
                      placeholder="555-555-5555"
                      className="captain-input"
                    />
                  </div>
                </div>
                <div>
                  <Label className="captain-label">Create Password</Label>
                  <Input
                    type="password"
                    value={suPass}
                    onChange={(e) => setSuPass(e.target.value)}
                    placeholder="Min. 6 characters"
                    required
                    minLength={6}
                    className="captain-input"
                  />
                </div>
                <div>
                  <Label className="captain-label">Confirm Password</Label>
                  <Input
                    type="password"
                    value={suConfirm}
                    onChange={(e) => setSuConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="captain-input"
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
                  disabled={signUp.isPending || !eventId || !suToken}
                  className="captain-submit-btn w-full"
                >
                  {signUp.isPending ? "Verifying…" : "⭐ Activate Captain Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

      {/* ── Center Picker Dialog ── */}
      <Dialog open={showCenterPicker} onOpenChange={setShowCenterPicker}>
        <DialogContent className="bg-[#0a0a1a] border border-yellow-500/20 text-white max-w-sm w-full max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white text-lg font-bold">Select Your Bowling Center</DialogTitle>
          </DialogHeader>
          <Input
            className="captain-input mt-2 shrink-0"
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
                    ? "bg-yellow-500/30 text-yellow-300 font-semibold"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {c.centerName}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

        {/* Responsibility reminder */}
        <div className="captain-responsibilities">
          <h3 className="text-gold-400 font-bold text-sm uppercase tracking-widest mb-3">Captain Responsibilities</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="captain-resp-card">
              <div className="text-2xl mb-1">✅</div>
              <div className="text-xs text-gray-300">Verify all team members</div>
            </div>
            <div className="captain-resp-card">
              <div className="text-2xl mb-1">📋</div>
              <div className="text-xs text-gray-300">Confirm roster completeness</div>
            </div>
            <div className="captain-resp-card">
              <div className="text-2xl mb-1">🎳</div>
              <div className="text-xs text-gray-300">Lead team to the lanes</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
