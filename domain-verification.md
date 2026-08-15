# Production Domain Verification

- `https://www.bowlvegas.com/?v=0366fc03` serves the public Bowl Vegas landing page with Bowler, Captain, and Event Director guidance.
- `https://www.bobrolloffpassport.com/ed?from=legacy` redirects to `https://www.bowlvegas.com/ed?from=legacy`.
- `https://www.funtimeteamchallenge.com/bowler-login?from=legacy` redirects to `https://www.bowlvegas.com/bowler-login?from=legacy`.
- `https://www.vegasvalentinefuntime.com/?from=legacy` redirects to `https://www.bowlvegas.com/?from=legacy`.
- `https://bowlvegas.com/?from=bare-domain` redirects to `https://www.bowlvegas.com/?from=bare-domain`.
- `https://www.wwwfuntimeteamchallenge.com/?from=legacy` redirects to `https://www.bowlvegas.com/?from=legacy`.
- `https://bowlvegas.manus.space/owner?from=managed-subdomain` redirects to the Bowl Vegas owner route, which correctly hands off to Manus authentication because no session is active.
