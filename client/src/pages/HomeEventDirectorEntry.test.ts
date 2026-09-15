import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const homeSource = readFileSync(fileURLToPath(new URL("./Home.tsx", import.meta.url)), "utf8");

describe("landing-page Event Director entry", () => {
  it("uses the requested label and opens Event Director sign-in", () => {
    expect(homeSource).toContain('setLocation("/ed-login")');
    expect(homeSource).toContain(">Event Director Portal <ArrowRight");
    expect(homeSource).not.toContain(">Open Event Director Portal <ArrowRight");
  });
});
