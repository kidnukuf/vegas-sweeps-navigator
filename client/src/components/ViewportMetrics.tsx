import { useEffect } from "react";

/** Layout metrics only: do not lock the body or move focus away from scanners. */
export default function ViewportMetrics() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Preserve pinch zoom: only track keyboard/browser changes at normal zoom.
        if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
        root.style.setProperty("--app-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
        root.style.setProperty("--app-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-top");
    };
  }, []);
  return null;
}
