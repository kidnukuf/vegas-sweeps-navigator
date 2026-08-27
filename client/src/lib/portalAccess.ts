export const ED_STAFF_SESSION_MARKER = "staff_session";

export function isLegacyEventDirectorSessionCandidate(token: string | null | undefined): boolean {
  return Boolean(token && token !== ED_STAFF_SESSION_MARKER);
}

export function hasVerifiedEventDirectorAccess(input: {
  isOwnerSession: boolean;
  staffAccess: unknown;
  legacyAccess: unknown;
}): boolean {
  return input.isOwnerSession || Boolean(input.staffAccess) || Boolean(input.legacyAccess);
}

export function getPortalSignInPath(portal: "bowler" | "captain"): string {
  return portal === "captain" ? "/captain-login" : "/bowler-login";
}
