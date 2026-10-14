export const DEFAULT_APP_ORIGIN = "https://www.bowlvegas.com";

export function buildBanquetQrUrl(token: string, appOrigin = process.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN) {
  const normalizedOrigin = appOrigin.replace(/\/$/, "");
  return `${normalizedOrigin}/scan/banquet/${encodeURIComponent(token)}`;
}
