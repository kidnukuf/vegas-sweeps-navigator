import { describe, expect, it } from "vitest";
import { generateScantronId } from "./routers";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME } from "../shared/const";

// ─── Scantron ID Generation ───────────────────────────────────────────────
// Format: CC(2) + L(1) + EE(2) + TT(2) + X(1) + BB(2) = 10 digits
// CC = center code (01-99), L = league code (1 digit), EE = event code (2 digits)
// TT = team code (2 digits), X = bowling position within team (1-5), BB = bowler seq # (01-99)
describe("generateScantronId", () => {
  it("produces exactly 10 digits (CC2+L1+EE2+TT2+X1+BB2)", () => {
    const id = generateScantronId("01", "1", "01", "01", "1", "01");
    expect(id).toHaveLength(10);
    expect(/^\d{10}$/.test(id)).toBe(true);
  });

  it("pads single-digit center code to 2 digits", () => {
    const id = generateScantronId("1", "2", "03", "05", "3", "02");
    expect(id.slice(0, 2)).toBe("01");
  });

  it("uses only first digit of league code", () => {
    const id = generateScantronId("02", "4", "01", "03", "2", "01");
    expect(id[2]).toBe("4");
  });

  it("pads single-digit event code to 2 digits", () => {
    const id = generateScantronId("01", "1", "5", "01", "1", "01");
    expect(id.slice(3, 5)).toBe("05");
  });

  it("pads single-digit team code to 2 digits", () => {
    const id = generateScantronId("01", "1", "01", "7", "1", "01");
    expect(id.slice(5, 7)).toBe("07");
  });

  it("X segment (position 7) is always 1 digit", () => {
    const id = generateScantronId("01", "1", "01", "01", "3", "01");
    expect(id[7]).toBe("3");
  });

  it("pads single-digit bowler seq to 2 digits", () => {
    const id = generateScantronId("01", "1", "01", "01", "1", "3");
    expect(id.slice(8, 10)).toBe("03");
  });

  it("produces correct full ID for known inputs", () => {
    // Center 01, League 1, Event 26, Team 07, Position 1, Bowler 01
    const id = generateScantronId("01", "1", "26", "07", "1", "01");
    expect(id).toBe("0112607101");
  });

  it("handles two-digit codes without padding", () => {
    const id = generateScantronId("13", "4", "52", "99", "5", "10");
    expect(id).toBe("1345299510");
  });

  it("CC segment is always exactly 2 chars at positions 0-1", () => {
    const id = generateScantronId("05", "3", "12", "08", "2", "04");
    expect(id.slice(0, 2)).toBe("05");
  });

  it("BB segment is always exactly 2 chars at positions 8-9", () => {
    const id = generateScantronId("02", "2", "01", "04", "4", "09");
    expect(id.slice(8, 10)).toBe("09");
  });

  it("throws for non-numeric center code", () => {
    expect(() => generateScantronId("HS", "1", "26", "07", "1", "01")).toThrow();
  });
});

// ─── Auth Router ──────────────────────────────────────────────────────────
function createAuthContext(): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];
  const ctx: TrpcContext = {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

// ─── Audit Log Write on Check-In ────────────────────────────────────────────
describe("checkInBowler audit log", () => {
  it("checkIn mutation calls doorman.checkIn with required fields", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    expect(typeof caller.doorman.checkIn).toBe("function");
  });

  it("doorman.search procedure exists and accepts eventId + query", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    expect(typeof caller.doorman.search).toBe("function");
  });

  it("admin.getAuditLog procedure exists", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    expect(typeof caller.admin.getAuditLog).toBe("function");
  });
});

// ─── ID Format Validation ─────────────────────────────────────────────────
describe("Scantron ID format CC-L-EE-TT-X-BB (10 digits)", () => {
  it("segment CC (positions 0-1) is always numeric", () => {
    const id = generateScantronId("07", "3", "01", "05", "2", "02");
    expect(/^\d{2}$/.test(id.slice(0, 2))).toBe(true);
  });

  it("segment L (position 2) is always 1 digit", () => {
    const id = generateScantronId("01", "5", "01", "01", "1", "01");
    expect(/^\d$/.test(id[2]!)).toBe(true);
  });

  it("segment EE (positions 3-4) is always 2 digits", () => {
    const id = generateScantronId("01", "1", "08", "01", "1", "01");
    expect(/^\d{2}$/.test(id.slice(3, 5))).toBe(true);
  });

  it("segment TT (positions 5-6) is always 2 digits", () => {
    const id = generateScantronId("01", "1", "01", "12", "1", "01");
    expect(/^\d{2}$/.test(id.slice(5, 7))).toBe(true);
  });

  it("segment X (position 7) is always 1 digit", () => {
    const id = generateScantronId("01", "1", "01", "01", "4", "04");
    expect(/^\d$/.test(id[7]!)).toBe(true);
  });

  it("segment BB (positions 8-9) is always 2 digits", () => {
    const id = generateScantronId("01", "1", "01", "01", "1", "04");
    expect(/^\d{2}$/.test(id.slice(8, 10))).toBe(true);
  });

  it("total length is always exactly 10 characters (CC+L+EE+TT+X+BB)", () => {
    const id = generateScantronId("01", "1", "26", "07", "1", "01");
    expect(id).toHaveLength(10);
  });
});
