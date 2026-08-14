export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin and
// the callback can safely return the person to the page they originally opened.
export const getLoginUrl = (returnPath?: string) => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const requestedPath = returnPath ?? `${window.location.pathname}${window.location.search}`;
  const safePath = requestedPath.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/";
  const state = btoa(JSON.stringify({ redirectUri, returnPath: safePath }));

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
