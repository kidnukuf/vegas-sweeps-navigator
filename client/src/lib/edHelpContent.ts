import type { GuidedHelpPanelProps } from "@/components/GuidedHelpPanel";

export type EdHelpStep = Omit<GuidedHelpPanelProps, "defaultOpen">;

/**
 * Centralized copy for the Event Director guided workflow. Each entry powers a
 * <GuidedHelpPanel /> placed at the matching step in the ED portal. Keep the
 * language warm and empowering — never condescending.
 */
export const ED_HELP: Record<string, EdHelpStep> = {
  createEvent: {
    panelKey: "create_event",
    step: 1,
    title: "Create your event",
    summary: "Answer a few questions to build the bowler & captain portals.",
    layman:
      "Click \"Create New Event\" and the app walks you through a short questionnaire — hotel check-in, registration, t-shirts, pool party, banquet, and check-out. Whatever you enter here is what your bowlers and captains will see in their phones. You can come back and change any answer later under \"Edit Event Settings.\"",
    expert:
      "The wizard writes event-level configuration (timings, feature flags for t-shirts/pool party, banquet venue) that drive the dynamic \"Lane to Banquet\" itinerary and conditionally render portal modules. Settings are versionable — re-opening the wizard hydrates existing values, so edits are non-destructive.",
    next:
      "Do this first. The roster import in the next step attaches every bowler to this event, and the portals can't render an itinerary until the event exists.",
  },

  importRoster: {
    panelKey: "import_roster",
    step: 2,
    title: "Import your roster",
    summary: "Paste your Google Sheet data to load every bowler at once.",
    layman:
      "Copy your bowler list out of the Google Sheet and paste it in. The app reads each column automatically — names, teams, lanes, pool party and banquet purchases — and creates an account for every bowler. Columns the app manages itself (like the ID number and QR codes) show up in gray; that's normal, you don't map those.",
    expert:
      "The importer performs header aliasing and type coercion, then bulk-inserts bowler records keyed to this event. App-managed columns (scantron ID, QR token columns) are intentionally non-mapped sinks. Monetary columns (Extra Pool Party, Extra Banquet) are parsed to derive guest entitlement counts.",
    next:
      "Import before assigning doormen or opening portals. The very next step — QR generation — runs automatically against the rows you just imported.",
  },

  qrGeneration: {
    panelKey: "qr_generation",
    step: 3,
    title: "QR codes are generated automatically",
    summary: "Every pass is created at import — including guest passes.",
    layman:
      "The moment you import, the app builds every QR code you'll need: each bowler's pool party and banquet pass, plus a pass for every guest they paid for. Guests get the bowler's ID with a letter added (…A, …B). All of this happens up front so nothing has to be created during the chaos of event day — and it keeps working even if the internet goes down.",
    expert:
      "Tokenization occurs at import time and is written back to the sheet for an auditable source of truth. Guest tokens follow the scantronId+suffix convention with independent pool and banquet redemption state. Pre-generation guarantees offline resilience: the local host serves cached tokens without a live round-trip.",
    next:
      "Verify the QR columns populated in your sheet, then assign your doormen so they can start scanning.",
  },

  doormanAssignment: {
    panelKey: "doorman_assignment",
    step: 4,
    title: "Assign your doorman stations",
    summary: "Set up a tablet at each entrance with a simple PIN.",
    layman:
      "Each entrance (pool party, banquet) gets a tablet running the Doorman screen. You unlock it with a PIN, pick which pass type that door checks, and hand it to your worker. They just point the camera at each bowler's phone — green means in, red means stop. No training required.",
    expert:
      "Doorman stations are PIN-gated, stateless scanners scoped to a passport mode (pool / banquet / guest variants). Redemption is idempotent and single-use; a consumed token cannot be re-scanned, preventing pass-back fraud at the door.",
    next:
      "Once doors are staffed, the re-entry workflow becomes your security backbone — make sure each station has wristbands on hand.",
  },

  reentryFlow: {
    panelKey: "reentry_flow",
    step: 5,
    title: "Handle re-entry securely",
    summary: "Bracelet number + fresh QR stops anyone reusing a pass.",
    layman:
      "When a bowler needs to step out and come back, the doorman writes a number on a wristband, types that same number into the tablet, and the app makes a brand-new one-time QR for that bowler to photograph. When they return, the doorman scans it and the screen shows the wristband number to match against their wrist. That double-check means nobody can sneak back in on someone else's code.",
    expert:
      "Re-entry issues a single-use token bound to a doorman-entered bracelet identifier. On verification, the issuance bracelet number is surfaced for physical cross-check, adding a second factor beyond token possession. Each exit/return cycle mints a fresh token, so codes can't be replayed.",
    next:
      "Guests follow this exact same re-entry process — so the next step, managing guest passes, uses everything you just learned.",
  },

  guestManagement: {
    panelKey: "guest_management",
    step: 6,
    title: "Guest passes are handled for you",
    summary: "Guests appear under the bowler who invited them.",
    layman:
      "You don't manage guests separately. If a bowler paid for guests, those passes are already made and they show up right below that bowler's own pass in their portal. The bowler shows the guest's QR at the door just like their own. Guest IDs are just the bowler's number with a letter on the end, so it's always clear who a guest belongs to.",
    expert:
      "Guest entitlements are derived from monetary columns at import and materialized as suffixed tokens (…A/B/C) co-located with the host bowler's record. The host's portal renders guest passes inline; redemption state is tracked per guest, per passport type, independent of the host.",
    next:
      "With access locked down, you can turn on revenue features — set up your sponsor advertisements next.",
  },

  adManagement: {
    panelKey: "ad_management",
    step: 7,
    title: "Add sponsor advertisements",
    summary: "Sell Bronze / Silver / Gold spots that earn the event money.",
    layman:
      "Sponsors pay to show an image or short video inside the bowler and captain portals. There are three price tiers — Bronze, Silver, and Gold — and the higher the tier, the more often that sponsor is shown. Upload their picture, pick the tier, set the date it should stop running, and optionally add a link to their website. It's a clean way to bring in extra income.",
    expert:
      "Ads rotate client-side using tier-weighted selection (Gold 4× / Silver 2× / Bronze 1× share-of-voice). Each creative carries a run-until date, optional click-through URL, and an enable flag. Media is stored in object storage and served by key; rotation is computed after a single fetch to avoid per-tick network calls.",
    next:
      "Ads run quietly in the background all event. Your final setup task is preparing the post-event survey.",
  },

  surveyManagement: {
    panelKey: "survey_management",
    step: 8,
    title: "Open the post-event survey",
    summary: "Collect feedback and testimonials after the banquet.",
    layman:
      "After the banquet ends, flip the survey switch on. Bowlers get a notification at hotel check-out time inviting them to rate the event and leave comments. You'll see all the results here, and any bowler who gives permission can have their kind words featured as a testimonial for next year's marketing.",
    expert:
      "Survey availability is gated by the surveyOpen flag and dispatched via a check-out-time notification. Responses are star-scored per dimension with free-text rationale; low scores trigger an owner alert. Testimonial consent is opt-in and segregated into a permissioned view for marketing reuse.",
    next:
      "Once responses are in, the last step closes the loop — export everything for your final reconciliation.",
  },

  postEventExport: {
    panelKey: "post_event_export",
    step: 9,
    title: "Export & reconcile",
    summary: "Send the final data back to your sheet for review.",
    layman:
      "When the event is over, the app writes the final picture — who attended, which passes were used, t-shirt pickups, survey results — back to your Google Sheet. That sheet becomes your complete record for accounting and for planning next year. Everything you did all weekend lands in one place.",
    expert:
      "Reconciliation writes redemption state, distribution flags (e.g., t-shirt pickup → captain cell highlight), and survey aggregates back to the source sheet, preserving a single auditable artifact. This closes the offline/online loop: local-host activity is merged back into the canonical record post-event.",
    next:
      "This is the final step. Archive the sheet, review your survey insights, and you're ready to plan the next event with real data behind you.",
  },
};
