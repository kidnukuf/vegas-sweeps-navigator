import { useState, useEffect, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
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
};

const inputCls =
  "w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2.5 text-[15px] text-white focus:outline-none focus:border-yellow-400";
const labelCls = "block text-sm font-medium text-gray-300 mb-1";

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
                Show The Orleans Hotel fee & policy card in the portals
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
