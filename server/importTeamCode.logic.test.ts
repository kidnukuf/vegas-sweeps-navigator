import { describe, expect, it } from "vitest";
import { validateImportTeamCode } from "./importTeamCode.logic";

describe("validateImportTeamCode", () => {
  it("normalizes valid one- and two-digit team numbers", () => {
    expect(validateImportTeamCode("1")).toEqual({ ok: true, teamCode: "01" });
    expect(validateImportTeamCode("16")).toEqual({ ok: true, teamCode: "16" });
  });

  it("rejects three-digit team values before scantron-ID generation", () => {
    expect(validateImportTeamCode("101")).toEqual({
      ok: false,
      message: 'Team # must be a whole number from 1 through 99; received "101".',
    });
  });

  it("rejects blank, zero, and non-numeric team values", () => {
    expect(validateImportTeamCode("")).toMatchObject({ ok: false });
    expect(validateImportTeamCode("0")).toMatchObject({ ok: false });
    expect(validateImportTeamCode("Team A")).toMatchObject({ ok: false });
  });
});
