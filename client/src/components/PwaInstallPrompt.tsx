import { useState, useEffect } from "react";

/**
 * PWA Install Prompt
 *
 * - Android / Chrome: catches the native `beforeinstallprompt` event and shows
 *   a custom "Add to Home Screen" button that triggers the native dialog.
 * - iOS / Safari: detects the platform and shows manual instructions since iOS
 *   does not fire `beforeinstallprompt`.
 * - Already installed (standalone mode): hides itself entirely.
 * - Dismissible: user can close it; dismissed state is stored in sessionStorage
 *   so it doesn't re-appear during the same session.
 */

const DISMISSED_KEY = "pwa_install_dismissed";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    ("standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) === "1"
  );

  useEffect(() => {
    if (isInStandaloneMode() || dismissed) return;

    if (isIos()) {
      setShowIosInstructions(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed]);

  function handleDismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosInstructions(false);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
      sessionStorage.setItem(DISMISSED_KEY, "1");
    }
  }

  // Nothing to show
  if (dismissed || isInStandaloneMode()) return null;
  if (!deferredPrompt && !showIosInstructions) return null;

  return (
    <div className="mt-6 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/60 to-teal-900/40 p-5 backdrop-blur-sm shadow-lg shadow-cyan-900/20">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-xl flex-shrink-0">
            📲
          </div>
          <div>
            <p className="text-cyan-300 font-bold text-base leading-tight">
              Add to Your Home Screen
            </p>
            <p className="text-cyan-200/60 text-xs mt-0.5">
              Access your passport instantly — no browser needed
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none mt-0.5 flex-shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Android / Chrome — native install button */}
      {deferredPrompt && (
        <button
          onClick={handleInstall}
          className="w-full mt-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.97] transition-all text-black font-bold text-sm tracking-wide"
        >
          Install App
        </button>
      )}

      {/* iOS — manual instructions */}
      {showIosInstructions && (
        <ol className="mt-2 space-y-1.5 text-cyan-200/80 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold flex-shrink-0">1.</span>
            Tap the <span className="inline-flex items-center gap-1 text-cyan-300 font-semibold">Share <span className="text-base">⬆</span></span> button at the bottom of Safari
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold flex-shrink-0">2.</span>
            Scroll down and tap <span className="text-cyan-300 font-semibold">"Add to Home Screen"</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-cyan-400 font-bold flex-shrink-0">3.</span>
            Tap <span className="text-cyan-300 font-semibold">"Add"</span> — your passport is now one tap away!
          </li>
        </ol>
      )}
    </div>
  );
}
