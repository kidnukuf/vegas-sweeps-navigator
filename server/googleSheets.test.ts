/**
 * Tests for server/googleSheets.ts
 *
 * The new implementation uses the googleapis npm package authenticated via
 * GOOGLE_SERVICE_ACCOUNT_JSON. These tests mock the googleapis module so no
 * real network calls are made.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Use vi.hoisted so mock functions are available before vi.mock is hoisted ──
const { mockBatchUpdate, mockValuesGet, mockSpreadsheetsGet } = vi.hoisted(() => ({
  mockBatchUpdate: vi.fn().mockResolvedValue({ data: { totalUpdatedCells: 2 } }),
  mockValuesGet:   vi.fn().mockResolvedValue({ data: { values: [] } }),
  mockSpreadsheetsGet: vi.fn().mockResolvedValue({
    data: { sheets: [{ properties: { title: "Sheet1", sheetId: 0 } }] },
  }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    sheets: vi.fn().mockReturnValue({
      spreadsheets: {
        values: {
          get: mockValuesGet,
          batchUpdate: mockBatchUpdate,
        },
        get: mockSpreadsheetsGet,
        batchUpdate: mockBatchUpdate,
      },
    }),
  },
}));

import {
  writeQRCodesToSheet,
  writeBowlerIdToSheet,
  writeContactInfoToSheet,
  normalizeSquadTime,
  resolveSheetTarget,
} from "./googleSheets";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(first: string, last: string, lane: string): string[] {
  const row = new Array(36).fill("");
  row[4] = lane;   // E = Lane #
  row[8] = first;  // I = First Name
  row[9] = last;   // J = Last Name
  return row;
}

function fakeSheetWithBowler(first: string, last: string, lane: string) {
  return {
    data: {
      values: [
        new Array(36).fill("header"), // row 0 = headers
        makeRow(first, last, lane),   // row 1 = bowler (sheet row 2)
      ],
    },
  };
}

// Inject a fake service account so getSheetsClient() doesn't bail out
const FAKE_SA = JSON.stringify({
  type: "service_account",
  project_id: "test",
  private_key_id: "key1",
  private_key: "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtEsHAFxLFpHEBFOFVEYFPBME\n-----END RSA PRIVATE KEY-----\n",
  client_email: "test@test.iam.gserviceaccount.com",
  client_id: "123",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
});

const VALID_TARGET = {
  spreadsheetId: "1rnzm7lI-lH9MWCEt37n_tTuMVTiCcwkNpptRhCxbbDg",
  sheetName: "Sheet1",
};

// ── resolveSheetTarget ────────────────────────────────────────────────────────
describe("resolveSheetTarget", () => {
  it("returns empty strings when no target is provided", () => {
    const result = resolveSheetTarget();
    expect(result.spreadsheetId).toBe("");
    expect(result.sheetName).toBe("");
  });

  it("extracts spreadsheet ID from a full Google Sheets URL", () => {
    const result = resolveSheetTarget({
      spreadsheetId: "https://docs.google.com/spreadsheets/d/ABCDEF123/edit#gid=0",
      sheetName: "Tab1",
    });
    expect(result.spreadsheetId).toBe("ABCDEF123");
    expect(result.sheetName).toBe("Tab1");
  });

  it("passes through a bare spreadsheet ID unchanged", () => {
    const result = resolveSheetTarget({ spreadsheetId: "ABCDEF123", sheetName: "Tab1" });
    expect(result.spreadsheetId).toBe("ABCDEF123");
  });

  it("falls back to empty string when spreadsheetId is null", () => {
    const result = resolveSheetTarget({ spreadsheetId: null, sheetName: null });
    expect(result.spreadsheetId).toBe("");
    expect(result.sheetName).toBe("");
  });
});

// ── normalizeSquadTime ────────────────────────────────────────────────────────
describe("normalizeSquadTime", () => {
  it("converts M3 to Monday 3pm", () => {
    expect(normalizeSquadTime("M3")).toBe("Monday 3pm");
  });
  it("converts M10 to Monday 10am", () => {
    expect(normalizeSquadTime("M10")).toBe("Monday 10am");
  });
  it("converts T10 to Tuesday 10am", () => {
    expect(normalizeSquadTime("T10")).toBe("Tuesday 10am");
  });
  it("is case-insensitive", () => {
    expect(normalizeSquadTime("m3")).toBe("Monday 3pm");
    expect(normalizeSquadTime("m10")).toBe("Monday 10am");
    expect(normalizeSquadTime("t10")).toBe("Tuesday 10am");
  });
  it("returns the original value for unknown codes", () => {
    expect(normalizeSquadTime("W5")).toBe("W5");
  });
  it("returns empty string for null/undefined", () => {
    expect(normalizeSquadTime(null)).toBe("");
    expect(normalizeSquadTime(undefined as unknown as null)).toBe("");
  });
});

// ── writeQRCodesToSheet ───────────────────────────────────────────────────────
describe("writeQRCodesToSheet", () => {
  const APP_ORIGIN = "https://test.example.com";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = FAKE_SA;
  });

  it("does nothing when both tokens are null and no guest tokens", async () => {
    await writeQRCodesToSheet({
      firstName: "John",
      lastName: "Doe",
      laneNumber: 5,
      banquetToken: null,
      poolPartyToken: null,
      appOrigin: APP_ORIGIN,
      target: VALID_TARGET,
    });
    // No sheet read or write should happen
    expect(mockValuesGet).not.toHaveBeenCalled();
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("finds the bowler row and writes QR URLs when tokens are present", async () => {
    mockValuesGet.mockResolvedValueOnce(fakeSheetWithBowler("John", "Doe", "5"));
    mockBatchUpdate.mockResolvedValueOnce({ data: { totalUpdatedCells: 2 } });

    await writeQRCodesToSheet({
      firstName: "John",
      lastName: "Doe",
      laneNumber: 5,
      banquetToken: "abc123",
      poolPartyToken: "xyz789",
      appOrigin: APP_ORIGIN,
      target: VALID_TARGET,
    });

    expect(mockValuesGet).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);

    const batchCall = mockBatchUpdate.mock.calls[0][0] as {
      requestBody: { data: { values: string[][] }[] };
    };
    const allValues = batchCall.requestBody.data.flatMap((d) => d.values.flat());
    expect(allValues.some((v) => v.includes("abc123"))).toBe(true);
    expect(allValues.some((v) => v.includes("xyz789"))).toBe(true);
  });

  it("logs a warning and does not throw when bowler is not found in sheet", async () => {
    mockValuesGet.mockResolvedValueOnce({
      data: {
        values: [
          new Array(36).fill("header"),
          makeRow("Jane", "Smith", "5"),
        ],
      },
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      writeQRCodesToSheet({
        firstName: "John",
        lastName: "Doe",
        laneNumber: 5,
        banquetToken: "abc123",
        poolPartyToken: null,
        appOrigin: APP_ORIGIN,
        target: VALID_TARGET,
      })
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
    warnSpy.mockRestore();
  });

  it("does not throw when the googleapis call throws", async () => {
    mockValuesGet.mockRejectedValueOnce(new Error("Network error"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      writeQRCodesToSheet({
        firstName: "John",
        lastName: "Doe",
        laneNumber: 5,
        banquetToken: "abc123",
        poolPartyToken: null,
        appOrigin: APP_ORIGIN,
        target: VALID_TARGET,
      })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does nothing when GOOGLE_SERVICE_ACCOUNT_JSON is not set", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await writeQRCodesToSheet({
      firstName: "John",
      lastName: "Doe",
      laneNumber: 5,
      banquetToken: "abc123",
      poolPartyToken: "xyz789",
      appOrigin: APP_ORIGIN,
      target: VALID_TARGET,
    });

    expect(mockValuesGet).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ── writeBowlerIdToSheet ──────────────────────────────────────────────────────
describe("writeBowlerIdToSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = FAKE_SA;
  });

  it("writes the scantron ID to the correct cell when bowler is found", async () => {
    mockValuesGet.mockResolvedValueOnce(fakeSheetWithBowler("Alice", "Brown", "12"));
    mockBatchUpdate.mockResolvedValueOnce({ data: { totalUpdatedCells: 1 } });

    await writeBowlerIdToSheet({
      firstName: "Alice",
      lastName: "Brown",
      laneNumber: 12,
      scantronId: "0101010101",
      target: VALID_TARGET,
    });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    const batchCall = mockBatchUpdate.mock.calls[0][0] as {
      requestBody: { data: { values: string[][] }[] };
    };
    const allValues = batchCall.requestBody.data.flatMap((d) => d.values.flat());
    expect(allValues).toContain("0101010101");
  });

  it("does not throw when bowler is not found", async () => {
    mockValuesGet.mockResolvedValueOnce({
      data: { values: [new Array(36).fill("header")] },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      writeBowlerIdToSheet({
        firstName: "Nobody",
        lastName: "Here",
        laneNumber: 1,
        scantronId: "9999999999",
        target: VALID_TARGET,
      })
    ).resolves.toBeUndefined();

    expect(mockBatchUpdate).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ── writeContactInfoToSheet ───────────────────────────────────────────────────
describe("writeContactInfoToSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = FAKE_SA;
  });

  it("writes phone and email to the correct row", async () => {
    mockValuesGet.mockResolvedValueOnce(fakeSheetWithBowler("Bob", "Jones", "7"));
    mockBatchUpdate.mockResolvedValueOnce({ data: { totalUpdatedCells: 2 } });

    const result = await writeContactInfoToSheet({
      firstName: "Bob",
      lastName: "Jones",
      laneNumber: 7,
      phone: "555-1234",
      email: "bob@example.com",
      target: VALID_TARGET,
    });

    expect(result.rowNum).toBe(2); // row 2 (1-indexed, header is row 1)
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    const batchCall = mockBatchUpdate.mock.calls[0][0] as {
      requestBody: { data: { values: string[][] }[] };
    };
    const allValues = batchCall.requestBody.data.flatMap((d) => d.values.flat());
    expect(allValues).toContain("555-1234");
    expect(allValues).toContain("bob@example.com");
  });

  it("returns rowNum null when bowler is not found", async () => {
    mockValuesGet.mockResolvedValueOnce({
      data: { values: [new Array(36).fill("header")] },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await writeContactInfoToSheet({
      firstName: "Ghost",
      lastName: "User",
      laneNumber: 1,
      phone: "000-0000",
      email: "ghost@example.com",
      target: VALID_TARGET,
    });

    expect(result.rowNum).toBeNull();
    warnSpy.mockRestore();
  });
});
