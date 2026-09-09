import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { appRouter } from "./routers";
import { rawExec, rawQuery } from "./db";
import type { TrpcContext } from "./_core/context";

function staffContext(staffId: number): TrpcContext {
  const token = jwt.sign({ staffId, type: "ed_staff" }, process.env.JWT_SECRET ?? "fallback-secret", { expiresIn: "5m" });
  return {
    user: null,
    req: { protocol: "https", headers: { cookie: `ed_staff_token=${token}` } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function ownerContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "owner-test",
      email: "owner@example.test",
      name: "Owner Test",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Owner Event Director assignment at event creation", () => {
  it("sets the selected same-company director as the creator and preserves cross-company rejection", async () => {
    const stamp = Date.now();
    const companyA = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Assignment A ${stamp}`, `assignment-a-${stamp}`]);
    const companyB = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Assignment B ${stamp}`, `assignment-b-${stamp}`]);
    const director = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`assignment-director-${stamp}`, "test-hash", "Assigned Director", companyA.insertId]);
    let eventId: number | undefined;

    try {
      const owner = appRouter.createCaller(ownerContext());
      const created = await owner.ownerDashboard.createEvent({
        eventName: `Assigned Event ${stamp}`,
        eventYear: 2099,
        companyId: companyA.insertId,
        assignedDirectorId: director.insertId,
        groupSlug: "bob",
        sheetTabName: `assignment-test-${stamp}`,
      });
      eventId = created.eventId;

      const [event] = await rawQuery<{ createdByStaffId: number | null }>("SELECT createdByStaffId FROM events WHERE id = ?", [eventId]);
      const [assignment] = await rawQuery<{ staffId: number; eventId: number }>("SELECT staffId, eventId FROM event_director_assignments WHERE staffId = ? AND eventId = ?", [director.insertId, eventId]);
      expect(event?.createdByStaffId).toBe(director.insertId);
      expect(assignment).toMatchObject({ staffId: director.insertId, eventId });

      const directorEvents = await appRouter.createCaller(staffContext(director.insertId)).event.list();
      expect((directorEvents as Array<{ id: number }>).map((row) => Number(row.id))).toContain(eventId);

      await expect(owner.ownerDashboard.createEvent({
        eventName: `Rejected Assignment ${stamp}`,
        eventYear: 2099,
        companyId: companyB.insertId,
        assignedDirectorId: director.insertId,
        groupSlug: "bob",
        sheetTabName: `assignment-rejected-${stamp}`,
      })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      if (eventId) await rawQuery("DELETE FROM event_director_assignments WHERE eventId = ?", [eventId]);
      if (eventId) await rawQuery("DELETE FROM events WHERE id = ?", [eventId]);
      await rawQuery("DELETE FROM ed_staff WHERE id = ?", [director.insertId]);
      await rawQuery("DELETE FROM companies WHERE id IN (?, ?)", [companyA.insertId, companyB.insertId]);
    }
  });
});

