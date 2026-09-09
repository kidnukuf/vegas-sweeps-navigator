import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AppFooter from "@/components/AppFooter";
import { trpc } from "@/lib/trpc";
import { BOWLER_ID_KEY, BOWLER_IS_CAPTAIN_KEY, BOWLER_TOKEN_KEY } from "./BowlerLogin";

type VerificationState = "checking" | "verified" | "expired" | "invalid" | "used";

export default function ClaimVerify() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(search).get("token")?.trim() ?? "";
  const [state, setState] = useState<VerificationState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const verify = trpc.claimAccess.verifyEmailToken.useMutation({
    onSuccess: (result) => {
      if (result.verified) {
        setState("verified");
      } else {
        setState(result.reason === "expired" ? "expired" : result.reason === "invalid" ? "invalid" : "used");
      }
    },
    onError: () => setState("invalid"),
  });

  const complete = trpc.claimAccess.completeSignUp.useMutation({
    onSuccess: (result) => {
      localStorage.setItem(BOWLER_TOKEN_KEY, result.token);
      localStorage.setItem(BOWLER_ID_KEY, String(result.bowlerId));
      localStorage.setItem(BOWLER_IS_CAPTAIN_KEY, result.isCapitain ? "1" : "0");
      toast.success("Your account is verified and ready.");
      navigate(result.isCapitain ? "/captain-confirmation" : "/bowler-confirmation");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    verify.mutate({ token });
    // Verification is intentionally executed once per opaque URL token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function handleComplete(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) return toast.error("Choose a password with at least 6 characters.");
    if (password !== confirmPassword) return toast.error("Passwords do not match.");
    complete.mutate({ verificationToken: token, password });
  }

  const retryLink = "/bowler-login?tab=signup";

  return (
    <div className="bowler-portal-bg min-h-screen flex flex-col">
      <header className="bowler-portal-header px-6 py-4 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="text-sm text-white/80 hover:text-white transition-colors">← Home</button>
        <div className="text-right"><p className="font-bold text-white">Bowler Portal</p><p className="text-xs uppercase tracking-widest text-amber-300">Secure Account Claim</p></div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <section className="bowler-auth-card w-full max-w-md">
          {state === "checking" && <div className="py-10 text-center"><p className="text-lg font-bold text-white">Verifying your email…</p><p className="mt-2 text-sm text-white/65">Please wait while we validate your secure claim link.</p></div>}
          {state === "verified" && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Email verified</p>
              <h1 className="mt-2 text-2xl font-black text-white">Create your Bowler Portal password</h1>
              <p className="mt-2 text-sm leading-relaxed text-white/70">Your claim code remains protected until you finish this step. Do not share this page or its link.</p>
              <form onSubmit={handleComplete} className="mt-6 space-y-4">
                <div><Label className="bowler-label">Create Password</Label><Input className="bowler-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></div>
                <div><Label className="bowler-label">Confirm Password</Label><Input className="bowler-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></div>
                <Button type="submit" disabled={complete.isPending} className="bowler-btn-primary w-full">{complete.isPending ? "Completing secure claim…" : "Finish Account Setup →"}</Button>
              </form>
            </>
          )}
          {state !== "checking" && state !== "verified" && (
            <div className="py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Verification unavailable</p>
              <h1 className="mt-2 text-2xl font-black text-white">{state === "expired" ? "This link has expired" : state === "used" ? "This link has already been used" : "This link is not valid"}</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/70">Verification links expire after 15 minutes and can only be used for one account claim. Return to the registration form to request a new email, or contact your Event Director for help.</p>
              <Button type="button" className="bowler-btn-primary mt-6 w-full" onClick={() => navigate(retryLink)}>Return to registration</Button>
            </div>
          )}
        </section>
      </main>
      <AppFooter />
    </div>
  );
}
