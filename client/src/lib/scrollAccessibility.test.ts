import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTurnstileSize } from "../components/ResponsiveTurnstile";
const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("cross-portal scroll accessibility", () => {
  it("permits phone pinch zoom instead of imposing a maximum scale", () => {
    const html = source("../../index.html");
    expect(html).toContain("viewport-fit=cover");
    expect(html).not.toMatch(/maximum-scale|user-scalable=no/);
  });
  it("uses supported compact security widgets on narrow forms", () => {
    expect(getTurnstileSize(240)).toBe("compact");
    expect(getTurnstileSize(299)).toBe("compact");
    expect(getTurnstileSize(300)).toBe("flexible");
    expect(getTurnstileSize(480)).toBe("flexible");
    for (const page of ["BowlerLogin", "CaptainLogin"]) {
      expect(source(`../pages/${page}.tsx`)).toContain('@/components/ResponsiveTurnstile');
    }
  });
  it("keeps collapsed logistics controls out of the focus sequence without a height cap", () => {
    const placard = source("../components/LaneToBanquetPlacard.tsx");
    expect(placard).toContain("inert={!open}");
    expect(placard).toContain("aria-controls={detailsId}");
    expect(placard).not.toContain("max-h-[2000px]");
  });
  it("lets the roster table, not an implicit wide grid track, own horizontal scrolling", () => {
    const owner = source("../pages/OwnerDashboard.tsx");
    expect(owner).toMatch(/id="owner-event-workspace"[^>]+grid-cols-1/);
    expect(owner).toContain("Bowler roster editor table");
  });
  it("separates drawer touch scrolling from drag capture", () => {
    const drawer = source("../components/ui/drawer.tsx");
    const css = source("../index.css");
    expect(drawer).toContain('data-slot="drawer-scroll-body"');
    expect(drawer).toContain('data-vaul-no-drag=""');
    expect(css).toContain('touch-action: pan-y pinch-zoom');
    expect(css).toContain('[data-slot="drawer-content"]::after { display: none; }');
  });
  it("tracks the visible viewport without globally overriding modal body locks", () => {
    const css = source("../index.css");
    expect(css).toContain("--app-viewport-height");
    expect(css).toContain("--app-viewport-top");
    expect(css).not.toMatch(/body\s*\{[^}]*overflow-y:\s*(?:auto|scroll)\s*!important/s);
  });
});
