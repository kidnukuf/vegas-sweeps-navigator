import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const readSource = (relativePath: string) => readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("event-neutral authentication screens", () => {
  it("does not display a selected event name before Bowler or Captain authentication", () => {
    const bowlerLogin = readSource("client/src/pages/BowlerLogin.tsx");
    const captainLogin = readSource("client/src/pages/CaptainLogin.tsx");

    expect(bowlerLogin).not.toContain("Registering for:");
    expect(bowlerLogin).not.toContain("currentEventName");
    expect(bowlerLogin).toContain("Secure Event Access");
    expect(captainLogin).not.toContain("captain-event-pill");
    expect(captainLogin).not.toContain("groupEventData as any).eventName");
    expect(captainLogin).toContain("Secure Event Access");
  });

  it("uses neutral Event Director authentication language and resets stale event selections", () => {
    const adminDashboard = readSource("client/src/pages/AdminDashboard.tsx");
    const home = readSource("client/src/pages/Home.tsx");

    expect(adminDashboard).toContain("Multi-Event Operations Portal");
    expect(adminDashboard).toContain("resolveAccessibleEventId(selectedEventId");
    expect(adminDashboard).not.toContain("Bowlers Orleans Bound");
    expect(home).not.toContain("trpc.event.active.useQuery");
    expect(home).not.toContain("event as Record<string, unknown>");
  });
});