describe("Owner existing Event Director assignment", () => {
  it("transfers an existing event to an eligible director and rejects a cross-company director", async () => {
    const stamp = Date.now();
    const companyA = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Existing Assignment A ${stamp}`, `existing-assignment-a-${stamp}`]);
    const companyB = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Existing Assignment B ${stamp}`, `existing-assignment-b-${stamp}`]);
    const formerDirector = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`former-director-${stamp}`, "test-hash", "Former Director", companyA.insertId]);
    const replacementDirector = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`replacement-director-${stamp}`, "test-hash", "Replacement Director", companyA.insertId]);
    const crossCompanyDirector = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`cross-company-director-${stamp}`, "test-hash", "Cross Company Director", companyB.insertId]);
    const event = await rawExec("INSERT INTO events (companyId, createdByStaffId, eventName, eventYear, status) VALUES (?, ?, ?, ?, 'planning')", [companyA.insertId, formerDirector.insertId, `Existing Assignment ${stamp}`, 2099]);
    await rawExec("INSERT INTO event_director_assignments (staffId, eventId) VALUES (?, ?)", [formerDirector.insertId, event.insertId]);

    try {
      const owner = appRouter.createCaller(ownerContext());
      await expect(owner.ownerDashboard.assignExistingEventDirector({ eventId: event.insertId, staffId: replacementDirector.insertId })).resolves.toMatchObject({
        success: true,
        eventId: event.insertId,
        staffId: replacementDirector.insertId,
      });

      const [updatedEvent] = await rawQuery<{ createdByStaffId: number | null }>("SELECT createdByStaffId FROM events WHERE id = ?", [event.insertId]);
      const assignments = await rawQuery<{ staffId: number }>("SELECT staffId FROM event_director_assignments WHERE eventId = ?", [event.insertId]);
      expect(updatedEvent?.createdByStaffId).toBe(replacementDirector.insertId);
      expect(assignments).toEqual([{ staffId: replacementDirector.insertId }]);

      const formerEvents = await appRouter.createCaller(staffContext(formerDirector.insertId)).event.list();
      const replacementEvents = await appRouter.createCaller(staffContext(replacementDirector.insertId)).event.list();
      expect((formerEvents as Array<{ id: number }>).map((row) => Number(row.id))).not.toContain(event.insertId);
      expect((replacementEvents as Array<{ id: number }>).map((row) => Number(row.id))).toContain(event.insertId);

      await expect(owner.ownerDashboard.assignExistingEventDirector({ eventId: event.insertId, staffId: crossCompanyDirector.insertId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      const [unchangedEvent] = await rawQuery<{ createdByStaffId: number | null }>("SELECT createdByStaffId FROM events WHERE id = ?", [event.insertId]);
      expect(unchangedEvent?.createdByStaffId).toBe(replacementDirector.insertId);
    } finally {
      await rawQuery("DELETE FROM event_director_assignments WHERE eventId = ?", [event.insertId]);
      await rawQuery("DELETE FROM events WHERE id = ?", [event.insertId]);
      await rawQuery("DELETE FROM ed_staff WHERE id IN (?, ?, ?)", [formerDirector.insertId, replacementDirector.insertId, crossCompanyDirector.insertId]);
      await rawQuery("DELETE FROM companies WHERE id IN (?, ?)", [companyA.insertId, companyB.insertId]);
    }
  });
});

