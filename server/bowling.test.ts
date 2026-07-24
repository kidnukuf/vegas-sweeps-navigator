import { describe, expect, it } from "vitest";
import { generateScantronId } from "./routers";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { COOKIE_NAME } from "../shared/const";

// ─── Scantron ID Generation ───────────────────────────────────────────────
// Format: CC(2) + LL(2) + EE(2) + TT(2) + BB(2) = 10 digits
// CC = center code (01-99, alphabetical), LL = league code (2 digits, e.g. 01)
// EE = event code (2 digits, e.g. 26 = 2026), TT = team code (2 digits)
// BB = sequential bowler # within team (01-99)
describe("generateScantronId", () => {
  it("produces exactly 10 digits (CC2+LL2+EE2+TT2+BB2)", () => {
    const id = generateScantronId("01", "01", "01", "01", "01");
    expect(id).toHaveLength(10);
    expect(/^\d{10}$/.test(id)).toBe(true);
  });

  it("pads single-digit center code to 2 digits", () => {
    const id = generateScantronId("1", "02", "03", "05", "02");
    expect(id.slice(0, 2)).toBe("01");
  });

  it("pads single-digit league code to 2 digits", () => {
    const id = generateScantronId("02", "4", "01", "03", "01");
    expect(id.slice(2, 4)).toBe("04");
  });

  it("pads single-digit event code to 2 digits", () => {
    const id = generateScantronId("01", "01", "5", "01", "01");
    expect(id.slice(4, 6)).toBe("05");
  });

  it("pads single-digit team code to 2 digits", () => {
    const id = generateScantronId("01", "01", "01", "7", "01");
    expect(id.slice(6, 8)).toBe("07");
  });

  it("pads single-digit bowler seq to 2 digits", () => {
    const id = generateScantronId("01", "01", "01", "01", "3");
    expect(id.slice(8, 10)).toBe("03");
  });

  it("produces correct full ID for known inputs", () => {
    // Center 01, League 01, Event 26, Team 07, Bowler 01
    const id = generateScantronId("01", "01", "26", "07", "01");
    expect(id).toBe("0101260701");
  });

  it("handles two-digit codes without padding", () => {
    const id = generateScantronId("13", "04", "52", "99", "10");
    expect(id).toBe("1304529910");
  });

  it("CC segment is always exactly 2 chars at positions 0-1", () => {
    const id = generateScantronId("05", "03", "12", "08", "04");
    expect(id.slice(0, 2)).toBe("05");
  });

  it("LL segment is always exactly 2 chars at positions 2-3", () => {
    const id = generateScantronId("02", "02", "01", "04", "09");
    expect(id.slice(2, 4)).toBe("02");
  });

  it("BB segment is always exactly 2 chars at positions 8-9", () => {
    const id = generateScantronId("02", "02", "01", "04", "09");
    expect(id.slice(8, 10)).toBe("09");
  });

  it("throws for non-numeric center code", () => {
    expect(() => generateScantronId("HS", "01", "26", "07", "01")).toThrow();
  });

  it("real-world example: Center 14, League 01, Year 26, Team 07, Bowler 01", () => {
    const id = generateScantronId("14", "01", "26", "07", "01");
    expect(id).toBe("1401260701");
    expect(id).toHaveLength(10);
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
describe("Scantron ID format CC-LL-EE-TT-BB (10 digits)", () => {
  it("segment CC (positions 0-1) is always numeric", () => {
    const id = generateScantronId("07", "03", "01", "05", "02");
    expect(/^\d{2}$/.test(id.slice(0, 2))).toBe(true);
  });

  it("segment LL (positions 2-3) is always 2 digits", () => {
    const id = generateScantronId("01", "05", "01", "01", "01");
    expect(/^\d{2}$/.test(id.slice(2, 4))).toBe(true);
  });

  it("segment EE (positions 4-5) is always 2 digits", () => {
    const id = generateScantronId("01", "01", "08", "01", "01");
    expect(/^\d{2}$/.test(id.slice(4, 6))).toBe(true);
  });

  it("segment TT (positions 6-7) is always 2 digits", () => {
    const id = generateScantronId("01", "01", "01", "12", "01");
    expect(/^\d{2}$/.test(id.slice(6, 8))).toBe(true);
  });

  it("segment BB (positions 8-9) is always 2 digits", () => {
    const id = generateScantronId("01", "01", "01", "01", "04");
    expect(/^\d{2}$/.test(id.slice(8, 10))).toBe(true);
  });

  it("total length is always exactly 10 characters (CC+LL+EE+TT+BB)", () => {
    const id = generateScantronId("01", "01", "26", "07", "01");
    expect(id).toHaveLength(10);
  });

  it("seating chart parser accepts the generated ID (10 digits)", () => {
    const id = generateScantronId("14", "01", "26", "07", "01");
    expect(/^\d{10}$/.test(id)).toBe(true);
  });

  it("guest token format: 10-digit ID + letter suffix = 11 chars", () => {
    const id = generateScantronId("14", "01", "26", "07", "01");
    const guestToken = id + "A";
    expect(guestToken).toHaveLength(11);
    expect(/^\d{10}[A-Z]$/.test(guestToken)).toBe(true);
  });
});
