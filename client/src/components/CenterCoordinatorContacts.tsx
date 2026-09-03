import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const inputClass = "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-400";
const contactMethods = ["Phone", "Email", "Mobile", "Text", "Other"] as const;
type ContactMethod = (typeof contactMethods)[number];
type Draft = { coordinatorName: string; phone: string; extension: string; email: string; preferredContactMethod: ContactMethod };

const emptyDraft = (): Draft => ({ coordinatorName: "", phone: "", extension: "", email: "", preferredContactMethod: "Phone" });

export function CenterCoordinatorContacts({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const contacts = trpc.coordinator.centerContacts.list.useQuery({ eventId });
  const save = trpc.coordinator.centerContacts.save.useMutation({
    onSuccess: () => void utils.coordinator.centerContacts.list.invalidate({ eventId }),
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (!contacts.data) return;
    setDrafts((current) => {
      const next = { ...current };
      contacts.data.forEach((contact: any) => {
        const key = String(contact.centerId);
        if (!next[key]) {
          next[key] = {
            coordinatorName: contact.coordinatorName ?? "",
            phone: contact.phone ?? "",
            extension: contact.extension ?? "",
            email: contact.email ?? "",
            preferredContactMethod: contact.preferredContactMethod && contactMethods.includes(contact.preferredContactMethod as ContactMethod)
              ? contact.preferredContactMethod as ContactMethod
              : "Phone",
          };
        }
      });
      return next;
    });
  }, [contacts.data]);

  const update = (centerId: number, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [String(centerId)]: { ...(current[String(centerId)] ?? emptyDraft()), ...patch } }));
  };

  const saveContact = (centerId: number) => {
    const draft = drafts[String(centerId)] ?? emptyDraft();
    if (!draft.coordinatorName.trim()) return;
    save.mutate({ eventId, centerId, coordinatorName: draft.coordinatorName, phone: draft.phone || null, extension: draft.extension || null, email: draft.email || null, preferredContactMethod: draft.preferredContactMethod });
  };

  return (
    <section className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Center coordinator contacts</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Maintain each event center’s coordinator phone, extension, email, and preferred contact method. These details do not change coordinator credentials, roster data, or Google Sheets. A center-specific record is used first for matching recipient guidance.</p>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">{contacts.data?.length ?? 0} event centers</span>
      </div>
      {contacts.isLoading ? <p className="mt-4 text-sm text-slate-400">Loading event centers…</p> : contacts.data?.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{contacts.data.map((contact: any) => {
        const draft = drafts[String(contact.centerId)] ?? emptyDraft();
        return <article key={contact.centerId} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <h3 className="font-bold text-cyan-100">{contact.centerName}</h3>
          <div className="mt-3 grid gap-2">
            <input className={inputClass} value={draft.coordinatorName} onChange={(event) => update(contact.centerId, { coordinatorName: event.target.value })} placeholder="Coordinator name" />
            <div className="grid gap-2 sm:grid-cols-[1fr_.55fr]"><input className={inputClass} value={draft.phone} onChange={(event) => update(contact.centerId, { phone: event.target.value })} placeholder="Center phone" /><input className={inputClass} value={draft.extension} onChange={(event) => update(contact.centerId, { extension: event.target.value })} placeholder="Extension" /></div>
            <input className={inputClass} type="email" value={draft.email} onChange={(event) => update(contact.centerId, { email: event.target.value })} placeholder="Coordinator email" />
            <select className={inputClass} value={draft.preferredContactMethod} onChange={(event) => update(contact.centerId, { preferredContactMethod: event.target.value as ContactMethod })}>{contactMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select>
            <button disabled={save.isPending || !draft.coordinatorName.trim()} onClick={() => saveContact(contact.centerId)} className="rounded-lg border border-cyan-400/60 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50">{save.isPending ? "Saving…" : "Save center contact"}</button>
          </div>
        </article>;
      })}</div> : <p className="mt-4 text-sm text-slate-400">No event centers are available yet. Issue a center-scoped coordinator invitation or import an event roster first.</p>}
      {save.error && <p className="mt-3 text-sm text-rose-300">{save.error.message}</p>}
    </section>
  );
}
