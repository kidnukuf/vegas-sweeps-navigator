import type { CommunicationActorType } from "./communication.logic";

export type BulletinActor = { actorType: CommunicationActorType; eventId?: number | null; centerId?: number | null; eventIds?: number[] };

export function canPostToBulletin(actor: BulletinActor, eventId: number, centerId: number): boolean {
  return (actor.actorType === "bowler" || actor.actorType === "captain") && actor.eventId === eventId && actor.centerId === centerId;
}

export function canReadBulletin(actor: BulletinActor, eventId: number, centerId: number): boolean {
  if (actor.actorType === "owner") return true;
  if (actor.actorType === "event_director") return Boolean(actor.eventIds?.includes(eventId));
  return actor.eventId === eventId && actor.centerId === centerId && (actor.actorType === "bowler" || actor.actorType === "captain");
}

export function canModerateBulletin(actor: BulletinActor, eventId: number): boolean {
  return actor.actorType === "owner" || (actor.actorType === "event_director" && Boolean(actor.eventIds?.includes(eventId)));
}

export function canSeeLocalOffer(actor: BulletinActor, eventId: number, offerCenterId: number | null): boolean {
  if (actor.actorType === "owner") return true;
  if (actor.actorType === "event_director") return Boolean(actor.eventIds?.includes(eventId));
  return (actor.actorType === "bowler" || actor.actorType === "captain") && actor.eventId === eventId && (offerCenterId === null || actor.centerId === offerCenterId);
}

export function isSafeBoardBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.length > 0 && trimmed.length <= 1_000;
}
