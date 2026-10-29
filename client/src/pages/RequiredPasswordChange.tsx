import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  BOWLER_IS_CAPTAIN_KEY,
  clearBowlerSession,
  getBowlerToken,
} from "./BowlerLogin";
import { toast } from "sonner";
import AppFooter from "@/components/AppFooter";
import { scrollMobileAuthFieldIntoView } from "@/lib/mobileAuth";

/**
 * The only route a staff-issued temporary password may unlock. It is deliberately
 * not dismissible: replacing the temporary password is required before a bowler
 * or captain can resume their normal portal.
 */
export default function RequiredPasswordChange() {
  const [, navigate] = useLocation();
  const token = getBowlerToken();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!token) navigate("/bowler-login", { replace: true });
  }, [navigate, token]);

  const changePassword = trpc.bowlerAuth.changePassword.useMutation({
    onSuccess: (data) => {
      toast.success("Your new password has been saved.");
      navigate(data.isCapitain ? "/captain" : "/bowler", { replace: true });
    },
    onError: (error) => toast.error(error.message),
  });

  function signOut() {
    clearBowlerSession();
    navigate("/bowler-login", { replace: true });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return signOut();
    if (!temporaryPassword) return toast.error("Enter the temporary password provided by your Event Director.");
    if (newPassword.length < 8) return toast.error("Your new password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return toast.error("The new passwords do not match.");
    if (temporaryPassword === newPassword) return toast.error("Choose a new password different from the temporary password.");
    changePassword.mutate({ token, currentPassword: temporaryPassword, newPassword });
  }

  if (!token) return null;

  const isCaptain = localStorage.getItem(BOWLER_IS_CAPTAIN_KEY) === "1";
  return (
    <main className="bowler-portal-bg min-h-[100dvh] flex flex-col overflow-y-auto touch-pan-y">
      <section className="flex-1 w-full max-w-md mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center">
        <div className="bowler-auth-card w-full space-y-6">
          <div className="text-center space-y-3">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300 border border-amber-400/30">
              <LockKeyhole className="size-7" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-extrabold text-white">Create your new password</h1>
            <p className="text-sm leading-6 text-white/75">
              {isCaptain ? "Your Team Captain" : "Your Bowler"} account was given a temporary password. For your security, choose a new password before entering the portal.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <Label className="bowler-label" htmlFor="temporary-password">Temporary password</Label>
              <Input
                id="temporary-password"
                className="bowler-input"
                type="password"
                autoComplete="current-password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                onFocus={(event) => scrollMobileAuthFieldIntoView(event.currentTarget)}
                enterKeyHint="next"
                required
              />
            </div>
            <div>
              <Label className="bowler-label" htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                className="bowler-input"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                onFocus={(event) => scrollMobileAuthFieldIntoView(event.currentTarget)}
                enterKeyHint="next"
                minLength={8}
                required
              />
            </div>
            <div>
              <Label className="bowler-label" htmlFor="confirm-new-password">Confirm new password</Label>
              <Input
                id="confirm-new-password"
                className="bowler-input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onFocus={(event) => scrollMobileAuthFieldIntoView(event.currentTarget)}
                enterKeyHint="done"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" disabled={changePassword.isPending} className="bowler-btn-primary mobile-auth-submit w-full">
              {changePassword.isPending ? "Saving new password…" : "Save new password and continue"}
            </Button>
          </form>

          <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm leading-5 text-cyan-50">
            <span className="inline-flex items-center gap-2 font-semibold text-cyan-200"><ShieldCheck className="size-4" /> Your account stays protected</span>
            <p className="mt-1 text-cyan-50/80">Your claim code, roster information, and QR passes are not changed by this step.</p>
          </div>
          <button type="button" className="w-full text-center text-sm text-white/60 underline underline-offset-4 hover:text-white" onClick={signOut}>
            Sign out instead
          </button>
        </div>
      </section>
      <AppFooter />
    </main>
  );
}