describe("Owner Event Director credential creation", () => {
  it("creates a new scoped director with an optional valid company and rejects duplicate usernames", async () => {
    const stamp = Date.now();
    const company = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Director Create ${stamp}`, `director-create-${stamp}`]);
    const username = `created-director-${stamp}`;
    let staffId: number | undefined;

    try {
      const owner = appRouter.createCaller(ownerContext());
      const created = await owner.ownerDashboard.createDirector({
        name: "Created Event Director",
        username,
        password: "ValidPassword123!",
        companyId: company.insertId,
        eventIds: [],
      });
      staffId = created.staffId;

      const [director] = await rawQuery<{ name: string; username: string; companyId: number; accessRole: string }>(
        "SELECT name, username, companyId, accessRole FROM ed_staff WHERE id = ?",
        [staffId],
      );
      expect(director).toMatchObject({ name: "Created Event Director", username, companyId: company.insertId, accessRole: "event_director" });
      await expect(owner.ownerDashboard.createDirector({
        name: "Duplicate Director",
        username,
        password: "AnotherValid123!",
        eventIds: [],
      })).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      if (staffId) await rawQuery("DELETE FROM ed_staff WHERE id = ?", [staffId]);
      await rawQuery("DELETE FROM companies WHERE id = ?", [company.insertId]);
    }
  });
});

describe("creator-owned Event Director router isolation", () => {
  it("returns only the director’s own event and rejects another director’s read or write", async () => {
    const stamp = Date.now();
    const companyA = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Company A ${stamp}`, `company-a-${stamp}`]);
    const companyB = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`Company B ${stamp}`, `company-b-${stamp}`]);
    const staff = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`director-${stamp}`, "test-hash", "Company A Director", companyA.insertId]);
    const eventA = await rawExec("INSERT INTO events (companyId, createdByStaffId, eventName, eventYear, status) VALUES (?, ?, ?, ?, 'active')", [companyA.insertId, staff.insertId, `A ${stamp}`, 2099]);
    const eventB = await rawExec("INSERT INTO events (companyId, eventName, eventYear, status) VALUES (?, ?, ?, 'active')", [companyB.insertId, `B ${stamp}`, 2099]);
    const bowlerA = await rawExec("INSERT INTO bowlers (eventId, legalFirstName, legalLastName, scantronId, registrationStatus) VALUES (?, ?, ?, ?, 'pre_registered')", [eventA.insertId, "Allowed", "Guest Host", `${String(stamp).slice(-9)}1`]);
    const bowlerB = await rawExec("INSERT INTO bowlers (eventId, legalFirstName, legalLastName, scantronId, registrationStatus) VALUES (?, ?, ?, ?, 'pre_registered')", [eventB.insertId, "Blocked", "Bowler", `${String(stamp).slice(-10)}`]);
    const guestA = await rawExec("INSERT INTO guest_pool_party_tokens (bowlerId, eventId, suffix, token, guestName) VALUES (?, ?, 'A', ?, '80')", [bowlerA.insertId, eventA.insertId, `guest-a-${stamp}`]);
    const guestB = await rawExec("INSERT INTO guest_pool_party_tokens (bowlerId, eventId, suffix, token, guestName) VALUES (?, ?, 'A', ?, '80')", [bowlerB.insertId, eventB.insertId, `guest-b-${stamp}`]);
    const [center] = await rawQuery<{ id: number }>("SELECT id FROM bowling_centers ORDER BY id ASC LIMIT 1");
    let invitationId: string | undefined;
    await rawExec("INSERT INTO event_director_assignments (staffId, eventId) VALUES (?, ?)", [staff.insertId, eventA.insertId]);

    try {
      const caller = appRouter.createCaller(staffContext(staff.insertId));
      const visibleEvents = await caller.event.list();
      expect((visibleEvents as Array<{ id: number }>).map((event) => Number(event.id))).toContain(eventA.insertId);
      expect((visibleEvents as Array<{ id: number }>).map((event) => Number(event.id))).not.toContain(eventB.insertId);

      const allowedGuests = await caller.bowlerAuth.listIncompleteGuestInformation({ eventId: eventA.insertId });
      expect(allowedGuests.map((guest) => guest.guestTicketId)).toContain(guestA.insertId);
      await expect(caller.bowlerAuth.completeGuestInformation({ eventId: eventA.insertId, guestTicketId: guestA.insertId, guestName: "Allowed Guest" })).resolves.toMatchObject({
        success: true,
        guestTicketId: guestA.insertId,
        guestName: "Allowed Guest",
      });

      await expect(caller.event.getById({ id: eventB.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.event.rename({ id: eventB.insertId, eventName: "Blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.bowlers.adminList({ eventId: eventB.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.prizePool.getEventPrizePool({ eventId: eventB.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.bowlerAuth.getPassportStatus({ token: "", eventId: eventB.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.bowlerAuth.listContactRequests({ token: "", eventId: eventB.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.bowlerAuth.disablePassport({ token: "", bowlerId: bowlerB.insertId, passportType: "pool" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.bowlerAuth.listIncompleteGuestInformation({ eventId: eventB.insertId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.bowlerAuth.completeGuestInformation({ eventId: eventB.insertId, guestTicketId: guestB.insertId, guestName: "Blocked Guest" })).rejects.toMatchObject({ code: "FORBIDDEN" });

      const allowedAssignment = await caller.coordinator.invitations.create({
        eventId: eventA.insertId,
        centerId: center.id,
        recipientName: "Allowed Coordinator",
        recipientEmail: `allowed-coordinator-${stamp}@example.test`,
        leagueSessions: ["Monday 6:00 PM"],
        origin: "https://www.bowlvegas.com",
      });
      invitationId = allowedAssignment.id;
      expect(allowedAssignment.signupUrl).toContain("/coordinator?code=");

      await expect(caller.coordinator.invitations.create({
        eventId: eventB.insertId,
        centerId: center.id,
        recipientName: "Blocked Coordinator",
        recipientEmail: `blocked-coordinator-${stamp}@example.test`,
        leagueSessions: [],
        origin: "https://www.bowlvegas.com",
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      if (invitationId) await rawQuery("DELETE FROM coordinator_invitations WHERE id = ?", [invitationId]);
      await rawQuery("DELETE FROM event_director_assignments WHERE staffId = ?", [staff.insertId]);
      await rawQuery("DELETE FROM ed_staff WHERE id = ?", [staff.insertId]);
      await rawQuery("DELETE FROM guest_pool_party_tokens WHERE bowlerId IN (?, ?)", [bowlerA.insertId, bowlerB.insertId]);
      await rawQuery("DELETE FROM bowlers WHERE id = ?", [bowlerA.insertId]);
      await rawQuery("DELETE FROM bowlers WHERE id = ?", [bowlerB.insertId]);
      await rawQuery("DELETE FROM events WHERE id IN (?, ?)", [eventA.insertId, eventB.insertId]);
      await rawQuery("DELETE FROM companies WHERE id IN (?, ?)", [companyA.insertId, companyB.insertId]);
    }
  });
});

describe("Event Director League Name editing", () => {
  it("saves a readable label only for the creator's event and keeps the stable code unchanged", async () => {
    const stamp = Date.now();
    const company = await rawExec("INSERT INTO companies (name, slug) VALUES (?, ?)", [`League Label Company ${stamp}`, `league-label-${stamp}`]);
    const staff = await rawExec("INSERT INTO ed_staff (username, passwordHash, name, companyId, accessRole) VALUES (?, ?, ?, ?, 'event_director')", [`league-label-director-${stamp}`, "test-hash", "League Label Director", company.insertId]);
    const ownedEvent = await rawExec("INSERT INTO events (companyId, createdByStaffId, eventName, eventYear, status) VALUES (?, ?, ?, ?, 'active')", [company.insertId, staff.insertId, `League Label Owned ${stamp}`, 2099]);
    const blockedEvent = await rawExec("INSERT INTO events (companyId, eventName, eventYear, status) VALUES (?, ?, ?, 'active')", [company.insertId, `League Label Blocked ${stamp}`, 2099]);
    const [center] = await rawQuery<{ id: number }>("SELECT id FROM bowling_centers ORDER BY id ASC LIMIT 1");
    const unique = String(stamp).slice(-6).padStart(6, "0");
    const ownedBowler = await rawExec("INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, scantronId, registrationStatus) VALUES (?, ?, ?, ?, ?, 'pre_registered')", [ownedEvent.insertId, center.id, "Label", "Allowed", `9901${unique}`,]);
    const blockedBowler = await rawExec("INSERT INTO bowlers (eventId, centerId, legalFirstName, legalLastName, scantronId, registrationStatus) VALUES (?, ?, ?, ?, ?, 'pre_registered')", [blockedEvent.insertId, center.id, "Label", "Blocked", `9801${unique}`,]);

    try {
      const caller = appRouter.createCaller(staffContext(staff.insertId));
      await expect(caller.leagueLabels.save({ eventId: ownedEvent.insertId, centerId: center.id, leagueCode: "01", leagueName: "Tuesday 6:30 PM Mixed League" })).resolves.toMatchObject({ ok: true, leagueCode: "01", leagueName: "Tuesday 6:30 PM Mixed League" });
      const [saved] = await rawQuery<{ leagueName: string; leagueCode: string; leagueId: number | null }>(`SELECT l.leagueName, l.leagueCode, b.leagueId FROM bowlers b JOIN leagues l ON l.id = b.leagueId WHERE b.id = ?`, [ownedBowler.insertId]);
      expect(saved).toMatchObject({ leagueName: "Tuesday 6:30 PM Mixed League", leagueCode: "01" });
      await expect(caller.leagueLabels.list({ eventId: ownedEvent.insertId })).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ centerId: center.id, leagueCode: "01", leagueName: "Tuesday 6:30 PM Mixed League" }),
      ]));
      await expect(caller.leagueLabels.save({ eventId: blockedEvent.insertId, centerId: center.id, leagueCode: "01", leagueName: "Blocked League" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await rawQuery("DELETE FROM teams WHERE eventId IN (?, ?)", [ownedEvent.insertId, blockedEvent.insertId]);
      await rawQuery("DELETE FROM bowlers WHERE id IN (?, ?)", [ownedBowler.insertId, blockedBowler.insertId]);
      await rawQuery("DELETE FROM leagues WHERE eventId IN (?, ?)", [ownedEvent.insertId, blockedEvent.insertId]);
      await rawQuery("DELETE FROM events WHERE id IN (?, ?)", [ownedEvent.insertId, blockedEvent.insertId]);
      await rawQuery("DELETE FROM ed_staff WHERE id = ?", [staff.insertId]);
      await rawQuery("DELETE FROM companies WHERE id = ?", [company.insertId]);
    }
  });
});
