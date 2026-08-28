import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type RosterRow = Record<string, string>;

const shell = "min-h-screen bg-[#071018] px-4 py-8 text-slate-100 sm:px-8";
const input = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-400";
const blankRow = (): RosterRow => ({ firstName: "", lastName: "", captain: "No", email: "", phone: "", teamNumber: "", teamName: "", notes: "", specialRequestCategory: "", specialRequestNote: "", specialRequestStatus: "new" });
const rosterHeaders = ["First Name", "Last Name", "Captain (Yes/No)", "Email", "Phone", "Team Number", "Team Name", "Notes"];

function parseSessions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []; } catch { return []; }
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const current = line[index];
    if (current === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; }
    else if (current === '"') quoted = !quoted;
    else if (current === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += current;
  }
  cells.push(cell.trim());
  return cells;
}

function parsePastedCsv(value: string): RosterRow[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const keys = parseCsvLine(lines[0]).map((item) => item.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const aliases: Record<string, keyof RosterRow> = { firstname: "firstName", lastname: "lastName", captain: "captain", iscaptain: "captain", email: "email", emailaddress: "email", phone: "phone", phonenumber: "phone", teamnumber: "teamNumber", teamname: "teamName", notes: "notes", request: "notes" };
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = blankRow();
    keys.forEach((key, index) => { const target = aliases[key]; if (target) row[target] = cells[index] ?? ""; });
    return row;
  }).filter((row) => Object.values(row).some((value) => value.trim() && value !== "No"));
}

