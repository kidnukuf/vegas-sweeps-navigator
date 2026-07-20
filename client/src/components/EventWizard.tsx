import { useState, useEffect, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Check, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Create / Edit Event Wizard (Section 1).
 *
 * Walks the Event Director through the questions that customize each bowler &
 * captain portal. In "create" mode it first creates the event, then saves the
 * settings; in "edit" mode it loads existing settings and updates them.
 *
 * Conditional questions:
 *  - T-shirt pickup location/time only appear when tshirtsProvided is on.
 *  - Pool party time only appears when poolPartyEnabled is on.
 */

export interface EventWizardProps {
  mode: "create" | "edit";
  eventId?: number; // required in edit mode (and used after create)
  onClose: () => void;
  onSaved: (eventId: number) => void;
}

interface WizardState {
  eventName: string;
  eventYear: string;
  hotelCheckinDay: string;
  hotelCheckinTime: string;
  registrationDay: string;
  registrationTime: string;
  tshirtsProvided: boolean;
  tshirtPickupLocation: string;
  tshirtPickupTime: string;
  poolPartyEnabled: boolean;
  poolPartyTime: string;
  banquetDay: string;
  banquetTime: string;
  banquetLocation: string;
  hotelCheckoutDay: string;
  hotelCheckoutTime: string;
  surveyEnabled: boolean;
  showHotelInfoCard: boolean;
  sheetSpreadsheetId: string;
  sheetTabName: string;
  sheetTabNickname: string;
}

const EMPTY: WizardState = {
  eventName: "",
  eventYear: String(new Date().getFullYear()),
  hotelCheckinDay: "",
  hotelCheckinTime: "",
  registrationDay: "",
  registrationTime: "",
  tshirtsProvided: false,
  tshirtPickupLocation: "",
  tshirtPickupTime: "",
  poolPartyEnabled: false,
  poolPartyTime: "",
  banquetDay: "",
  banquetTime: "",
  banquetLocation: "",
  hotelCheckoutDay: "",
  hotelCheckoutTime: "",
  surveyEnabled: false,
  showHotelInfoCard: true,
  // Pre-fill the permanent Google Sheet ID — the same sheet is used for all events;
  // only the tab name changes per event.
  sheetSpreadsheetId: "1ka-FknfQyi8gATtszurGUoOiBstSBYtxE4HqV-inqxM",
  sheetTabName: "",
  sheetTabNickname: "",
};

const inputCls =
  "w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2.5 text-[15px] text-white focus:outline-none focus:border-yellow-400";
const labelCls = "block text-sm font-medium text-gray-300 mb-1";

// ─── Google Credentials Panel ────────────────────────────────────────────────
function GoogleCredsPanel() {
  const [jsonText, setJsonText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [testSheetId, setTestSheetId] = useState("");

  const statusQ = trpc.googleCreds.status.useQuery(undefined, { refetchOnWindowFocus: false });
  const saveMut = trpc.googleCreds.save.useMutation({
    onSuccess: (d) => {
      toast.success(`Credentials saved! Service account: ${d.clientEmail ?? "unknown"}`);
      setJsonText("");
      setShowPaste(false);
      statusQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.googleCreds.delete.useMutation({
    onSuccess: () => { toast.success("Credentials removed"); statusQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const testMut = trpc.googleCreds.test.useMutation({
    onSuccess: (d) => toast.success(`✅ Connection OK — sheet: "${d.title}"`),
    onError: (e) => toast.error(`❌ ${e.message}`),
  });

  const status = statusQ.data;
  const busy = saveMut.isPending || deleteMut.isPending || testMut.isPending;

  return (
    <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-yellow-300 text-sm">🔑 Google Service Account Credentials</p>
        {statusQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {status?.saved ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-green-500/40 bg-green-500/5 p-3">
            <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="text-green-400 font-medium">Credentials saved</p>
              {status.clientEmail && (
                <p className="text-gray-300 text-xs mt-0.5 break-all">Service account: <span className="text-white">{status.clientEmail}</span></p>
              )}
              <p className="text-gray-500 text-xs mt-1">Make sure your Google Sheet is shared with this email (Editor access).</p>
            </div>
          </div>

          {/* Test connection */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-400">Test connection (paste a sheet URL or ID):</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-400"
                value={testSheetId}
                onChange={(e) => setTestSheetId(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
              <button
                onClick={() => testMut.mutate({ spreadsheetId: testSheetId })}
                disabled={!testSheetId.trim() || busy}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
              >
                {testMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test"}
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowPaste((p) => !p)}
              className="text-xs text-yellow-400 hover:text-yellow-300 underline"
            >
              Replace credentials
            </button>
            <span className="text-gray-600">·</span>
            <button
              onClick={() => { if (confirm("Remove saved credentials?")) deleteMut.mutate(); }}
              disabled={busy}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3">
          <AlertCircle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="text-orange-300 font-medium">No credentials saved yet</p>
            <p className="text-gray-400 text-xs mt-0.5">Google Sheet write-back will not work until credentials are added.</p>
          </div>
        </div>
      )}

      {/* Paste area (shown when not saved, or when replacing) */}
      {(!status?.saved || showPaste) && (
        <div className="space-y-2 pt-1">
          <div className="rounded border border-white/10 bg-black/30 p-3 text-xs text-gray-400 space-y-1">
            <p className="text-white font-medium text-xs">How to get your service account JSON:</p>
            <p>1. Go to <span className="text-yellow-300">console.cloud.google.com</span> → IAM &amp; Admin → Service Accounts</p>
            <p>2. Create a service account (any name), then click it → Keys → Add Key → JSON → Create</p>
            <p>3. A JSON file downloads automatically — open it, select all, copy everything</p>
            <p>4. Paste it in the box below and click Save</p>
            <p>5. Share your Google Sheet with the service account email (Editor access)</p>
          </div>
          <textarea
            className="w-full h-28 bg-black/60 border border-white/20 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-yellow-400 resize-none"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={'Paste the entire contents of the downloaded JSON key file here...\n{\n  "type": "service_account",\n  "project_id": "...",\n  ...'}
          />
          <button
            onClick={() => saveMut.mutate({ json: jsonText })}
            disabled={!jsonText.trim() || busy}
            className="w-full rounded-lg bg-yellow-500 py-2 text-sm font-bold text-black hover:bg-yellow-400 disabled:opacity-40 transition-colors"
          >
            {saveMut.isPending ? "Saving..." : "Save Credentials"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sheet Tab Picker ───────────────────────────────────────────────────────────────────────────────
interface SheetTabPickerProps {
  spreadsheetId: string;
  selectedTab: string;
  nickname: string;
  onTabChange: (tab: string) => void;
  onNicknameChange: (nick: string) => void;
}

function SheetTabPicker({ spreadsheetId, selectedTab, nickname, onTabChange, onNicknameChange }: SheetTabPickerProps) {
  // Extract bare spreadsheet ID from a full URL if needed
  const bareId = spreadsheetId.includes('/d/')
    ? (spreadsheetId.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? spreadsheetId)
    : spreadsheetId.trim();

  const tabsQuery = trpc.event.getSheetTabs.useQuery(
    { spreadsheetId: bareId },
    { enabled: bareId.length > 10, staleTime: 30_000 }
  );

  const tabs = tabsQuery.data?.tabs ?? [];
  const loading = tabsQuery.isFetching;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls}>Sheet Tab</label>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          {!loading && tabs.length > 0 && (
            <button
              type="button"
              onClick={() => tabsQuery.refetch()}
              className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>

        {tabs.length > 0 ? (
          <select
            className={inputCls + " cursor-pointer"}
            value={selectedTab}
            onChange={(e) => onTabChange(e.target.value)}
          >
            <option value="">— Select a tab —</option>
            {tabs.map((tab) => (
              <option key={tab} value={tab}>{tab}</option>
            ))}
          </select>
        ) : (
          <input
            className={inputCls}
            value={selectedTab}
            onChange={(e) => onTabChange(e.target.value)}
            placeholder={bareId.length > 10 && !loading ? "Could not load tabs — type name manually" : "Enter spreadsheet ID above to load tabs"}
          />
        )}

        {selectedTab && (
          <p className="mt-1 text-xs text-gray-400">
            Selected: <span className="text-white font-medium">{selectedTab}</span>
            {nickname && <span className="text-yellow-400 ml-1">({nickname})</span>}
          </p>
        )}
        {!selectedTab && <p className="mt-1 text-xs text-gray-400">Leave blank to use the first tab. Tab names are case-sensitive.</p>}
      </div>

      <div>
        <label className={labelCls}>Tab Nickname <span className="text-gray-500 font-normal">(optional)</span></label>
        <input
          className={inputCls}
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value)}
          placeholder={selectedTab ? `e.g. "${selectedTab} — Funtime 1"` : "e.g. Summer 2025 Funtime"}
        />
        <p className="mt-1 text-xs text-gray-400">A friendly label shown alongside the tab name in the ED portal so you can tell events apart at a glance.</p>
      </div>
    </div>
  );
}

export function EventWizard({ mode, eventId, onClose, onSaved }: EventWizardProps) {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<WizardState>(EMPTY);
  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) => setS((p) => ({ ...p, [k]: v }));

  const settingsQuery = trpc.event.getSettings.useQuery(
    { id: eventId ?? 0 },
    { enabled: mode === "edit" && !!eventId }
  );

  useEffect(() => {
    if (mode === "edit" && settingsQuery.data) {
      const d = settingsQuery.data as Record<string, unknown>;
      setS({
        eventName: String(d.eventName ?? ""),
        eventYear: String(d.eventYear ?? new Date().getFullYear()),
        hotelCheckinDay: String(d.hotelCheckinDay ?? ""),
        hotelCheckinTime: String(d.hotelCheckinTime ?? ""),
        registrationDay: String(d.registrationDay ?? ""),
        registrationTime: String(d.registrationTime ?? ""),
        tshirtsProvided: !!d.tshirtsProvided,
        tshirtPickupLocation: String(d.tshirtPickupLocation ?? ""),
        tshirtPickupTime: String(d.tshirtPickupTime ?? ""),
        poolPartyEnabled: !!d.poolPartyEnabled,
        poolPartyTime: String(d.poolPartyTime ?? ""),
        banquetDay: String(d.banquetDay ?? ""),
        banquetTime: String(d.banquetTime ?? ""),
        banquetLocation: String(d.banquetLocation ?? ""),
        hotelCheckoutDay: String(d.hotelCheckoutDay ?? ""),
        hotelCheckoutTime: String(d.hotelCheckoutTime ?? ""),
        surveyEnabled: !!d.surveyEnabled,
        showHotelInfoCard: d.showHotelInfoCard === undefined ? true : !!d.showHotelInfoCard,
        sheetSpreadsheetId: String(d.sheetSpreadsheetId ?? ""),
        sheetTabName: String(d.sheetTabName ?? ""),
        sheetTabNickname: String(d.sheetTabNickname ?? ""),
      });
    }
  }, [mode, settingsQuery.data]);

  const createMut = trpc.event.create.useMutation();
  const updateMut = trpc.event.updateSettings.useMutation();

  const saving = createMut.isPending || updateMut.isPending;

  const settingsPayload = useMemo(
    () => ({
      eventName: s.eventName.trim(),
      eventYear: parseInt(s.eventYear, 10),
      hotelCheckinDay: s.hotelCheckinDay || null,
      hotelCheckinTime: s.hotelCheckinTime || null,
      registrationDay: s.registrationDay || null,
      registrationTime: s.registrationTime || null,
      tshirtsProvided: s.tshirtsProvided,
      tshirtPickupLocation: s.tshirtPickupLocation || null,
      tshirtPickupTime: s.tshirtPickupTime || null,
      poolPartyEnabled: s.poolPartyEnabled,
      poolPartyTime: s.poolPartyTime || null,
      banquetDay: s.banquetDay || null,
      banquetTime: s.banquetTime || null,
      banquetLocation: s.banquetLocation || null,
      hotelCheckoutDay: s.hotelCheckoutDay || null,
      hotelCheckoutTime: s.hotelCheckoutTime || null,
      surveyEnabled: s.surveyEnabled,
      showHotelInfoCard: s.showHotelInfoCard,
      sheetSpreadsheetId: s.sheetSpreadsheetId.trim() || null,
      sheetTabName: s.sheetTabName.trim() || null,
      sheetTabNickname: s.sheetTabNickname.trim() || null,
    }),
    [s]
  );

  async function handleSave() {
    const name = s.eventName.trim();
    const year = parseInt(s.eventYear, 10);
    if (!name) { toast.error("Event name is required"); setStep(0); return; }
    if (!Number.isFinite(year)) { toast.error("Valid year is required"); setStep(0); return; }

    try {
      let targetId = eventId;
      if (mode === "create") {
        const res = await createMut.mutateAsync({ eventName: name, eventYear: year });
        targetId = res.id;
      }
      if (!targetId) { toast.error("Could not determine event id"); return; }
      await updateMut.mutateAsync({ id: targetId, ...settingsPayload });
      toast.success(mode === "create" ? "Event created" : "Event settings saved");
      onSaved(targetId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  // Build dynamic step list (conditional follow-ups handled within step bodies)
  const steps = [
    { key: "basics", title: "Event Basics" },
    { key: "checkin", title: "Hotel Check-In" },
    { key: "registration", title: "Bowling Registration" },
    { key: "tshirts", title: "T-Shirts" },
    { key: "pool", title: "Pool Party" },
    { key: "banquet", title: "Banquet Dinner" },
    { key: "checkout", title: "Hotel Check-Out" },
    { key: "survey", title: "Post-Event Survey" },
    { key: "sheet", title: "Google Sheet" },
    { key: "review", title: "Review & Save" },
  ];
  const last = steps.length - 1;

  const placardSteps = useMemo(() => {
    const items: { label: string; detail: string }[] = [];
    if (s.hotelCheckinDay || s.hotelCheckinTime)
      items.push({ label: "Hotel Check-In", detail: [s.hotelCheckinDay, s.hotelCheckinTime].filter(Boolean).join(" · ") });
    if (s.registrationDay || s.registrationTime)
      items.push({ label: "Reg — Bowling Registration", detail: [s.registrationDay, s.registrationTime].filter(Boolean).join(" · ") });
    if (s.tshirtsProvided)
      items.push({ label: "T-Shirt Pickup", detail: [s.tshirtPickupLocation, s.tshirtPickupTime].filter(Boolean).join(" · ") || "See captain" });
    if (s.poolPartyEnabled)
      items.push({ label: "Pool Party", detail: s.poolPartyTime ? `Check-in ${s.poolPartyTime}` : "Time TBA" });
    if (s.banquetDay || s.banquetTime || s.banquetLocation)
      items.push({ label: "Banquet Dinner", detail: [s.banquetDay, s.banquetTime, s.banquetLocation].filter(Boolean).join(" · ") });
    if (s.hotelCheckoutDay || s.hotelCheckoutTime)
      items.push({ label: "Hotel Check-Out", detail: [s.hotelCheckoutDay, s.hotelCheckoutTime].filter(Boolean).join(" · ") });
    return items;
  }, [s]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-yellow-500/30 bg-[#161616]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + progress */}
        <div className="border-b border-white/10 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-yellow-400">
              {mode === "create" ? "Create New Event" : "Edit Event Settings"}
            </h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            {steps.map((st, i) => (
              <div
                key={st.key}
                className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-yellow-400" : "bg-white/15"}`}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Step {step + 1} of {steps.length}: <span className="text-gray-200">{steps[step].title}</span>
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {steps[step].key === "basics" && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Event Name</label>
                <input className={inputCls} value={s.eventName} onChange={(e) => set("eventName", e.target.value)} placeholder="e.g. Funtime Team Challenge" />
              </div>
              <div>
                <label className={labelCls}>Year</label>
                <input type="number" className={inputCls} value={s.eventYear} onChange={(e) => set("eventYear", e.target.value)} />
              </div>
            </div>
          )}

          {steps[step].key === "checkin" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">When can guests check into the hotel? This drives the first stop on the Lane to Banquet trip planner.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Day</label>
                  <input className={inputCls} value={s.hotelCheckinDay} onChange={(e) => set("hotelCheckinDay", e.target.value)} placeholder="e.g. Thursday, Feb 12" />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <input className={inputCls} value={s.hotelCheckinTime} onChange={(e) => set("hotelCheckinTime", e.target.value)} placeholder="e.g. 4:00 PM" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={s.showHotelInfoCard} onChange={(e) => set("showHotelInfoCard", e.target.checked)} className="h-4 w-4 accent-yellow-400" />
                Show The Orleans Hotel fee &amp; policy card in the portals
              </label>
            </div>
          )}

          {steps[step].key === "registration" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">When does bowling registration open?</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Day</label>
                  <input className={inputCls} value={s.registrationDay} onChange={(e) => set("registrationDay", e.target.value)} placeholder="e.g. Friday, Feb 13" />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <input className={inputCls} value={s.registrationTime} onChange={(e) => set("registrationTime", e.target.value)} placeholder="e.g. 9:00 AM" />
                </div>
              </div>
            </div>
          )}

          {steps[step].key === "tshirts" && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
                <input type="checkbox" checked={s.tshirtsProvided} onChange={(e) => set("tshirtsProvided", e.target.checked)} className="h-5 w-5 accent-yellow-400" />
                <span className="text-[15px] font-medium text-white">Do bowlers receive T-shirts at this event?</span>
              </label>
              {s.tshirtsProvided && (
                <div className="space-y-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <p className="text-sm text-gray-300">Captains pick up their team's shirts. Tell them where and when.</p>
                  <div>
                    <label className={labelCls}>Pickup Location</label>
                    <input className={inputCls} value={s.tshirtPickupLocation} onChange={(e) => set("tshirtPickupLocation", e.target.value)} placeholder="e.g. Registration Desk, Mardi Gras Ballroom" />
                  </div>
                  <div>
                    <label className={labelCls}>Pickup Time</label>
                    <input className={inputCls} value={s.tshirtPickupTime} onChange={(e) => set("tshirtPickupTime", e.target.value)} placeholder="e.g. Friday 9:00 AM – 12:00 PM" />
                  </div>
                </div>
              )}
            </div>
          )}

          {steps[step].key === "pool" && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
                <input type="checkbox" checked={s.poolPartyEnabled} onChange={(e) => set("poolPartyEnabled", e.target.checked)} className="h-5 w-5 accent-yellow-400" />
                <span className="text-[15px] font-medium text-white">Is there a pool party for this event?</span>
              </label>
              {s.poolPartyEnabled && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <label className={labelCls}>Pool Party Check-In Time</label>
                  <input className={inputCls} value={s.poolPartyTime} onChange={(e) => set("poolPartyTime", e.target.value)} placeholder="e.g. 7:00 PM" />
                  <p className="mt-2 text-xs text-gray-400">If off, all pool party passports and steps are hidden for this event.</p>
                </div>
              )}
            </div>
          )}

          {steps[step].key === "banquet" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">Banquet details apply to every bowler in this event.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Day</label>
                  <input className={inputCls} value={s.banquetDay} onChange={(e) => set("banquetDay", e.target.value)} placeholder="e.g. Saturday, Feb 14" />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <input className={inputCls} value={s.banquetTime} onChange={(e) => set("banquetTime", e.target.value)} placeholder="e.g. 6:00 PM" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Location</label>
                <input className={inputCls} value={s.banquetLocation} onChange={(e) => set("banquetLocation", e.target.value)} placeholder="e.g. Mardi Gras Ballroom" />
              </div>
            </div>
          )}

          {steps[step].key === "checkout" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">When must guests check out? This is also when the survey invitation goes out (if enabled).</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Day</label>
                  <input className={inputCls} value={s.hotelCheckoutDay} onChange={(e) => set("hotelCheckoutDay", e.target.value)} placeholder="e.g. Sunday, Feb 15" />
                </div>
                <div>
                  <label className={labelCls}>Time</label>
                  <input className={inputCls} value={s.hotelCheckoutTime} onChange={(e) => set("hotelCheckoutTime", e.target.value)} placeholder="e.g. 11:00 AM" />
                </div>
              </div>
            </div>
          )}

          {steps[step].key === "survey" && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-3">
                <input type="checkbox" checked={s.surveyEnabled} onChange={(e) => set("surveyEnabled", e.target.checked)} className="h-5 w-5 accent-yellow-400" />
                <span className="text-[15px] font-medium text-white">Ask bowlers to complete a post-event survey?</span>
              </label>
              <p className="text-sm text-gray-400">
                When on, bowlers receive a survey invitation at hotel check-out time. The survey unlocks in their portal after the banquet concludes.
              </p>
            </div>
          )}

          {steps[step].key === "sheet" && (
            <div className="space-y-5">
              {/* ── In-app Google Credentials (no Manus Secrets needed) ── */}
              <GoogleCredsPanel />

              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-gray-300 space-y-2">
                <p className="font-semibold text-white">📊 Google Sheet — Import &amp; Write-Back</p>
                <p>The app reads bowler data from a Google Sheet and writes Bowler IDs, QR codes, and scan timestamps back automatically. Each event tracks its own sheet — the link is saved the moment you import from a Google Sheets URL.</p>
              </div>

              {/* Auto-link status */}
              {s.sheetSpreadsheetId ? (
                <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-3 text-sm">
                  <p className="font-semibold text-green-400">✅ Sheet linked for this event</p>
                  <p className="text-gray-300 text-xs mt-1 break-all">{s.sheetSpreadsheetId}</p>
                  {s.sheetTabName && (
                    <p className="text-gray-400 text-xs">
                      Tab: <span className="text-white">{s.sheetTabName}</span>
                      {s.sheetTabNickname && <span className="text-yellow-400 ml-1">— {s.sheetTabNickname}</span>}
                    </p>
                  )}
                  <p className="text-gray-500 text-xs mt-2">Set automatically when you import from a Google Sheets URL. Override below if needed.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-600/40 bg-gray-800/30 p-3 text-sm">
                  <p className="text-gray-400">⚠️ No sheet linked yet. Import bowler data from a Google Sheets URL to link automatically, or enter details manually below.</p>
                </div>
              )}

              <div>
                <label className={labelCls}>Spreadsheet URL or ID <span className="text-gray-500 font-normal">(optional override)</span></label>
                <input
                  className={inputCls}
                  value={s.sheetSpreadsheetId}
                  onChange={(e) => set("sheetSpreadsheetId", e.target.value)}
                  placeholder="Paste full Google Sheets URL or just the spreadsheet ID"
                />
                <p className="mt-1 text-xs text-gray-400">You can paste the full URL — the app extracts the ID automatically.</p>
              </div>
              {/* ── Tab Picker ── */}
              <SheetTabPicker
                spreadsheetId={s.sheetSpreadsheetId}
                selectedTab={s.sheetTabName}
                nickname={s.sheetTabNickname}
                onTabChange={(tab) => set("sheetTabName", tab)}
                onNicknameChange={(nick) => set("sheetTabNickname", nick)}
              />
            </div>
          )}

          {steps[step].key === "review" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">Here is the Lane to Banquet trip your bowlers and captains will see:</p>
              <div className="rounded-xl border border-yellow-500/30 bg-black/40 p-4">
                {placardSteps.length === 0 ? (
                  <p className="text-sm text-gray-500">No steps filled in yet — you can add them now or later via Edit Event Settings.</p>
                ) : (
                  <ol className="space-y-2">
                    {placardSteps.map((it, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-black">{i + 1}</span>
                        <div>
                          <div className="text-[15px] font-semibold text-white">{it.label}</div>
                          {it.detail && <div className="text-sm text-gray-400">{it.detail}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="rounded-lg bg-white/5 px-4 py-3 text-sm text-gray-300">
                Survey: <span className="font-semibold text-white">{s.surveyEnabled ? "Enabled" : "Off"}</span> ·
                T-Shirts: <span className="font-semibold text-white">{s.tshirtsProvided ? "Yes" : "No"}</span> ·
                Pool Party: <span className="font-semibold text-white">{s.poolPartyEnabled ? "Yes" : "No"}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <button
            onClick={() => setStep((p) => Math.max(0, p - 1))}
            disabled={step === 0}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          {step < last ? (
            <button
              onClick={() => setStep((p) => Math.min(last, p + 1))}
              className="flex items-center gap-1 rounded-lg bg-yellow-500 px-5 py-2 text-sm font-bold text-black transition-transform hover:bg-yellow-400 active:scale-95"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 px-5 py-2 text-sm font-bold text-black transition-transform hover:bg-green-400 active:scale-95 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {saving ? "Saving..." : mode === "create" ? "Create Event" : "Save Settings"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventWizard;
