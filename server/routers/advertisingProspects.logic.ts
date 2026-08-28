export const prospectStatuses = ["research_ready", "contacted", "follow_up", "declined", "converted", "archived"] as const;
export type ProspectStatus = typeof prospectStatuses[number];

export function isProspectStatus(value: string): value is ProspectStatus {
  return (prospectStatuses as readonly string[]).includes(value);
}

export function prospectStatusLabel(status: string): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ethicalSalesBrief(businessName: string): string {
  return `Bowl Vegas can present ${businessName} as a clearly labeled, Owner-approved local offer to authenticated event attendees. We do not sell or share attendee personal information, do not use ad-network tracking, and do not promise traffic, bookings, or sales.`;
}