function statusLabel(status?: string) {
  return (status ?? "draft").replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function CoordinatorPortal() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const access = trpc.coordinator.access.useQuery();
  const scopes = trpc.coordinator.myScopes.useQuery(undefined, { enabled: Boolean(access.data) });
  const submissions = trpc.coordinator.submissions.listMine.useQuery(undefined, { enabled: Boolean(access.data) });
  const logout = trpc.coordinator.logout.useMutation({ onSuccess: () => { void access.refetch(); void scopes.refetch(); void submissions.refetch(); } });
  const login = trpc.coordinator.login.useMutation({ onSuccess: () => { void access.refetch(); void scopes.refetch(); void submissions.refetch(); } });
  const redeem = trpc.coordinator.redeem.useMutation({ onSuccess: () => setLocation("/coordinator") });
  const [mode, setMode] = useState<"login" | "redeem">("login");
  const [form, setForm] = useState<Record<string, string>>({ preferredContactMethod: "Mobile" });
  const [scopeId, setScopeId] = useState("");
  const [leagueSession, setLeagueSession] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | undefined>();
  const [loadedSubmissionId, setLoadedSubmissionId] = useState<string | undefined>();
  const [rows, setRows] = useState<RosterRow[]>([blankRow()]);
  const [pasteText, setPasteText] = useState("");
  const activeSubmission = trpc.coordinator.submissions.getMine.useQuery({ submissionId: selectedSubmissionId ?? "00000000-0000-4000-8000-000000000000" }, { enabled: Boolean(selectedSubmissionId) });
  const saveDraft = trpc.coordinator.submissions.saveDraft.useMutation({
    onSuccess: async (result) => {
      setSelectedSubmissionId(result.submissionId);
      await Promise.all([utils.coordinator.submissions.listMine.invalidate(), utils.coordinator.submissions.getMine.invalidate()]);
    },
  });
  const submitForReview = trpc.coordinator.submissions.submitForEdReview.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.coordinator.submissions.listMine.invalidate(), utils.coordinator.submissions.getMine.invalidate()]);
    },
  });

  const activeScope = useMemo(() => (scopes.data ?? []).find((scope: any) => String(scope.id) === scopeId), [scopeId, scopes.data]);
  const allowedSessions = useMemo(() => parseSessions(activeScope?.leagueSessions), [activeScope?.leagueSessions]);
  const submissionStatus = activeSubmission.data?.submission.status as string | undefined;
  const isEditable = !submissionStatus || ["draft", "needs_coordinator_follow_up"].includes(submissionStatus);
  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "login") login.mutate({ email: form.email ?? "", password: form.password ?? "" });
    else redeem.mutate({ code: form.code ?? "", firstName: form.firstName ?? "", lastName: form.lastName ?? "", email: form.email ?? "", password: form.password ?? "", centerPhone: form.centerPhone ?? "", centerExtension: form.centerExtension ?? "", mobilePhone: form.mobilePhone || undefined, preferredContactMethod: form.preferredContactMethod || undefined });
  };

  useEffect(() => {
    if (!scopeId && scopes.data?.[0]) setScopeId(String((scopes.data[0] as any).id));
  }, [scopeId, scopes.data]);

  useEffect(() => {
    if (!activeScope) return;
    if (allowedSessions.length === 1) setLeagueSession(allowedSessions[0]);
    else if (allowedSessions.length && !allowedSessions.includes(leagueSession)) setLeagueSession(allowedSessions[0]);
  }, [activeScope, allowedSessions, leagueSession]);

  useEffect(() => {
    const payload = activeSubmission.data;
    if (!payload || payload.submission.id === loadedSubmissionId) return;
    setLoadedSubmissionId(payload.submission.id);
    const matchingScope = (scopes.data ?? []).find((scope: any) => scope.eventId === payload.submission.eventId && scope.centerId === payload.submission.centerId);
    if (matchingScope) setScopeId(String((matchingScope as any).id));
    setLeagueSession(payload.submission.leagueSession ?? "");
    setRows(payload.rows.map((row: any) => ({ ...blankRow(), ...(row.data as RosterRow) })) || [blankRow()]);
  }, [activeSubmission.data, loadedSubmissionId]);

  const updateRow = (index: number, key: keyof RosterRow, value: string) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const startNewRoster = () => { setSelectedSubmissionId(undefined); setLoadedSubmissionId(undefined); setRows([blankRow()]); setPasteText(""); };
  const openSubmission = (id: string) => { setLoadedSubmissionId(undefined); setSelectedSubmissionId(id); };
  const save = () => {
    if (!scopeId || !leagueSession) return;
    saveDraft.mutate({ scopeId: Number(scopeId), submissionId: selectedSubmissionId, leagueSession, sourceType: pasteText ? "csv" : "web_form", rows });
  };
  const importPaste = () => { const imported = parsePastedCsv(pasteText); if (imported.length) setRows(imported); };
  const downloadTemplate = () => {
    const csv = `${rosterHeaders.join(",")}\nAvery,Bowl,Yes,avery@example.com,702-555-0123,12,Pins Up,Initial request or note\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bowl-vegas-coordinator-roster-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (access.isLoading) return <main className={`${shell} grid place-items-center`}>Checking secure coordinator access…</main>;
  if (!access.data) return <main className={shell}><section className="mx-auto max-w-xl rounded-2xl border border-cyan-400/20 bg-slate-900/80 p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Bowl Vegas · Coordinator Package</p><h1 className="mt-2 text-3xl font-bold">Coordinator workspace</h1><p className="mt-3 text-sm leading-6 text-slate-300">Use the one-time invitation code sent by your Event Director to create your coordinator account. Returning coordinators may sign in with their email and password.</p><div className="mt-6 flex gap-2"><button onClick={() => setMode("login")} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === "login" ? "bg-cyan-400 text-slate-950" : "bg-slate-800"}`}>Sign in</button><button onClick={() => setMode("redeem")} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === "redeem" ? "bg-cyan-400 text-slate-950" : "bg-slate-800"}`}>Use invitation</button></div><form onSubmit={submit} className="mt-5 grid gap-3">{mode === "redeem" && <><input className={input} placeholder="One-time invitation code" onChange={(e) => update("code", e.target.value)} required /><div className="grid gap-3 sm:grid-cols-2"><input className={input} placeholder="First name" onChange={(e) => update("firstName", e.target.value)} required /><input className={input} placeholder="Last name" onChange={(e) => update("lastName", e.target.value)} required /></div></>}<input className={input} type="email" placeholder="Email address (your username)" onChange={(e) => update("email", e.target.value)} required /><input className={input} type="password" placeholder="Password" onChange={(e) => update("password", e.target.value)} required />{mode === "redeem" && <><div className="grid gap-3 sm:grid-cols-2"><input className={input} placeholder="Center phone number" onChange={(e) => update("centerPhone", e.target.value)} required /><input className={input} placeholder="Extension" onChange={(e) => update("centerExtension", e.target.value)} required /></div><input className={input} placeholder="Mobile or direct number (optional)" onChange={(e) => update("mobilePhone", e.target.value)} /><select className={input} value={form.preferredContactMethod} onChange={(e) => update("preferredContactMethod", e.target.value)}><option>Mobile</option><option>Center phone</option><option>Email</option></select></>}<button disabled={login.isPending || redeem.isPending} className="rounded-lg bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{mode === "login" ? "Sign in securely" : "Create coordinator account"}</button>{(login.error || redeem.error) && <p className="text-sm text-rose-300">{login.error?.message ?? redeem.error?.message}</p>}</form></section></main>;

  return <main className={shell}><section className="mx-auto max-w-7xl"><header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-6"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-300">Coordinator workspace</p><h1 className="mt-2 text-3xl font-bold">Welcome, {access.data.firstName ?? "Coordinator"}</h1><p className="mt-2 max-w-3xl text-slate-300">Enter your center roster, save a draft at any time, and submit it for Event Director review. Only the Owner performs app imports and creates app-generated data.</p></div><button onClick={() => logout.mutate()} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Sign out</button></header>
    {(scopes.data?.length ?? 0) === 0 ? <p className="mt-8 rounded-xl border border-amber-300/30 bg-amber-500/10 p-5 text-amber-100">Your account is active but has no current event scope. Contact your Event Director.</p> : <div className="mt-6 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"><aside className="space-y-4"><section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><div className="flex items-center justify-between gap-2"><h2 className="font-bold">My roster work</h2><button onClick={startNewRoster} className="rounded-md bg-cyan-400 px-2 py-1 text-xs font-bold text-slate-950">New roster</button></div><p className="mt-2 text-xs leading-5 text-slate-400">A roster is limited to the event, center, and league session in your invitation.</p><div className="mt-4 space-y-2">{submissions.data?.map((submission: any) => <button key={submission.id} onClick={() => openSubmission(submission.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedSubmissionId === submission.id ? "border-cyan-400 bg-cyan-500/10" : "border-slate-800 bg-slate-950 hover:border-slate-600"}`}><span className="block text-sm font-semibold">{submission.centerName ?? "Assigned center"}</span><span className="block text-xs text-slate-400">{submission.leagueSession ?? "League session pending"} · {submission.rowCount} bowlers</span><span className="mt-1 block text-xs text-cyan-200">{statusLabel(submission.status)}</span></button>)}</div></section><section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4"><h2 className="font-bold text-cyan-100">What to enter</h2><p className="mt-2 text-xs leading-5 text-slate-300">Start with names, team details, captain, email and phone. Missing email or phone appears as a review warning, so you can return later.</p><button onClick={downloadTemplate} className="mt-3 rounded-lg border border-cyan-400/50 px-3 py-2 text-xs font-semibold text-cyan-100">Download clean CSV template</button><p className="mt-2 text-xs leading-5 text-slate-400">The template contains only coordinator-entered fields. Do not include claim codes, Bowler IDs, QR codes, billing, scans, scores, or other app-generated information.</p></section></aside>
      <section className="min-w-0 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-cyan-300">Scoped roster intake</p><h2 className="mt-1 text-xl font-bold">{selectedSubmissionId ? "Continue roster" : "Create roster draft"}</h2></div>{submissionStatus && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-100">{statusLabel(submissionStatus)}</span>}</div>
        <div className="mt-5 grid gap-3 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Authorized event and center<select value={scopeId} onChange={(e) => { setScopeId(e.target.value); setLeagueSession(""); }} disabled={!isEditable} className={input}>{(scopes.data ?? []).map((scope: any) => <option key={scope.id} value={String(scope.id)}>{scope.eventName} · {scope.centerName ?? "Any approved center"}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">League session / day and time<select value={leagueSession} onChange={(e) => setLeagueSession(e.target.value)} disabled={!isEditable} className={input}>{allowedSessions.length ? allowedSessions.map((session) => <option key={session} value={session}>{session}</option>) : <option value="">Enter league session below</option>}</select>{!allowedSessions.length && <input value={leagueSession} disabled={!isEditable} onChange={(e) => setLeagueSession(e.target.value)} className={`${input} mt-2`} placeholder="Example: Tuesday 7:00 PM" required />}</label></div>
        <details className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4"><summary className="cursor-pointer text-sm font-semibold text-cyan-100">Paste a familiar CSV roster</summary><p className="mt-2 text-xs leading-5 text-slate-400">Paste a CSV with headers. Accepted fields: {rosterHeaders.join(", ")}. This only creates editable coordinator rows; app-generated fields are ignored.</p><textarea value={pasteText} disabled={!isEditable} onChange={(e) => setPasteText(e.target.value)} className={`${input} mt-3 min-h-28 font-mono`} placeholder={`${rosterHeaders.join(",")}\nAvery,Bowl,Yes,avery@example.com,702-555-0123,12,Pins Up,Wheelchair lane request`} /><button disabled={!isEditable || !pasteText.trim()} onClick={importPaste} className="mt-3 rounded-lg border border-cyan-400/50 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50">Replace rows with pasted CSV</button></details>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[940px] border-separate border-spacing-y-2 text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-2">Bowler</th><th className="px-2">Captain</th><th className="px-2">Contact</th><th className="px-2">Team</th><th className="px-2">Initial note</th><th className="px-2">More details</th><th /></tr></thead><tbody>{rows.map((row, index) => <RosterTableRow key={index} row={row} index={index} editable={isEditable} onChange={updateRow} onRemove={() => setRows((current) => current.length > 1 ? current.filter((_, currentIndex) => currentIndex !== index) : [blankRow()])} />)}</tbody></table></div>
        {isEditable && <button onClick={() => setRows((current) => [...current, blankRow()])} className="mt-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold">Add bowler row</button>}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-5"><button disabled={!isEditable || !scopeId || !leagueSession || saveDraft.isPending} onClick={save} className="rounded-lg bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saveDraft.isPending ? "Saving…" : "Save roster draft"}</button>{selectedSubmissionId && <button disabled={!isEditable || submitForReview.isPending} onClick={() => submitForReview.mutate({ submissionId: selectedSubmissionId })} className="rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100 disabled:opacity-50">{submitForReview.isPending ? "Submitting…" : "Submit for ED review"}</button>}<p className="text-xs text-slate-400">Your Event Director sees the roster and validation notes; email and phone gaps are warnings rather than an automatic block.</p></div>
        {(saveDraft.error || submitForReview.error) && <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{saveDraft.error?.message ?? submitForReview.error?.message}</p>}
        {activeSubmission.data && <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4"><h3 className="font-bold">Current review summary</h3><div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><Metric label="Bowlers" value={activeSubmission.data.summary.rowCount} /><Metric label="Teams" value={activeSubmission.data.summary.teamCount} /><Metric label="Contact warnings" value={activeSubmission.data.summary.warningCount} /><Metric label="Corrections needed" value={activeSubmission.data.summary.errorCount} /></div>{activeSubmission.data.audit?.[0] && <p className="mt-4 text-xs text-slate-400">Latest activity: {(activeSubmission.data.audit[0] as any).action?.replaceAll("_", " ")} on {new Date((activeSubmission.data.audit[0] as any).createdAt).toLocaleString()}.</p>}</section>}
      </section></div>}</section></main>;
}

