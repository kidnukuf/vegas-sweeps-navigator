/**
 * BowlerLogin — sign-up / sign-in for Bowlers
 * Design: warm, consumer-app feel — deep navy/purple gradient, gold accents,
 * bowling imagery. Completely different from the admin panel.
 * Includes Cloudflare Turnstile bot protection on all forms.
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Turnstile } from "@marsidev/react-turnstile";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

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
  const [tab, setTab] = useState<"signin" | "signup">("signin");

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
  const suTurnstileRef = useRef<any>(null);

  const eventQuery = trpc.event.active.useQuery();
  const eventId: number = (eventQuery.data?.id as number | undefined) ?? 1;

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
    },
  });

  const signUp = trpc.bowlerAuth.signUp.useMutation({
    onSuccess: (data) => {
      localStorage.setItem(BOWLER_TOKEN_KEY, data.token);
      localStorage.setItem(BOWLER_ID_KEY, String(data.bowlerId));
      localStorage.setItem(BOWLER_IS_CAPTAIN_KEY, data.isCapitain ? "1" : "0");
      toast.success("Account created! Welcome to Vegas Sweeps.");
      if (data.isCapitain) {
        navigate("/captain");
      } else {
        navigate("/bowler");
      }
    },
    onError: (err) => {
      toast.error(err.message);
      suTurnstileRef.current?.reset();
      setSuToken("");
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
    if (suPass !== suPass2) return toast.error("Passwords do not match.");
    if (!suToken) return toast.error("Please complete the security check.");
    signUp.mutate({
      firstName: suFirst.trim(),
      lastName: suLast.trim(),
      password: suPass,
      email: suEmail || undefined,
      eventId,
      turnstileToken: suToken,
    });
  }

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
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎳</span>
          <span className="font-bold text-white text-lg tracking-wide">Vegas Sweeps</span>
        </div>
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
        <p className="text-white/60 text-center mb-8 max-w-sm">
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
                  Your name must match the roster exactly. If you have trouble, contact your Event Director.
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
    </div>
  );
}
