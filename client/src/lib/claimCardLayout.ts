export const CLAIM_CARD_INSTRUCTION_LINES = [
  "Scan QR to create account.",
  "Enter your claim code to finish.",
] as const;

export function getClaimCardInstructionLines(): readonly [string, string] {
  return CLAIM_CARD_INSTRUCTION_LINES;
}
