import { describe, expect, it } from "vitest";
import { createRegistrationLinks, createRegistrationMessage, getActiveRegistrationEvents } from "../client/src/lib/registrationLinks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("event registration links", () => {
  it("creates distinct Bowler and Captain links scoped to the selected event", () => {
    const links = createRegistrationLinks("https://portal.example.com/", 42);
    expect(links).toEqual({ bowler: "https://portal.example.com/bowler-login?event=42", captain: "https://portal.example.com/captain-login?event=42" });
  });

  it("creates a ready-to-distribute message containing both event-scoped links", () => {
    const links = createRegistrationLinks("https://portal.example.com", 42);
    const message = createRegistrationMessage("Spring Event 2026", links);
    expect(message).toContain("Spring Event 2026");
    expect(message).toContain(links.bowler);
    expect(message).toContain(links.captain);
  });

  it("shows registration links only for active events from the already scoped event list", () => {
    const visibleEvents = [
      { id: 11, status: "active", eventName: "Assigned active event" },
      { id: 12, status: "planning", eventName: "Assigned planning event" },
      { id: 13, status: "completed", eventName: "Assigned completed event" },
    ];

    expect(getActiveRegistrationEvents(visibleEvents)).toEqual([{ id: 11, status: "active", eventName: "Assigned active event" }]);
  });

  it("renders the dedicated dashboard tab with active-event copy and distribution controls", () => {
    const dashboard = readFileSync(resolve(import.meta.dirname, "../client/src/pages/AdminDashboard.tsx"), "utf8");
    expect(dashboard).toContain('activeTab === "links"');
    expect(dashboard).toContain("Active Event Registration Links");
    expect(dashboard).toContain("Copy Both Links as a Message");
    expect(dashboard).toContain("Distribute");
    expect(dashboard).toContain("getActiveRegistrationEvents(events");
  });
});
