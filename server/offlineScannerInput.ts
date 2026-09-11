export const OFFLINE_SCANNER_MIN_TOKEN_LENGTH = 8;

export function isLikelyOfflineScannerToken(value: string): boolean {
  return value.trim().length >= OFFLINE_SCANNER_MIN_TOKEN_LENGTH;
}

export function scannerInputInstruction(): string {
  return "Scanner A captures QR-scanner input globally; no mouse click or cursor placement is required between scans.";
}
