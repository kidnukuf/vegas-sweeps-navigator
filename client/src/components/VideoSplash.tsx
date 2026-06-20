import { useEffect, useRef, useState } from "react";

const SPLASH_KEY = "bob_splash_seen_v1";
const BOB_VIDEO_URL = "/manus-storage/bob-intro_40be5fd1.mp4";

/**
 * VideoSplash — plays the intro video once per session on bobrolloffpassport.com.
 * Shows a full-screen overlay, auto-plays muted (required by browsers), unmutes on tap.
 * Disappears after the video ends or the user taps Skip.
 */
export function VideoSplash() {
  const [visible, setVisible] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Only show on BOB domain (or dev preview)
    const host = window.location.hostname;
    const isBOB =
      host.includes("bobrolloffpassport") ||
      host.includes("localhost") ||
      host.includes("manus.computer");

    if (!isBOB) return;

    // Only show once per session
    if (sessionStorage.getItem(SPLASH_KEY)) return;

    setVisible(true);
    sessionStorage.setItem(SPLASH_KEY, "1");

    // Show skip button after 2 seconds
    const t = setTimeout(() => setShowSkip(true), 2000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setVisible(false);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black"
      style={{ touchAction: "none" }}
    >
      <video
        ref={videoRef}
        src={BOB_VIDEO_URL}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
        onEnded={dismiss}
        onClick={toggleMute}
        style={{ cursor: "pointer" }}
      />

      {/* Mute indicator */}
      <button
        onClick={toggleMute}
        className="absolute top-4 left-4 bg-black/50 text-white rounded-full w-10 h-10 flex items-center justify-center text-lg hover:bg-black/70 transition-colors"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {/* Skip button — appears after 2 seconds */}
      {showSkip && (
        <button
          onClick={dismiss}
          className="absolute bottom-8 right-6 px-5 py-2 rounded-full text-sm font-bold tracking-wide transition-all"
          style={{
            background: "rgba(255,215,0,0.15)",
            border: "1.5px solid rgba(255,215,0,0.6)",
            color: "#ffd700",
            backdropFilter: "blur(8px)",
            boxShadow: "0 0 16px rgba(255,215,0,0.3)",
          }}
        >
          Skip →
        </button>
      )}

      {/* Tap to unmute hint */}
      {muted && (
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 text-xs text-center pointer-events-none"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
        >
          Tap video to unmute
        </div>
      )}
    </div>
  );
}
