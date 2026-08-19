import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CalendarPlus, CheckCircle2, ChevronRight, CircleAlert, ClipboardPenLine, ExternalLink, KeyRound, Link2, Loader2, Pencil, RefreshCw, Save, Search, ShieldCheck, Trash2, TriangleAlert, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { createEventDirectorWorkspacePath } from "@/lib/ownerNavigation";

type Readiness = { level: "ready" | "attention" | "blocked"; issues: string[] };
type EventDirector = { staffId: number; name: string; username: string };
type EventRow = {
  id: number; companyName: string | null; groupSlug: string | null; eventName: string; eventYear: number;
  status: "planning" | "active" | "completed"; bowlers: number; missingIds: number; missingClaimCodes: number;
  missingBanquetPasses: number; missingPoolPasses: number; sheetLastSyncedAt: number | null; readiness: Readiness; directors: EventDirector[];
};
type Detail = { event: Record<string, any>; bowlers: Array<Record<string, any>> };
type OperationsData = {
  companies: Array<{ id: number; name: string; slug: string }>;
  groups: Array<{ id: number; name: string; slug: string }>;
  events: Array<{ id: number; eventName: string; eventYear: number; companyId: number | null; status: string }>;
  directors: Array<{ id: number; name: string; username: string; companyId: number; companyName: string | null; eventIds: number[] }>;
};

const BRAND_LABELS: Record<string, string> = {
  bob: "B.O.B.", valentine: "Vegas Valentine Funtime",
  "june-group-1": "Funtime Team Challenge · Group 1", "june-group-2": "Funtime Team Challenge · Group 2",
  "june-group-3": "Funtime Team Challenge · Group 3", "june-group-4": "Funtime Team Challenge · Group 4",
};

const inputClass = "bg-white/[0.06] border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-amber-400/70";

function statusClass(level: Readiness["level"]) {
  return level === "ready" ? "bg-emerald-400/10 text-emerald-300 border-emerald-400/25" : level === "attention" ? "bg-amber-400/10 text-amber-200 border-amber-400/25" : "bg-rose-400/10 text-rose-200 border-rose-400/30";
}

