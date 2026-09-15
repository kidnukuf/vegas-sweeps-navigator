import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const bowlerSource = readFileSync(`${here}/BowlerDashboard.tsx`, "utf8");
const captainSource = readFileSync(`${here}/CaptainDashboard.tsx`, "utf8");

describe("portal payment visibility", () => {
  it("does not render a payment section in the Bowler Portal", () => {
    expect(bowlerSource).not.toContain("Payment Status");
    expect(bowlerSource).not.toContain("<span>💳</span> Payment");
    expect(bowlerSource).not.toContain("totalAmountDue");
    expect(bowlerSource).not.toContain("Outstanding");
  });

  it("does not mention payment status in the Team Captain Portal", () => {
    expect(captainSource.toLowerCase()).not.toContain("payment status");
    expect(captainSource).not.toContain("Payment");
  });
});
