export const DEFAULT_APP_ORIGIN = "https://vegasweeps-y8eywesk.manus.space";

export function buildBanquetQrUrl(token: string, appOrigin = process.env.APP_ORIGIN ?? DEFAULT_APP_ORIGIN) {
  const normalizedOrigin = appOrigin.replace(/\/$/, "");
  return `${normalizedOrigin}/scan/banquet/${encodeURIComponent(token)}`;
}
