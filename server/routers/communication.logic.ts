export type CommunicationActorType = "bowler" | "captain" | "coordinator" | "event_director" | "owner";

export type CommunicationActor = {
  actorType: CommunicationActorType;
  actorId: string;
  eventIds?: number[];
  scopePairs?: Array<{ eventId: number; centerId: number | null }>;
};

export type CommunicationThread = {
  eventId: number | null;
  centerId: number | null;
  participants: Array<{ actorType: CommunicationActorType; actorId: string }>;
};

const downstreamPermissions: Record<CommunicationActorType, CommunicationActorType[]> = {
  bowler: ["captain", "coordinator"],
  captain: ["coordinator"],
  coordinator: ["bowler", "captain", "event_director"],
  event_director: ["bowler", "captain", "coordinator", "owner"],
  owner: ["bowler", "captain", "coordinator", "event_director"],
};

export function canStartCommunication(actorType: CommunicationActorType, targetType: CommunicationActorType): boolean {
  return downstreamPermissions[actorType].includes(targetType);
}

export function canViewCommunicationThread(actor: CommunicationActor, thread: CommunicationThread): boolean {
  if (actor.actorType === "owner") return true;
  const isParticipant = thread.participants.some((participant) => participant.actorType === actor.actorType && participant.actorId === actor.actorId);
  if (isParticipant) return true;
  if (actor.actorType === "event_director") return Boolean(
    thread.eventId &&
    actor.eventIds?.includes(thread.eventId) &&
    thread.participants.some((participant) => participant.actorType === "coordinator" || participant.actorType === "event_director"),
  );
  return false;
}

export function canSendToThread(actor: CommunicationActor, thread: CommunicationThread): boolean {
  return thread.participants.some((participant) => participant.actorType === actor.actorType && participant.actorId === actor.actorId);
}

export function isSafeMessageBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.length > 0 && trimmed.length <= 2_000;
}
