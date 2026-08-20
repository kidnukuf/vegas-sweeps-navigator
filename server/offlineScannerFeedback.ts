export type OfflineScanResult = "admitted" | "reentry_admitted" | "denied_used" | "denied_notfound" | "denied_wrongzone";
export type OfflineFeedbackKind = "adult" | "under21" | "denied";

export const OFFLINE_SCAN_FEEDBACK = {
  adult: { flashClass: "adult", tone: "adult", label: "ENTRY GRANTED · 21+" },
  under21: { flashClass: "under21", tone: "under21", label: "ENTRY GRANTED · UNDER 21" },
  denied: { flashClass: "denied", tone: "denied", label: "NO ENTRY" },
} as const;

export function getOfflineFeedbackKind(result: OfflineScanResult, under21 = false): OfflineFeedbackKind {
  if (result === "admitted") return under21 ? "under21" : "adult";
  if (result === "reentry_admitted") return "adult";
  return "denied";
}
