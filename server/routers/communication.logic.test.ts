import { describe, expect, it } from "vitest";
import { canSendToThread, canStartCommunication, canViewCommunicationThread, isSafeMessageBody } from "./communication.logic";
import { communicationsRouter } from "./communications";

const directThread = {
  eventId: 1980003,
  centerId: 17,
  participants: [
    { actorType: "bowler" as const, actorId: "61" },
    { actorType: "coordinator" as const, actorId: "23" },
  ],
};

describe("role-scoped communication authorization", () => {
  it("registers the communications router", () => {
    expect(communicationsRouter).toBeDefined();
  });

  it("allows only the approved hierarchy and authorized downstream contact paths", () => {
    expect(canStartCommunication("bowler", "coordinator")).toBe(true);
    expect(canStartCommunication("captain", "coordinator")).toBe(true);
    expect(canStartCommunication("coordinator", "event_director")).toBe(true);
    expect(canStartCommunication("event_director", "owner")).toBe(true);
    expect(canStartCommunication("bowler", "owner")).toBe(false);
    expect(canStartCommunication("captain", "bowler")).toBe(false);
  });

  it("keeps regular users participant-only while permitting authorized coordinator, ED, and Owner oversight", () => {
    expect(canViewCommunicationThread({ actorType: "bowler", actorId: "61" }, directThread)).toBe(true);
    expect(canViewCommunicationThread({ actorType: "bowler", actorId: "62" }, directThread)).toBe(false);
    expect(canViewCommunicationThread({ actorType: "coordinator", actorId: "23", scopePairs: [{ eventId: 1980003, centerId: 17 }] }, directThread)).toBe(true);
    expect(canViewCommunicationThread({ actorType: "coordinator", actorId: "99", scopePairs: [{ eventId: 1980003, centerId: 18 }] }, directThread)).toBe(false);
    expect(canViewCommunicationThread({ actorType: "event_director", actorId: "3", eventIds: [1980003] }, directThread)).toBe(true);
    expect(canViewCommunicationThread({ actorType: "event_director", actorId: "4", eventIds: [1980004] }, directThread)).toBe(false);
    expect(canViewCommunicationThread({ actorType: "owner", actorId: "platform_owner" }, directThread)).toBe(true);
  });

  it("allows only participants to send in an existing thread and bounds message content", () => {
    expect(canSendToThread({ actorType: "coordinator", actorId: "23" }, directThread)).toBe(true);
    expect(canSendToThread({ actorType: "event_director", actorId: "3", eventIds: [1980003] }, directThread)).toBe(false);
    expect(isSafeMessageBody("Roster information is ready for review.")).toBe(true);
    expect(isSafeMessageBody("   ")).toBe(false);
    expect(isSafeMessageBody("x".repeat(2_001))).toBe(false);
  });
});
