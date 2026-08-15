export const PRIMARY_PUBLIC_DOMAIN = "www.bowlvegas.com";

const LEGACY_PUBLIC_DOMAINS = new Set([
  "bobrolloffpassport.com",
  "www.bobrolloffpassport.com",
  "funtimeteamchallenge.com",
  "www.funtimeteamchallenge.com",
  "www.wwwfuntimeteamchallenge.com",
  "vegasvalentinefuntime.com",
  "www.vegasvalentinefuntime.com",
  "vegasweeps-y8eywesk.manus.space",
  "bowlvegas.manus.space",
]);

export function getPrimaryDomainRedirect(hostHeader: string | undefined, originalUrl: string): string | null {
  const hostname = hostHeader?.split(",")[0]?.trim().split(":")[0]?.toLowerCase();
  if (!hostname || !LEGACY_PUBLIC_DOMAINS.has(hostname)) return null;
  const requestPath = originalUrl.startsWith("/") ? originalUrl : `/${originalUrl}`;
  return `https://${PRIMARY_PUBLIC_DOMAIN}${requestPath}`;
}
