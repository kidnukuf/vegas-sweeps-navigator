import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type IncompleteGuest = {
  guestTicketId: number;
  suffix: string;
  importedGuestValue: string | null;
  bowlerId: number;
  legalFirstName: string;
  legalLastName: string;
  centerName: string | null;
  teamName: string | null;
  guestAmountPaid: string | null;
  hasPoolTicket: boolean;
  hasBanquetTicket: boolean;
};

function formatRecordedAmount(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "Not recorded";
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}

export default function IncompleteGuestInformationPanel({ eventId }: { eventId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();
  const incompleteGuests = trpc.bowlerAuth.listIncompleteGuestInformation.useQuery(
    { eventId },
    { enabled: eventId > 0 },
  );
  const completeGuest = trpc.bowlerAuth.completeGuestInformation.useMutation({
    onSuccess: async (result) => {
      toast.success(`${result.guestName} is now shown on the guest QR pass.`);
      setDrafts((current) => {
        const next = { ...current };
        delete next[result.guestTicketId];
        return next;
      });
      await Promise.all([
        incompleteGuests.refetch(),
        utils.bowlerAuth.listGuestTickets.invalidate(),
        utils.bowlerAuth.me.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const guests = (incompleteGuests.data ?? []) as IncompleteGuest[];
  if (!eventId || (incompleteGuests.isSuccess && guests.length === 0)) return null;

  return (
    <section className="border-b border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent px-4 py-3">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
          aria-expanded={isOpen}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-200/30 bg-amber-300/15 text-amber-200">
              {incompleteGuests.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
            </span>
            <span>
              <span className="block text-sm font-black text-amber-100">Guest information needed{guests.length ? ` — ${guests.length} ${guests.length === 1 ? "name" : "names"} required` : ""}</span>
              <span className="mt-0.5 block text-xs leading-5 text-amber-50/75">Imported price or count values cannot be shown as guest names. Review each linked guest before claim-code distribution.</span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200/30 bg-black/20 px-3 py-2 text-xs font-bold text-amber-100">
            {isOpen ? "Hide review" : "Review guest names"}
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
          </span>
        </button>

        {isOpen && (
          <div className="mt-4 rounded-2xl border border-amber-200/20 bg-[#15110a]/95 p-3 shadow-xl sm:p-5">
            {incompleteGuests.isLoading ? (
              <div className="flex items-center gap-3 p-5 text-sm text-amber-100"><Loader2 className="h-4 w-4 animate-spin" /> Loading guest records…</div>
            ) : incompleteGuests.isError ? (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">Guest records could not be loaded. Refresh and try again.</div>
            ) : guests.length === 0 ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm text-emerald-100"><CheckCircle2 className="h-5 w-5" /> All active guest passes have a display name.</div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <p className="text-sm text-amber-50">Enter the guest’s real name. The name is immediately used on the linked guest QR pass; no QR token is exposed here.</p>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200"><UsersRound className="h-3.5 w-3.5" /> Event Director only</span>
                </div>
                <div className="grid gap-3">
                  {guests.map((guest) => {
                    const draft = drafts[guest.guestTicketId] ?? "";
                    const isSaving = completeGuest.isPending && completeGuest.variables?.guestTicketId === guest.guestTicketId;
                    return (
                      <article key={guest.guestTicketId} className="rounded-xl border border-white/10 bg-black/25 p-3 sm:p-4">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] lg:items-end">
                          <div className="min-w-0">
                            <p className="text-base font-bold text-white">{guest.legalFirstName} {guest.legalLastName} <span className="font-mono text-xs text-amber-200">Guest {guest.suffix}</span></p>
                            <p className="mt-1 text-xs text-slate-300">{guest.centerName || "No center recorded"}{guest.teamName ? ` · ${guest.teamName}` : ""}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                              <span className="rounded-full bg-amber-300/10 px-2 py-1 text-amber-100">Imported value: {guest.importedGuestValue || "blank"}</span>
                              <span className="rounded-full bg-white/5 px-2 py-1 text-slate-300">Guest amount recorded: {formatRecordedAmount(guest.guestAmountPaid)}</span>
                              {guest.hasBanquetTicket ? <span className="rounded-full bg-purple-400/10 px-2 py-1 text-purple-200">Banquet QR</span> : null}
                              {guest.hasPoolTicket ? <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-cyan-200">Pool QR</span> : null}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <label className="sr-only" htmlFor={`guest-name-${guest.guestTicketId}`}>Guest name for {guest.legalFirstName} {guest.legalLastName}</label>
                            <input
                              id={`guest-name-${guest.guestTicketId}`}
                              value={draft}
                              onChange={(event) => setDrafts((current) => ({ ...current, [guest.guestTicketId]: event.target.value }))}
                              placeholder="Guest full name"
                              maxLength={120}
                              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={draft.trim().length < 2 || isSaving}
                              onClick={() => completeGuest.mutate({ eventId, guestTicketId: guest.guestTicketId, guestName: draft })}
                              className="shrink-0 rounded-lg bg-amber-300 px-3 py-2 text-sm font-black text-slate-950 transition-transform duration-150 hover:bg-amber-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {isSaving ? "Saving…" : "Save name"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
