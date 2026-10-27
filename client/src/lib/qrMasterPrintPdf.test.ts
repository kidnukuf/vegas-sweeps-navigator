import { afterEach, describe, expect, it, vi } from "vitest";
import QRCode from "qrcode";
import { createQrMasterPrintPdf, masterPrintNames, sortQrMasterPrintRecords, type QrMasterPrintRecord } from "./qrMasterPrintPdf";

const record = (cardId: string, patch: Partial<QrMasterPrintRecord> = {}): QrMasterPrintRecord => ({
  cardId, bowlerId: 1, attendeeName: "Nathaniel Jones", attendeeType: "bowler", passType: "banquet",
  qrUrl: `https://www.bowlvegas.com/scan/banquet/${cardId}`, under21: false,
  centerName: "Clovis Lanes", leagueName: "League 01", leagueId: 1, leagueCode: "01", teamCode: "02", teamId: 2,
  ...patch,
});
afterEach(() => vi.restoreAllMocks());
describe("QR Code Master Print", () => {
  it("sorts centers alphabetically, then leagues, then team numbers numerically", () => {
    const records = [
      record("z-center", {centerName:"Zeta Lanes"}),
      record("a-league-b", {centerName:"Alpha Lanes",leagueName:"Wednesday League",leagueId:2}),
      record("a-team-10", {centerName:"Alpha Lanes",leagueName:"Tuesday League",leagueId:1,teamCode:"10",teamId:10}),
      record("a-team-2", {centerName:"Alpha Lanes",leagueName:"Tuesday League",leagueId:1,teamCode:"02",teamId:2}),
      record("no-center", {centerName:null}),
    ];
    const original=records.map(r=>r.cardId);
    expect(sortQrMasterPrintRecords(records).map(r=>r.cardId)).toEqual(["a-team-2","a-team-10","a-league-b","z-center","no-center"]);
    expect(records.map(r=>r.cardId)).toEqual(original);
  });
  it("keeps a captain's own card and their guest cards together without a duplicate captain card", () => {
    const records=[
      record("other",{attendeeName:"Zara Smith",bowlerId:2}),
      record("guest-b",{attendeeName:"Guest Pass B",attendeeType:"guest",hostName:"Nathaniel Jones",guestSuffix:"B",isCaptain:true}),
      record("captain",{isCaptain:true}),
      record("guest-a",{attendeeName:"Morgan Jones",attendeeType:"guest",hostName:"Nathaniel Jones",guestSuffix:"A"}),
    ];
    expect(sortQrMasterPrintRecords(records).map(r=>r.cardId)).toEqual(["captain","guest-a","guest-b","other"]);
  });
  it("labels named and unnamed guest passes with the host without inventing names", () => {
    expect(masterPrintNames(record("captain",{isCaptain:true}))).toEqual(["Nathaniel Jones"]);
    expect(masterPrintNames(record("guest",{attendeeType:"guest",attendeeName:"Morgan Jones",hostName:"Nathaniel Jones"}))).toEqual(["Nathaniel Jones","Guest: Morgan Jones"]);
    expect(masterPrintNames(record("unnamed",{attendeeType:"guest",attendeeName:"Guest Pass A",hostName:"Nathaniel Jones"}))).toEqual(["Nathaniel Jones","Guest Pass A"]);
  });
  it("encodes every supplied QR URL exactly once in the requested order, including redeemed codes", async () => {
    const spy=vi.spyOn(QRCode,"toDataURL");
    const cards=[record("team10",{teamCode:"10",teamId:10,used:true}),record("guest",{attendeeType:"guest",attendeeName:"Guest Pass A",hostName:"Nathaniel Jones",guestSuffix:"A",qrUrl:"https://www.bowlvegas.com/scan/guest-banquet/exact-guest-token"}),record("bowler")];
    const sorted=sortQrMasterPrintRecords(cards);
    const doc=await createQrMasterPrintPdf(cards,{eventId:3960003,eventName:"B.O.B. November"});
    expect(doc?.getNumberOfPages()).toBe(1);
    expect(spy.mock.calls.map(call=>call[0])).toEqual(sorted.map(card=>card.qrUrl));
    expect(spy).toHaveBeenCalledTimes(3);
    expect(cards[0].used).toBe(true);
  });
  it("prints 10 standard business cards per letter-size page and reports complete progress", async () => {
    const progress=vi.fn();
    const cards=Array.from({length:11},(_,i)=>record(`code-${i}`,{bowlerId:i+1,attendeeName:`Sample Bowler ${i+1}`}));
    const doc=await createQrMasterPrintPdf(cards,{eventId:99,eventName:"Sample Event",onProgress:progress});
    expect(doc?.getNumberOfPages()).toBe(2);
    expect(doc?.internal.pageSize.getWidth()).toBe(612);
    expect(doc?.internal.pageSize.getHeight()).toBe(792);
    expect(progress).toHaveBeenCalledTimes(11);
    expect(progress).toHaveBeenLastCalledWith(11,11);
  });
  it("returns no PDF when no assigned QR codes exist", async () => {
    expect(await createQrMasterPrintPdf([],{eventId:99,eventName:"Empty Event"})).toBeNull();
  });
});
