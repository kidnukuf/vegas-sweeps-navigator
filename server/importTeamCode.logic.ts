export type TeamCodeValidation =
  | { ok: true; teamCode: string }
  | { ok: false; message: string };

export function validateImportTeamCode(value: unknown): TeamCodeValidation {
  const rawValue = String(value ?? "").trim();
  if (!/^\d{1,2}$/.test(rawValue)) {
    return { ok: false, message: `Team # must be a whole number from 1 through 99; received "${rawValue || "blank"}".` };
  }

  const numericValue = Number(rawValue);
  if (numericValue < 1 || numericValue > 99) {
    return { ok: false, message: `Team # must be a whole number from 1 through 99; received "${rawValue}".` };
  }

  return { ok: true, teamCode: String(numericValue).padStart(2, "0") };
}
