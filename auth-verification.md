# Event-Neutral Authentication Verification

The Bowler Portal, Team Captain Portal, and Event Director sign-in screens were rendered after the update. Each screen now uses role-based, event-neutral labels and does not reveal a selected event title before authentication. The Event Director screen states that only assigned events appear after successful sign-in.

The public entry page and both `/bowler-login` and `/captain-login` routes were rechecked after removing the active-event text from the home page. None displayed the `Group 3 test` label or another selected event name before authentication.
