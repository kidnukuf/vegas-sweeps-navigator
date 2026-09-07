import { describe, expect, it } from "vitest";
import { applyCenterOverrideToRawRow, findMismatchedCenterNames } from "./importCenterValidation";

describe("import center preview validation", () => {
  it("does not flag valid names before the center list finishes loading", () => {
    expect(findMismatchedCenterNames(
      [{ centerName: "AMF Mesa" }, { centerName: "Bowlero Lancaster" }],
      [],
      false,
      {},
    )).toEqual([]);
  });

  it("compares trimmed names case-insensitively once center data is ready", () => {
    expect(findMismatchedCenterNames(
      [{ centerName: " AMF Mesa " }, { centerName: "Not A Center" }],
      ["AMF Mesa"],
      true,
      {},
    )).toEqual(["Not A Center"]);
  });

  it("submits an Event Director-selected center mapping in the original header field", () => {
    expect(applyCenterOverrideToRawRow(
      { Center: "AMF Mesa East", "First Name": "Test" },
      { "AMF Mesa East": "AMF Mesa" },
    )).toEqual({ Center: "AMF Mesa", "First Name": "Test" });
  });
});