function RosterTableRow({ row, index, editable, onChange, onRemove }: { row: RosterRow; index: number; editable: boolean; onChange: (index: number, key: keyof RosterRow, value: string) => void; onRemove: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const renderInput = (key: keyof RosterRow, placeholder: string, type = "text") => <input aria-label={`${placeholder} for row ${index + 1}`} type={type} value={row[key] ?? ""} disabled={!editable} onChange={(event) => onChange(index, key, event.target.value)} className={input} placeholder={placeholder} />;
  return <><tr className="align-top"><td className="rounded-l-lg bg-slate-950 p-2"><div className="grid gap-2">{renderInput("firstName", "First name")}{renderInput("lastName", "Last name")}</div></td><td className="bg-slate-950 p-2"><select aria-label={`Captain status for row ${index + 1}`} value={row.captain ?? "No"} disabled={!editable} onChange={(event) => onChange(index, "captain", event.target.value)} className={input}><option value="Yes">Captain</option><option value="No">Not captain</option></select></td><td className="bg-slate-950 p-2"><div className="grid gap-2">{renderInput("email", "Email", "email")}{renderInput("phone", "Phone")}</div></td><td className="bg-slate-950 p-2"><div className="grid gap-2">{renderInput("teamNumber", "Team number")}{renderInput("teamName", "Team name")}</div></td><td className="bg-slate-950 p-2"><textarea aria-label={`Initial note for row ${index + 1}`} value={row.notes ?? ""} disabled={!editable} onChange={(event) => onChange(index, "notes", event.target.value)} className={`${input} min-h-20`} placeholder="Initial request or note" /></td><td className="bg-slate-950 p-2"><button onClick={() => setExpanded((value) => !value)} className="rounded-md border border-slate-600 px-2 py-1 text-xs">{expanded ? "Close" : "Add details"}</button></td><td className="rounded-r-lg bg-slate-950 p-2">{editable && <button onClick={onRemove} className="text-xs text-rose-300 underline">Remove</button>}</td></tr>{expanded && <tr><td colSpan={7} className="p-2"><div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 md:grid-cols-3">{renderInput("lane", "Lane")}{renderInput("under21", "Under 21? Yes/No")}{renderInput("sanctionNumber", "Sanction number")}{renderInput("games", "Games")}{renderInput("bestAverage", "Best average")}{renderInput("shirtSize", "Shirt size")}{renderInput("hotelConfirmation", "Hotel confirmation")}{renderInput("hotelCheckIn", "Hotel check-in")}{renderInput("hotelCheckOut", "Hotel check-out")}{renderInput("roomType", "Room type")}{renderInput("roommateName", "Roommate name")}<select aria-label={`Special request category for row ${index + 1}`} value={row.specialRequestCategory ?? ""} disabled={!editable} onChange={(event) => onChange(index, "specialRequestCategory", event.target.value)} className={input}><option value="">No special request</option><option value="rooming">Rooming</option><option value="accessibility">Accessibility accommodation</option><option value="hotel_timing">Hotel timing</option><option value="ticket_or_guest">Event ticket or guest</option><option value="bowling_schedule_or_lane">Bowling schedule or lane</option><option value="other">Other</option></select><select aria-label={`Special request status for row ${index + 1}`} value={row.specialRequestStatus ?? "new"} disabled={!editable} onChange={(event) => onChange(index, "specialRequestStatus", event.target.value)} className={input}><option value="new">Request: new</option><option value="reviewing">Request: reviewing</option><option value="resolved">Request: resolved</option><option value="needs_coordinator_follow_up">Request: needs follow-up</option></select><textarea aria-label={`Special request note for row ${index + 1}`} value={row.specialRequestNote ?? ""} disabled={!editable} onChange={(event) => onChange(index, "specialRequestNote", event.target.value)} className={`${input} min-h-20 md:col-span-3`} placeholder="Optional request note — do not include detailed medical information." /></div></td></tr>}</>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-900 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-cyan-100">{value ?? 0}</p></div>;
}