function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const Icon = readiness.level === "ready" ? CheckCircle2 : readiness.level === "attention" ? CircleAlert : TriangleAlert;
  const label = readiness.level === "ready" ? "Ready" : readiness.level === "attention" ? "Needs attention" : "Blocked";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(readiness.level)}`}><Icon className="h-3.5 w-3.5" />{label}</span>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400"><span>{label}</span>{children}</label>;
}

function EventEditor({ event, onSaved, onDelete }: { event: Record<string, any>; onSaved: () => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(event);
  useEffect(() => setDraft(event), [event]);
  const update = trpc.ownerDashboard.updateEvent.useMutation({ onSuccess: () => { toast.success("Event settings saved"); onSaved(); }, onError: (error) => toast.error(error.message) });
  const set = (key: string, value: unknown) => setDraft((current: Record<string, any>) => ({ ...current, [key]: value }));
  const save = () => update.mutate({
    id: Number(draft.id), eventName: draft.eventName ?? "", eventYear: Number(draft.eventYear), status: draft.status,
    startDate: draft.startDate, endDate: draft.endDate, bowlingDate: draft.bowlingDate, squadTime: draft.squadTime,
    banquetDay: draft.banquetDay, banquetTime: draft.banquetTime, banquetLocation: draft.banquetLocation,
    poolPartyEnabled: Boolean(draft.poolPartyEnabled), poolPartyTime: draft.poolPartyTime,
    tshirtsProvided: Boolean(draft.tshirtsProvided), tshirtPickupLocation: draft.tshirtPickupLocation, tshirtPickupTime: draft.tshirtPickupTime,
    sheetSpreadsheetId: draft.sheetSpreadsheetId, sheetTabName: draft.sheetTabName, sheetTabNickname: draft.sheetTabNickname,
  });
  return <section className="rounded-2xl border border-white/10 bg-slate-950/65 p-5 shadow-xl shadow-black/20">
    <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Owner editor</p><h2 className="mt-1 text-xl font-semibold text-white">Event configuration</h2></div><Button variant="outline" onClick={onDelete} className="border-rose-400/30 text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"><Trash2 className="mr-2 h-4 w-4" />Delete event</Button></div>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Event name"><Input className={inputClass} value={draft.eventName ?? ""} onChange={(e) => set("eventName", e.target.value)} /></Field>
      <Field label="Event year"><Input type="number" className={inputClass} value={draft.eventYear ?? ""} onChange={(e) => set("eventYear", e.target.value)} /></Field>
      <Field label="Status"><select className={`${inputClass} h-9 rounded-md px-3`} value={draft.status ?? "planning"} onChange={(e) => set("status", e.target.value)}><option value="planning">Planning</option><option value="active">Active</option><option value="completed">Completed</option></select></Field>
      <Field label="Bowling date"><Input className={inputClass} value={draft.bowlingDate ?? ""} onChange={(e) => set("bowlingDate", e.target.value)} /></Field>
      <Field label="Start date"><Input className={inputClass} value={draft.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} /></Field>
      <Field label="End date"><Input className={inputClass} value={draft.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} /></Field>
      <Field label="Banquet day"><Input className={inputClass} value={draft.banquetDay ?? ""} onChange={(e) => set("banquetDay", e.target.value)} /></Field>
      <Field label="Banquet time"><Input className={inputClass} value={draft.banquetTime ?? ""} onChange={(e) => set("banquetTime", e.target.value)} /></Field>
      <Field label="Banquet location"><Input className={inputClass} value={draft.banquetLocation ?? ""} onChange={(e) => set("banquetLocation", e.target.value)} /></Field>
      <Field label="T-shirt pickup"><Input className={inputClass} value={draft.tshirtPickupLocation ?? ""} onChange={(e) => set("tshirtPickupLocation", e.target.value)} /></Field>
      <Field label="Google Sheet ID"><Input className={inputClass} value={draft.sheetSpreadsheetId ?? ""} onChange={(e) => set("sheetSpreadsheetId", e.target.value)} /></Field>
      <Field label="Google Sheet tab"><Input className={inputClass} value={draft.sheetTabName ?? ""} onChange={(e) => set("sheetTabName", e.target.value)} /></Field>
      <Field label="Sheet tab label"><Input className={inputClass} value={draft.sheetTabNickname ?? ""} onChange={(e) => set("sheetTabNickname", e.target.value)} /></Field>
      <Field label="Pool party time"><Input className={inputClass} value={draft.poolPartyTime ?? ""} onChange={(e) => set("poolPartyTime", e.target.value)} /></Field>
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"><span className="text-sm font-medium text-slate-200">Pool party enabled</span><Switch checked={Boolean(draft.poolPartyEnabled)} onCheckedChange={(checked) => set("poolPartyEnabled", checked)} /></div>
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"><span className="text-sm font-medium text-slate-200">T-shirts provided</span><Switch checked={Boolean(draft.tshirtsProvided)} onCheckedChange={(checked) => set("tshirtsProvided", checked)} /></div>
    </div>
    <div className="mt-5 flex justify-end"><Button disabled={update.isPending} onClick={save} className="bg-amber-300 text-slate-950 hover:bg-amber-200">{update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardPenLine className="mr-2 h-4 w-4" />}Save event settings</Button></div>
  </section>;
}

type CoordinatorContact = { coordinatorName: string; phone: string | null; email: string | null };

function CoordinatorContactPanel({ eventId, eventName }: { eventId: number; eventName: string }) {
  const contacts = trpc.ownerDashboard.listCoordinatorContacts.useQuery({ eventId });
  const [drafts, setDrafts] = useState<Record<string, { phone: string; email: string }>>({});
  const save = trpc.ownerDashboard.saveCoordinatorContact.useMutation({
    onSuccess: () => { toast.success("Coordinator contact saved"); contacts.refetch(); },
    onError: (error) => toast.error(error.message),
  });
  const rows = (contacts.data ?? []) as CoordinatorContact[];
  useEffect(() => {
    setDrafts(Object.fromEntries(rows.map((row) => [row.coordinatorName, { phone: row.phone ?? "", email: row.email ?? "" }])));
  }, [contacts.data]);
  const setDraft = (name: string, key: "phone" | "email", value: string) => setDrafts((current) => ({ ...current, [name]: { phone: current[name]?.phone ?? "", email: current[name]?.email ?? "", [key]: value } }));

  return <section className="rounded-2xl border border-cyan-300/20 bg-slate-950/65 p-5 shadow-xl shadow-black/20">
    <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Coordinator contacts</p><h2 className="mt-1 text-xl font-semibold text-white">Public claim-code guidance</h2><p className="mt-1 text-sm leading-6 text-slate-400">Set the phone and email displayed only to bowlers whose printed claim code matches each coordinator’s team in {eventName}.</p></div>
    {contacts.isLoading ? <p className="mt-5 text-sm text-slate-400"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading coordinators…</p> : null}
    {contacts.error ? <p className="mt-5 text-sm text-rose-200">{contacts.error.message}</p> : null}
    {rows.length > 0 ? <div className="mt-5 space-y-3">{rows.map((row) => {
      const draft = drafts[row.coordinatorName] ?? { phone: row.phone ?? "", email: row.email ?? "" };
      return <div key={row.coordinatorName} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="font-semibold text-white">{row.coordinatorName}</p><div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.35fr_auto]"><Input className={inputClass} value={draft.phone} onChange={(event) => setDraft(row.coordinatorName, "phone", event.target.value)} placeholder="Phone number" /><Input className={inputClass} type="email" value={draft.email} onChange={(event) => setDraft(row.coordinatorName, "email", event.target.value)} placeholder="Email address" /><Button disabled={save.isPending} onClick={() => save.mutate({ eventId, coordinatorName: row.coordinatorName, phone: draft.phone, email: draft.email })} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Save</Button></div></div>;
    })}</div> : !contacts.isLoading ? <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">No coordinator names are currently imported for this event. Import coordinator values from the Google Sheet first, then return here to add contact details.</p> : null}
  </section>;
}

function BowlerEditor({ bowler, onSaved, onDelete }: { bowler: Record<string, any>; onSaved: () => void; onDelete: () => void }) {
  const [draft, setDraft] = useState(bowler);
  useEffect(() => setDraft(bowler), [bowler]);
  const update = trpc.ownerDashboard.updateBowler.useMutation({ onSuccess: () => { toast.success("Bowler record saved"); onSaved(); }, onError: (error) => toast.error(error.message) });
  const set = (key: string, value: unknown) => setDraft((current: Record<string, any>) => ({ ...current, [key]: value }));
  const save = () => update.mutate({
    id: Number(draft.id), legalFirstName: draft.legalFirstName ?? "", legalLastName: draft.legalLastName ?? "", preferredName: draft.preferredName,
    email: draft.email ?? "", phone: draft.phone, scantronId: draft.scantronId, registrationStatus: draft.registrationStatus,
    under21: Boolean(draft.under21), isCapitain: Boolean(draft.isCapitain), tshirtSize: draft.tshirtSize, squadTime: draft.squadTime,
    laneNumber: draft.laneNumber ? Number(draft.laneNumber) : null, squadTime2: draft.squadTime2, laneNumber2: draft.laneNumber2 ? Number(draft.laneNumber2) : null,
    banquetTable: draft.banquetTable, notes: draft.notes,
  });
  return <section className="rounded-2xl border border-white/10 bg-slate-950/65 p-5 shadow-xl shadow-black/20">
    <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Owner editor</p><h2 className="mt-1 text-xl font-semibold text-white">Bowler record</h2></div><Button variant="outline" onClick={onDelete} className="border-rose-400/30 text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"><Trash2 className="mr-2 h-4 w-4" />Delete bowler</Button></div>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="First name"><Input className={inputClass} value={draft.legalFirstName ?? ""} onChange={(e) => set("legalFirstName", e.target.value)} /></Field>
      <Field label="Last name"><Input className={inputClass} value={draft.legalLastName ?? ""} onChange={(e) => set("legalLastName", e.target.value)} /></Field>
      <Field label="Preferred name"><Input className={inputClass} value={draft.preferredName ?? ""} onChange={(e) => set("preferredName", e.target.value)} /></Field>
      <Field label="Bowler ID"><Input className={inputClass} value={draft.scantronId ?? ""} onChange={(e) => set("scantronId", e.target.value)} /></Field>
      <Field label="Email"><Input className={inputClass} value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
      <Field label="Phone"><Input className={inputClass} value={draft.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
      <Field label="Registration status"><select className={`${inputClass} h-9 rounded-md px-3`} value={draft.registrationStatus ?? "pre_registered"} onChange={(e) => set("registrationStatus", e.target.value)}>{["pre_registered", "signed_up", "verified", "checked_in", "unmatched"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></Field>
      <Field label="T-shirt size"><Input className={inputClass} value={draft.tshirtSize ?? ""} onChange={(e) => set("tshirtSize", e.target.value)} /></Field>
      <Field label="Squad time"><Input className={inputClass} value={draft.squadTime ?? ""} onChange={(e) => set("squadTime", e.target.value)} /></Field>
      <Field label="Lane"><Input type="number" className={inputClass} value={draft.laneNumber ?? ""} onChange={(e) => set("laneNumber", e.target.value)} /></Field>
      <Field label="Second squad"><Input className={inputClass} value={draft.squadTime2 ?? ""} onChange={(e) => set("squadTime2", e.target.value)} /></Field>
      <Field label="Second lane"><Input type="number" className={inputClass} value={draft.laneNumber2 ?? ""} onChange={(e) => set("laneNumber2", e.target.value)} /></Field>
      <Field label="Banquet table"><Input className={inputClass} value={draft.banquetTable ?? ""} onChange={(e) => set("banquetTable", e.target.value)} /></Field>
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"><span className="text-sm font-medium text-slate-200">Under 21</span><Switch checked={Boolean(draft.under21)} onCheckedChange={(checked) => set("under21", checked)} /></div>
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"><span className="text-sm font-medium text-slate-200">Team captain</span><Switch checked={Boolean(draft.isCapitain)} onCheckedChange={(checked) => set("isCapitain", checked)} /></div>
      <div className="md:col-span-2"><Field label="Notes"><Textarea className={`${inputClass} min-h-20`} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
    </div>
    <div className="mt-5 flex justify-end"><Button disabled={update.isPending} onClick={save} className="bg-sky-300 text-slate-950 hover:bg-sky-200">{update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}Save bowler record</Button></div>
  </section>;
}

function OwnerOperationsPanel({ data, onChanged, onOpenEvent }: { data: OperationsData; onChanged: () => void; onOpenEvent: (eventId: number) => void }) {
  const [showEventCreate, setShowEventCreate] = useState(false);
  const [showDirectorCreate, setShowDirectorCreate] = useState(false);
  const [eventDraft, setEventDraft] = useState({ eventName: "", eventYear: String(new Date().getFullYear()), companyId: "", groupSlug: "bob", startDate: "", endDate: "", bowlingDate: "", squadTime: "", sheetSpreadsheetId: "", sheetTabName: "", sheetTabNickname: "" });
  const [directorDraft, setDirectorDraft] = useState({ name: "", username: "", password: "", companyId: "", eventIds: [] as number[] });
  const [selectedDirectorId, setSelectedDirectorId] = useState("");
  const [assignmentIds, setAssignmentIds] = useState<number[]>([]);
  const [resetPassword, setResetPassword] = useState("");
  const createEvent = trpc.ownerDashboard.createEvent.useMutation({ onSuccess: ({ eventId }) => { toast.success("Planning event created"); setShowEventCreate(false); setEventDraft((current) => ({ ...current, eventName: "" })); onChanged(); onOpenEvent(eventId); }, onError: (error) => toast.error(error.message) });
  const createDirector = trpc.ownerDashboard.createDirector.useMutation({ onSuccess: () => { toast.success("Event Director credentials created"); setShowDirectorCreate(false); setDirectorDraft((current) => ({ ...current, name: "", username: "", password: "", eventIds: [] })); onChanged(); }, onError: (error) => toast.error(error.message) });
  const setAssignments = trpc.ownerDashboard.setDirectorAssignments.useMutation({ onSuccess: () => { toast.success("Event Director assignments saved"); onChanged(); }, onError: (error) => toast.error(error.message) });
  const resetDirectorPassword = trpc.ownerDashboard.resetDirectorPassword.useMutation({ onSuccess: () => { toast.success("Event Director password reset"); setResetPassword(""); }, onError: (error) => toast.error(error.message) });
  const selectedDirector = data.directors.find((director) => director.id === Number(selectedDirectorId));
  const selectedDirectorEvents = data.events.filter((event) => event.companyId === selectedDirector?.companyId);
  const createDirectorEvents = data.events.filter((event) => event.companyId === Number(directorDraft.companyId));
  const toggle = (ids: number[], eventId: number) => ids.includes(eventId) ? ids.filter((id) => id !== eventId) : [...ids, eventId];

  return <section id="owner-operations" className="mb-8 overflow-hidden rounded-2xl border border-sky-300/15 bg-slate-950/65 shadow-2xl shadow-black/20">
    <div className="flex flex-col gap-4 border-b border-white/10 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Owner operations</p><h2 className="mt-1 text-xl font-semibold text-white">Create, assign, and open</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">Create a planning event, issue a director credential, assign the director to the right company events, and open any event from this portal.</p></div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => { setShowEventCreate((shown) => !shown); setShowDirectorCreate(false); }} className="bg-amber-300 text-slate-950 hover:bg-amber-200"><CalendarPlus className="mr-2 h-4 w-4" />Create event</Button><Button onClick={() => { setShowDirectorCreate((shown) => !shown); setShowEventCreate(false); }} variant="outline" className="border-sky-300/30 bg-sky-300/10 text-sky-100 hover:bg-sky-300/20 hover:text-white"><UserPlus className="mr-2 h-4 w-4" />Add Event Director</Button></div>
    </div>

    {showEventCreate && <form onSubmit={(event) => { event.preventDefault(); createEvent.mutate({ ...eventDraft, eventYear: Number(eventDraft.eventYear), companyId: Number(eventDraft.companyId) }); }} className="border-b border-white/10 bg-white/[0.025] p-5">
      <div className="mb-4"><h3 className="font-semibold text-white">Create a planning event</h3><p className="mt-1 text-sm text-slate-400">Enter the core setup now. The detailed owner editor opens immediately after creation.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Event name"><Input required className={inputClass} value={eventDraft.eventName} onChange={(event) => setEventDraft({ ...eventDraft, eventName: event.target.value })} placeholder="e.g. B.O.B. November" /></Field>
        <Field label="Event year"><Input required type="number" className={inputClass} value={eventDraft.eventYear} onChange={(event) => setEventDraft({ ...eventDraft, eventYear: event.target.value })} /></Field>
        <Field label="Company"><select required className={`${inputClass} h-9 rounded-md px-3`} value={eventDraft.companyId} onChange={(event) => setEventDraft({ ...eventDraft, companyId: event.target.value })}><option value="">Choose company</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
        <Field label="Brand / group"><select required className={`${inputClass} h-9 rounded-md px-3`} value={eventDraft.groupSlug} onChange={(event) => setEventDraft({ ...eventDraft, groupSlug: event.target.value })}>{data.groups.length ? data.groups.map((group) => <option key={group.id} value={group.slug}>{group.name}</option>) : <option value="bob">B.O.B.</option>}</select></Field>
        <Field label="Start date"><Input className={inputClass} value={eventDraft.startDate} onChange={(event) => setEventDraft({ ...eventDraft, startDate: event.target.value })} placeholder="MM/DD/YYYY" /></Field>
        <Field label="End date"><Input className={inputClass} value={eventDraft.endDate} onChange={(event) => setEventDraft({ ...eventDraft, endDate: event.target.value })} placeholder="MM/DD/YYYY" /></Field>
        <Field label="Bowling date"><Input className={inputClass} value={eventDraft.bowlingDate} onChange={(event) => setEventDraft({ ...eventDraft, bowlingDate: event.target.value })} placeholder="MM/DD/YYYY" /></Field>
        <Field label="Squad time"><Input className={inputClass} value={eventDraft.squadTime} onChange={(event) => setEventDraft({ ...eventDraft, squadTime: event.target.value })} placeholder="e.g. 9:00 AM" /></Field>
        <Field label="Google Sheet ID or URL"><Input className={inputClass} value={eventDraft.sheetSpreadsheetId} onChange={(event) => setEventDraft({ ...eventDraft, sheetSpreadsheetId: event.target.value })} placeholder="Optional until import setup" /></Field>
        <Field label="Sheet tab"><Input className={inputClass} value={eventDraft.sheetTabName} onChange={(event) => setEventDraft({ ...eventDraft, sheetTabName: event.target.value })} placeholder="Optional until import setup" /></Field>
        <Field label="Sheet tab label"><Input className={inputClass} value={eventDraft.sheetTabNickname} onChange={(event) => setEventDraft({ ...eventDraft, sheetTabNickname: event.target.value })} placeholder="Optional" /></Field>
      </div>
      <div className="mt-5 flex justify-end"><Button type="submit" disabled={createEvent.isPending} className="bg-amber-300 text-slate-950 hover:bg-amber-200">{createEvent.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />}Create and open event</Button></div>
    </form>}

    {showDirectorCreate && <form onSubmit={(event) => { event.preventDefault(); createDirector.mutate({ ...directorDraft, companyId: Number(directorDraft.companyId) }); }} className="border-b border-white/10 bg-white/[0.025] p-5">
      <div className="mb-4"><h3 className="font-semibold text-white">Create Event Director credentials</h3><p className="mt-1 text-sm text-slate-400">The password is shown only while you enter it. It is hashed before storage and can be reset later.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Director name"><Input required className={inputClass} value={directorDraft.name} onChange={(event) => setDirectorDraft({ ...directorDraft, name: event.target.value })} /></Field><Field label="Username"><Input required className={inputClass} value={directorDraft.username} onChange={(event) => setDirectorDraft({ ...directorDraft, username: event.target.value })} placeholder="letters, numbers, . _ -" /></Field><Field label="Temporary password"><Input required type="password" minLength={8} className={inputClass} value={directorDraft.password} onChange={(event) => setDirectorDraft({ ...directorDraft, password: event.target.value })} /></Field><Field label="Company"><select required className={`${inputClass} h-9 rounded-md px-3`} value={directorDraft.companyId} onChange={(event) => setDirectorDraft({ ...directorDraft, companyId: event.target.value, eventIds: [] })}><option value="">Choose company</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field></div>
      {directorDraft.companyId && <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4"><p className="text-sm font-semibold text-white">Optional initial event assignments</p><p className="mt-1 text-xs text-slate-500">You can leave this blank and assign the director later.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{createDirectorEvents.map((event) => <label key={event.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/[0.025] p-3 text-sm text-slate-300"><input type="checkbox" checked={directorDraft.eventIds.includes(event.id)} onChange={() => setDirectorDraft({ ...directorDraft, eventIds: toggle(directorDraft.eventIds, event.id) })} /><span>{event.eventName}<span className="block text-xs text-slate-500">{event.eventYear} · {event.status}</span></span></label>)}{!createDirectorEvents.length && <p className="text-sm text-amber-200">No events exist for this company yet. Create the director unassigned or create the event first.</p>}</div></div>}
      <div className="mt-5 flex justify-end"><Button type="submit" disabled={createDirector.isPending} className="bg-sky-300 text-slate-950 hover:bg-sky-200">{createDirector.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}Create Event Director</Button></div>
    </form>}

    <div className="p-5"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Event Director directory</p><h3 className="mt-1 text-lg font-semibold text-white">Assignments and credential maintenance</h3></div><select aria-label="Select Event Director to maintain" className={`${inputClass} h-9 rounded-md px-3 md:w-80`} value={selectedDirectorId} onChange={(event) => { const staffId = event.target.value; const director = data.directors.find((item) => item.id === Number(staffId)); setSelectedDirectorId(staffId); setAssignmentIds(director?.eventIds ?? []); setResetPassword(""); }}><option value="">Select an Event Director</option>{data.directors.map((director) => <option key={director.id} value={director.id}>{director.name} · {director.username}</option>)}</select></div>
      {selectedDirector && <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div><p className="font-semibold text-white">{selectedDirector.name}</p><p className="mt-1 text-sm text-slate-400">{selectedDirector.username} · {selectedDirector.companyName ?? "No company"}</p></div><div className="flex w-full max-w-md gap-2"><Input type="password" minLength={8} className={inputClass} placeholder="New password (8+ characters)" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /><Button disabled={resetPassword.length < 8 || resetDirectorPassword.isPending} onClick={() => resetDirectorPassword.mutate({ staffId: selectedDirector.id, password: resetPassword })} variant="outline" className="shrink-0 border-amber-300/30 text-amber-100 hover:bg-amber-300/10 hover:text-amber-50"><KeyRound className="mr-2 h-4 w-4" />Reset</Button></div></div>
        <div className="mt-4"><p className="text-sm font-semibold text-white">Assigned events</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{selectedDirectorEvents.map((event) => <label key={event.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-300"><input type="checkbox" checked={assignmentIds.includes(event.id)} onChange={() => setAssignmentIds(toggle(assignmentIds, event.id))} /><span>{event.eventName}<span className="block text-xs text-slate-500">{event.eventYear} · {event.status}</span></span></label>)}{!selectedDirectorEvents.length && <p className="text-sm text-amber-200">There are no events in this director's company.</p>}</div><div className="mt-4 flex justify-end"><Button disabled={setAssignments.isPending} onClick={() => setAssignments.mutate({ staffId: selectedDirector.id, eventIds: assignmentIds })} className="bg-sky-300 text-slate-950 hover:bg-sky-200">{setAssignments.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save assignments</Button></div></div>
      </div>}
    </div>
  </section>;
}

export default function OwnerDashboard() {
  const [, navigate] = useLocation();
  const { loading, isAuthenticated, user } = useAuth({ redirectOnUnauthenticated: true });
  const [brand, setBrand] = useState("all");
  const [directorId, setDirectorId] = useState("all");
  const [search, setSearch] = useState("");
  const [eventDirectorPortalEventId, setEventDirectorPortalEventId] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [editingBowlerId, setEditingBowlerId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<"event" | "bowler" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const overview = trpc.ownerDashboard.overview.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const operations = trpc.ownerDashboard.operationsData.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const detail = trpc.ownerDashboard.eventDetail.useQuery({ eventId: selectedEventId ?? 0 }, { enabled: Boolean(selectedEventId) && isAuthenticated });
  const deleteEvent = trpc.ownerDashboard.deleteEvent.useMutation({ onSuccess: () => { toast.success("Event permanently deleted"); setSelectedEventId(null); setConfirming(null); setConfirmation(""); overview.refetch(); }, onError: (error) => toast.error(error.message) });
  const deleteBowler = trpc.ownerDashboard.deleteBowler.useMutation({ onSuccess: () => { toast.success("Bowler permanently deleted"); setEditingBowlerId(null); setConfirming(null); setConfirmation(""); detail.refetch(); overview.refetch(); }, onError: (error) => toast.error(error.message) });

  const rows = (overview.data ?? []) as EventRow[];
  const directorOptions = useMemo(() => {
    const directors = new Map<number, EventDirector>();
    rows.forEach((row) => row.directors.forEach((director) => directors.set(director.staffId, director)));
    return Array.from(directors.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesBrand = brand === "all" || row.groupSlug === brand;
    const matchesDirector = directorId === "all" || (directorId === "unassigned" ? row.directors.length === 0 : row.directors.some((director) => director.staffId === Number(directorId)));
    const directorSearchText = row.directors.map((director) => `${director.name} ${director.username}`).join(" ");
    return matchesBrand && matchesDirector && (!query || `${row.eventName} ${row.companyName ?? ""} ${row.groupSlug ?? ""} ${directorSearchText}`.toLowerCase().includes(query));
  }), [brand, directorId, rows, search]);
  const selected = detail.data as Detail | undefined;
  const selectedBowler = selected?.bowlers.find((bowler) => Number(bowler.id) === editingBowlerId);
  const overviewStats = { events: rows.length, blocked: rows.filter((row) => row.readiness.level === "blocked").length, attention: rows.filter((row) => row.readiness.level === "attention").length, bowlers: rows.reduce((total, row) => total + Number(row.bowlers ?? 0), 0) };
  const priorityEvent = rows.find((row) => row.readiness.level === "blocked") ?? rows.find((row) => row.readiness.level === "attention") ?? rows[0];
  useEffect(() => {
    const initialEventId = Number(new URLSearchParams(window.location.search).get("eventId"));
    if (Number.isInteger(initialEventId) && initialEventId > 0) setSelectedEventId(initialEventId);
  }, []);

  if (loading || (isAuthenticated && overview.isLoading)) return <div className="min-h-screen bg-[#080b14] text-slate-100 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-amber-300" /></div>;
  if (!isAuthenticated) return null;

  const refreshSelected = () => { detail.refetch(); overview.refetch(); operations.refetch(); };
  const openEventWorkspace = (eventId: number) => {
    setSelectedEventId(eventId);
    setEditingBowlerId(null);
    window.history.replaceState({}, "", `/owner?eventId=${eventId}`);
    window.setTimeout(() => document.getElementById("owner-event-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const openEventDirectorPortal = () => {
    const eventId = Number(eventDirectorPortalEventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      toast.error("Choose an event to open in the Event Director Portal.");
      return;
    }
    window.location.assign(createEventDirectorWorkspacePath(eventId));
  };
  const doDelete = () => {
    if (confirming === "event" && selectedEventId) deleteEvent.mutate({ eventId: selectedEventId, confirmation: "DELETE EVENT" });
    if (confirming === "bowler" && editingBowlerId) deleteBowler.mutate({ bowlerId: editingBowlerId, confirmation: "DELETE BOWLER" });
  };
  const neededConfirmation = confirming === "event" ? "DELETE EVENT" : "DELETE BOWLER";

  return <div className="min-h-screen bg-[#080b14] text-slate-100 selection:bg-amber-300 selection:text-slate-950">
    <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -top-48 left-1/4 h-[28rem] w-[28rem] rounded-full bg-amber-400/10 blur-[120px]" /><div className="absolute right-0 top-1/3 h-[24rem] w-[24rem] rounded-full bg-sky-500/10 blur-[110px]" /></div>
    <main className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><button onClick={() => navigate("/")} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" />Exit owner portal</button><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10"><ShieldCheck className="h-6 w-6 text-amber-300" /></span><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-300">Dedicated private portal</p><h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Owner Portal</h1></div></div><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Your private command center for creating, validating, correcting, and controlling every event across B.O.B., Vegas Valentine Funtime, and Funtime Team Challenge. Access is tied to your Manus owner account: {user?.name ?? "Owner"}.</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-bold text-amber-200">OWNER ONLY</span><span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-xs font-bold text-sky-200">ALL BRANDS</span><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-xs font-bold text-emerald-200">DIRECT EDITING</span></div></div><div className="flex w-full flex-col gap-2 lg:w-auto"><div className="rounded-xl border border-sky-300/20 bg-sky-300/[0.07] p-3"><p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-sky-200">Open Event Director Portal</p><div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Select event for Event Director Portal" className="h-10 min-w-0 rounded-md border border-sky-300/25 bg-slate-950 px-3 text-sm text-white sm:min-w-64" value={eventDirectorPortalEventId} onChange={(event) => setEventDirectorPortalEventId(event.target.value)}><option value="">Choose any event…</option>{rows.map((event) => <option key={event.id} value={event.id}>{event.eventName} · {event.eventYear} · {event.status}</option>)}</select><Button onClick={openEventDirectorPortal} disabled={!eventDirectorPortalEventId} className="bg-sky-300 text-slate-950 hover:bg-sky-200"><ExternalLink className="mr-2 h-4 w-4" />Open</Button></div></div><div className="flex flex-wrap gap-2"><Button onClick={() => document.getElementById("owner-operations")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="bg-amber-300 text-slate-950 hover:bg-amber-200"><CalendarPlus className="mr-2 h-4 w-4" />Manage events & directors</Button><Button variant="outline" onClick={() => { overview.refetch(); operations.refetch(); }} disabled={overview.isFetching || operations.isFetching} className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08] hover:text-white"><RefreshCw className={`mr-2 h-4 w-4 ${(overview.isFetching || operations.isFetching) ? "animate-spin" : ""}`} />Run readiness check</Button></div></div></header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: "Events", value: overviewStats.events, icon: ClipboardPenLine, className: "text-white" },
        { label: "Require attention", value: overviewStats.attention, icon: CircleAlert, className: "text-amber-200" },
        { label: "Blocked", value: overviewStats.blocked, icon: TriangleAlert, className: "text-rose-200" },
        { label: "Bowlers in platform", value: overviewStats.bowlers.toLocaleString(), icon: Users, className: "text-sky-200" },
      ].map(({ label, value, icon: Icon, className }) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/10"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-400">{label}</p><Icon className="h-5 w-5 text-slate-500" /></div><p className={`mt-3 text-3xl font-semibold ${className}`}>{value}</p></div>)}</section>

      <section className="mb-8 overflow-hidden rounded-2xl border border-amber-300/15 bg-gradient-to-r from-amber-300/[0.11] via-slate-950/70 to-sky-300/[0.08] p-5 shadow-xl shadow-black/15"><div className="grid gap-5 lg:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))]"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Owner command center</p><h2 className="mt-2 text-2xl font-semibold text-white">Resolve readiness issues before they reach an event.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Start from the event validation table, then open the specific event and bowler records that require correction. Only your Manus owner account can use these controls.</p><Button onClick={() => { if (priorityEvent) openEventWorkspace(priorityEvent.id); document.getElementById("owner-events")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="mt-4 bg-amber-300 text-slate-950 hover:bg-amber-200"><ClipboardPenLine className="mr-2 h-4 w-4" />{priorityEvent ? `Review ${priorityEvent.eventName}` : "Review events"}</Button></div><div className="rounded-xl border border-white/10 bg-slate-950/45 p-4"><p className="text-sm font-semibold text-white">Validation authority</p><p className="mt-2 text-sm leading-5 text-slate-400">Review Sheet routing, missing IDs, QR/passport passes, claim codes, centers, and roster matches in one place.</p></div><div className="rounded-xl border border-white/10 bg-slate-950/45 p-4"><p className="text-sm font-semibold text-white">Event authority</p><p className="mt-2 text-sm leading-5 text-slate-400">Create events, issue staff credentials, assign portfolios, and correct event settings.</p></div><div className="rounded-xl border border-white/10 bg-slate-950/45 p-4"><p className="text-sm font-semibold text-white">Roster authority</p><p className="mt-2 text-sm leading-5 text-slate-400">Open and edit individual bowler records, including passes, U21 status, lanes, registration, and notes.</p></div></div></section>

      {operations.isLoading && <section id="owner-operations" className="mb-8 rounded-2xl border border-sky-300/15 bg-slate-950/65 p-5 text-sm text-slate-300"><Loader2 className="mr-2 inline h-4 w-4 animate-spin text-sky-300" />Loading event and Event Director controls…</section>}
      {operations.error && <section id="owner-operations" className="mb-8 rounded-2xl border border-rose-300/25 bg-rose-300/10 p-5"><p className="font-semibold text-rose-100">Owner operations could not load.</p><p className="mt-1 text-sm text-rose-100/80">{operations.error.message}</p><Button onClick={() => operations.refetch()} className="mt-3 bg-rose-200 text-rose-950 hover:bg-rose-100"><RefreshCw className="mr-2 h-4 w-4" />Retry controls</Button></section>}
      {operations.data && <OwnerOperationsPanel data={operations.data as OperationsData} onChanged={() => { operations.refetch(); overview.refetch(); }} onOpenEvent={openEventWorkspace} />}

      <section id="owner-events" className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 shadow-2xl shadow-black/20"><div className="flex flex-col gap-4 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">Validation & correction</p><h2 className="mt-1 text-lg font-semibold text-white">Cross-platform event controls</h2><p className="mt-1 text-sm text-slate-500">Select an Event Director to see their assigned events, then open an event to edit its settings and browse its roster.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input className="w-full border-white/10 bg-white/[0.04] pl-9 text-white placeholder:text-slate-500 sm:w-64" placeholder="Search events or directors" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select aria-label="Filter by Event Director" className="h-9 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-200" value={directorId} onChange={(e) => setDirectorId(e.target.value)}><option value="all">All Event Directors</option><option value="unassigned">Unassigned events</option>{directorOptions.map((director) => <option key={director.staffId} value={director.staffId}>{director.name}{director.username ? ` · ${director.username}` : ""}</option>)}</select><select aria-label="Filter by brand" className="h-9 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-200" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="all">All brands</option>{Object.entries(BRAND_LABELS).map(([slug, label]) => <option key={slug} value={slug}>{label}</option>)}</select></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left"><thead className="bg-white/[0.025] text-xs uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-3">Event</th><th className="px-5 py-3">Brand</th><th className="px-5 py-3">Event Director</th><th className="px-5 py-3">Readiness</th><th className="px-5 py-3">Roster</th><th className="px-5 py-3">Open issues</th><th className="px-5 py-3">Workspace</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id} onClick={() => openEventWorkspace(row.id)} className={`cursor-pointer border-t border-white/[0.07] transition hover:bg-white/[0.045] ${selectedEventId === row.id ? "bg-amber-300/[0.06]" : ""}`}><td className="px-5 py-4"><p className="font-semibold text-white">{row.eventName}</p><p className="mt-1 text-xs text-slate-500">{row.companyName ?? "Unassigned company"} · {row.eventYear} · {row.status}</p></td><td className="px-5 py-4 text-sm text-slate-300">{BRAND_LABELS[row.groupSlug ?? ""] ?? row.groupSlug ?? "Not set"}</td><td className="px-5 py-4 text-sm text-slate-300">{row.directors.length ? row.directors.map((director) => <span key={director.staffId} className="block">{director.name}</span>) : <span className="text-amber-200">Unassigned</span>}</td><td className="px-5 py-4"><ReadinessBadge readiness={row.readiness} /></td><td className="px-5 py-4 text-sm text-slate-300">{Number(row.bowlers).toLocaleString()} bowlers</td><td className="max-w-sm px-5 py-4 text-sm text-slate-400">{row.readiness.issues.slice(0, 2).join(" · ")}{row.readiness.issues.length > 2 ? ` +${row.readiness.issues.length - 2}` : ""}</td><td className="px-5 py-4"><Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); openEventWorkspace(row.id); }} className="border-sky-300/25 text-sky-100 hover:bg-sky-300/10 hover:text-white"><Link2 className="mr-1.5 h-3.5 w-3.5" />Open</Button></td></tr>)}{filteredRows.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No events match the current filters.</td></tr>}</tbody></table></div>
      </section>

      {selected && <section id="owner-event-workspace" className="mt-8 grid gap-6 xl:grid-cols-2"><EventEditor event={selected.event} onSaved={refreshSelected} onDelete={() => { setConfirming("event"); setConfirmation(""); }} /><CoordinatorContactPanel eventId={Number(selected.event.id)} eventName={String(selected.event.eventName)} /><div className="xl:col-span-2 rounded-2xl border border-white/10 bg-slate-950/65 p-5 shadow-xl shadow-black/20"><div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Roster editor</p><h2 className="mt-1 text-xl font-semibold text-white">{selected.bowlers.length.toLocaleString()} bowler records</h2></div><Button variant="outline" onClick={() => navigate(`/admin/master-sheet?eventId=${selected.event.id}`)} className="border-white/10 text-slate-200 hover:bg-white/[0.08] hover:text-white"><ExternalLink className="mr-2 h-4 w-4" />Sheet tools</Button></div><div className="max-h-[680px] overflow-auto rounded-xl border border-white/10"><table className="w-full min-w-[720px] text-left"><thead className="sticky top-0 bg-slate-950 text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Bowler</th><th className="px-4 py-3">Center / team</th><th className="px-4 py-3">Passes</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody>{selected.bowlers.map((bowler) => <tr key={String(bowler.id)} className="border-t border-white/[0.07] hover:bg-white/[0.035]"><td className="px-4 py-3"><p className="font-medium text-white">{bowler.legalFirstName} {bowler.legalLastName}{bowler.under21 ? <span className="ml-2 text-xs font-bold text-rose-300">U21</span> : null}</p><p className="mt-0.5 text-xs text-slate-500">{bowler.scantronId || "Missing Bowler ID"}</p></td><td className="px-4 py-3 text-sm text-slate-300">{bowler.centerName || "Missing center"}<span className="block text-xs text-slate-500">{bowler.teamName || "No team"}</span></td><td className="px-4 py-3 text-xs text-slate-400">{bowler.banquetToken ? "Banquet" : "No banquet"}{selected.event.poolPartyEnabled ? ` · ${bowler.poolPartyToken ? "Pool" : "No pool"}` : ""}<span className="block text-slate-500">{Number(bowler.guestCount ?? 0)} guest(s) · {bowler.hasClaimCode ? "Claim code" : "No claim code"}</span></td><td className="px-4 py-3 text-xs capitalize text-slate-300">{String(bowler.registrationStatus ?? "").replaceAll("_", " ")}</td><td className="px-4 py-3"><Button size="sm" variant="ghost" onClick={() => { setEditingBowlerId(Number(bowler.id)); setConfirming(null); }} className="text-sky-200 hover:bg-sky-400/10 hover:text-sky-100"><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button></td></tr>)}</tbody></table></div></div></section>}
      {selectedBowler && <section className="mt-6"><BowlerEditor bowler={selectedBowler} onSaved={refreshSelected} onDelete={() => { setConfirming("bowler"); setConfirmation(""); }} /></section>}

      {confirming && <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-rose-400/25 bg-[#12131c] p-6 shadow-2xl shadow-black/70"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-rose-400/10"><TriangleAlert className="h-5 w-5 text-rose-300" /></span><div><h2 className="font-semibold text-white">Permanent deletion</h2><p className="text-sm text-slate-400">This cannot be undone.</p></div></div><p className="mt-5 text-sm leading-6 text-slate-300">Type <strong className="select-all text-rose-200">{neededConfirmation}</strong> to permanently delete this {confirming} and its dependent data.</p><Input className={`${inputClass} mt-4`} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder={neededConfirmation} /><div className="mt-5 flex justify-end gap-3"><Button variant="ghost" onClick={() => { setConfirming(null); setConfirmation(""); }} className="text-slate-300 hover:bg-white/10 hover:text-white">Cancel</Button><Button disabled={confirmation !== neededConfirmation || deleteEvent.isPending || deleteBowler.isPending} onClick={doDelete} className="bg-rose-500 text-white hover:bg-rose-400">{(deleteEvent.isPending || deleteBowler.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete permanently</Button></div></div></div>}
    </main>
  </div>;
}
