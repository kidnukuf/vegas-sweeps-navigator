# Coordinator Communications Validation Notes

## 2026-08-28 Preview Checks

The unauthenticated `/bowler` preview redirected to the secure Bowler Portal sign-in page. The unauthenticated `/ed` preview displayed the secure Event Director username/password gate. These checks confirm that adding the communications components did not expose either protected portal without its existing session requirement.

Authenticated message-panel verification remains part of the final Coordinator Package regression phase.

## 2026-08-28 Production Checks

The live `https://www.bowlvegas.com/coordinator` route returned the Coordinator Package sign-in content. The live `https://www.bowlvegas.com/bowler` route redirected to the Bowler sign-in page, preserving the participant authentication boundary. The production Coordinator screenshot did not render its page elements in the browser capture, but the extracted page content was present and correct.
