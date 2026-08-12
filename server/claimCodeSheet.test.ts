import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBatchUpdate, mockValuesGet } = vi.hoisted(() => ({
  mockBatchUpdate: vi.fn().mockResolvedValue({ data: { totalUpdatedCells: 1 } }),
  mockValuesGet: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    sheets: vi.fn().mockReturnValue({
      spreadsheets: { values: { get: mockValuesGet, batchUpdate: mockBatchUpdate } },
    }),
  },
}));

vi.mock("./db", () => ({
  rawQuery: vi.fn().mockResolvedValue([]),
  rawExec: vi.fn().mockResolvedValue(undefined),
}));

import { writeClaimCodesToSheet } from "./googleSheets";

const FAKE_SERVICE_ACCOUNT = JSON.stringify({
  type: "service_account",
  project_id: "test",
  private_key_id: "key",
  private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
  client_email: "test@example.com",
  client_id: "123",
  token_uri: "https://oauth2.googleapis.com/token",
});

describe("writeClaimCodesToSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = FAKE_SERVICE_ACCOUNT;
  });

  it("writes a code to BL using the bowler's precise name, center, team, and lane match", async () => {
    const row = new Array(64).fill("");
    row[4] = "12"; row[5] = "AMF Mesa"; row[7] = "05"; row[9] = "Alex"; row[10] = "Bowler";
    mockValuesGet.mockResolvedValueOnce({ data: { values: [new Array(64).fill("header"), row] } });

    const result = await writeClaimCodesToSheet([{
      firstName: "Alex", lastName: "Bowler", centerName: "AMF Mesa", teamCode: "5", laneNumber: 12, code: "BOB-7F3K",
    }], { spreadsheetId: "spreadsheet", sheetName: "Sheet1" });

    expect(result).toEqual({ written: 1, notFound: 0 });
    expect(mockBatchUpdate.mock.calls[0][0].requestBody.data).toEqual([
      { range: "'Sheet1'!BL2", values: [["BOB-7F3K"]] },
    ]);
  });
});
