# Owner Route Verification

- The first live `/owner` request used the older client bundle, whose OAuth state contained only the callback URL; that callback therefore returned to the app root.
- After deployment confirmation, the production entry document references `index-ADwscZZB.js`, which contains the new `returnPath` state value.
- The server-side post-login parser accepts only same-site paths and the focused OAuth return-route tests pass.
