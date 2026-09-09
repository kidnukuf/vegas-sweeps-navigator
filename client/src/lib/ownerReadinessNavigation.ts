export const EVENT_DIRECTOR_ATTENTION_TABS = ["roster", "passports", "codes", "unmatched"] as const;
export type EventDirectorAttentionTab = (typeof EVENT_DIRECTOR_ATTENTION_TABS)[number];

export const OWNER_WORKSPACE_FOCUS_IDS = ["owner-event-settings", "owner-roster-editor", "owner-operations"] as const;
export type OwnerWorkspaceFocus = (typeof OWNER_WORKSPACE_FOCUS_IDS)[number];

export type OwnerReadinessNavigation =
  | { kind: "owner-workspace"; focus: OwnerWorkspaceFocus; actionLabel: string }
  | { kind: "event-director"; tab: EventDirectorAttentionTab; actionLabel: string };

export function parseEventDirectorAttentionTab(value: string | null | undefined): EventDirectorAttentionTab | undefined {
  return EVENT_DIRECTOR_ATTENTION_TABS.includes(value as EventDirectorAttentionTab) ? value as EventDirectorAttentionTab : undefined;
}

export function parseOwnerWorkspaceFocus(value: string | null | undefined): OwnerWorkspaceFocus | undefined {
  return OWNER_WORKSPACE_FOCUS_IDS.includes(value as OwnerWorkspaceFocus) ? value as OwnerWorkspaceFocus : undefined;
}

/** Maps the Owner readiness messages to an existing, access-controlled remediation workspace. */
export function getOwnerReadinessNavigation(issue: string): OwnerReadinessNavigation {
  if (issue === "Google Sheet target is incomplete" || issue === "Banquet time or location is incomplete") {
    return { kind: "owner-workspace", focus: "owner-event-settings", actionLabel: "Open event settings" };
  }
  if (issue === "No Event Director assigned") {
    return { kind: "owner-workspace", focus: "owner-operations", actionLabel: "Assign an Event Director" };
  }
  if (issue === "No roster imported" || /missing a center$/i.test(issue) || /missing Bowler ID/i.test(issue)) {
    return { kind: "event-director", tab: "roster", actionLabel: "Open roster review" };
  }
  if (/unmatched bowler/i.test(issue)) {
    return { kind: "event-director", tab: "unmatched", actionLabel: "Open unmatched bowlers" };
  }
  if (/missing (banquet|pool) pass/i.test(issue)) {
    return { kind: "event-director", tab: "passports", actionLabel: "Open passport management" };
  }
  if (/missing claim code/i.test(issue)) {
    return { kind: "event-director", tab: "codes", actionLabel: "Open claim-code tools" };
  }
  return { kind: "owner-workspace", focus: "owner-event-settings", actionLabel: "Open event review" };
}
