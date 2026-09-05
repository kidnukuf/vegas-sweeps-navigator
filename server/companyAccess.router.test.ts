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
    } finally {
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
