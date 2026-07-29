/**
 * AppDownloadPrompt
 *
 * Full-screen modal that appears every time a bowler signs in or signs up,
 * until they click "I Downloaded It!" which calls bowlerAuth.dismissAppPrompt
 * and permanently suppresses the prompt for that bowler.
 *
 * Usage:
 *   <AppDownloadPrompt
 *     token={bowlerToken}
 *     dismissed={Boolean(profile?.appDownloadDismissed)}
 *     onDismissed={() => refetch()}
 *   />
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Smartphone, Download, X } from "lucide-react";

interface AppDownloadPromptProps {
  /** Bowler JWT from localStorage */
  token: string | null;
  /** Whether the bowler has already dismissed this prompt (from DB) */
  dismissed: boolean;
  /** Called after the bowler successfully dismisses so the parent can refetch */
  onDismissed?: () => void;
}

export default function AppDownloadPrompt({ token, dismissed, onDismissed }: AppDownloadPromptProps) {
  // Show the modal as long as the bowler hasn't dismissed it
  const [open, setOpen] = useState(!dismissed);

  const dismiss = trpc.bowlerAuth.dismissAppPrompt.useMutation({
    onSuccess: () => {
      setOpen(false);
      toast.success("Great! You're all set. Enjoy the event! 🎳");
      onDismissed?.();
    },
    onError: (err) => {
      toast.error(err.message || "Could not save your preference. Please try again.");
    },
  });

  // If already dismissed in DB, never show
  if (dismissed) return null;

  function handleDismiss() {
    if (!token) {
      setOpen(false);
      return;
    }
    dismiss.mutate({ token });
  }

  function handleSkip() {
    // Close for this session only — will reappear next sign-in since DB is not updated
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent
        className="max-w-sm mx-auto rounded-2xl border-2 border-yellow-500/60 bg-gray-900 text-white shadow-2xl"
        // Prevent closing by clicking outside — we want them to see this
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Close (skip) button */}
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
          aria-label="Skip for now"
        >
          <X className="w-5 h-5" />
        </button>

        <DialogHeader className="text-center space-y-2 pt-2">
          <div className="flex justify-center">
            <div className="bg-yellow-500/20 rounded-full p-4 ring-2 ring-yellow-500/40">
              <Smartphone className="w-10 h-10 text-yellow-400" />
            </div>
          </div>
          <DialogTitle className="text-xl font-bold text-yellow-400">
            Download the B.O.B. App!
          </DialogTitle>
          <DialogDescription className="text-gray-300 text-sm leading-relaxed">
            Get the <strong className="text-white">Bowlers Orleans Bound</strong> mobile app for
            instant access to your QR passport, event schedule, and real-time updates — right on
            your phone.
          </DialogDescription>
        </DialogHeader>

        {/* Store badges */}
        <div className="flex flex-col gap-3 mt-2">
          <a
            href="https://apps.apple.com/us/app/bob-roll-off-passport/id6744882967"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-black border border-gray-600 hover:border-yellow-500 rounded-xl px-4 py-3 transition-colors group"
          >
            {/* Apple logo SVG */}
            <svg className="w-7 h-7 text-white group-hover:text-yellow-400 transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div className="text-left">
              <div className="text-xs text-gray-400 leading-none">Download on the</div>
              <div className="text-base font-semibold text-white leading-tight">App Store</div>
            </div>
          </a>

          <a
            href="https://play.google.com/store/apps/details?id=com.lsent.bobrolloffpassport"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-black border border-gray-600 hover:border-yellow-500 rounded-xl px-4 py-3 transition-colors group"
          >
            {/* Google Play logo SVG */}
            <svg className="w-7 h-7 group-hover:opacity-90 transition-opacity" viewBox="0 0 24 24" fill="none">
              <path d="M3.18 23.76A2 2 0 0 1 2 22V2a2 2 0 0 1 1.18-1.76l11.7 11.76L3.18 23.76z" fill="#EA4335"/>
              <path d="M20.82 10.5 17.5 8.6 13.5 12l4 4 3.32-1.9a2 2 0 0 0 0-3.6z" fill="#FBBC05"/>
              <path d="M3.18.24 14.88 12 3.18 23.76A2 2 0 0 1 2 22V2A2 2 0 0 1 3.18.24z" fill="#4285F4"/>
              <path d="M14.88 12 17.5 8.6 3.18.24A2 2 0 0 0 2 2v.24L14.88 12z" fill="#34A853"/>
            </svg>
            <div className="text-left">
              <div className="text-xs text-gray-400 leading-none">Get it on</div>
              <div className="text-base font-semibold text-white leading-tight">Google Play</div>
            </div>
          </a>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-2 mt-1">
          <Button
            onClick={handleDismiss}
            disabled={dismiss.isPending}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-base py-3 rounded-xl flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            {dismiss.isPending ? "Saving…" : "I Downloaded It! ✓"}
          </Button>
          <button
            onClick={handleSkip}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors text-center py-1"
          >
            Remind me next time
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
