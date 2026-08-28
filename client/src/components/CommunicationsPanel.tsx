import { FormEvent, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type TargetType = "bowler" | "captain" | "coordinator" | "event_director" | "owner";

type CommunicationsPanelProps = {
  eventId?: number;
  participantToken?: string | null;
  preferredTargetType?: TargetType;
  primaryActionLabel: string;
  className?: string;
};

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CommunicationsPanel({ eventId, participantToken, preferredTargetType, primaryActionLabel, className = "" }: CommunicationsPanelProps) {
  const utils = trpc.useUtils();
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const [selectedContactKey, setSelectedContactKey] = useState("");
  const [draft, setDraft] = useState("");
  const queryInput = useMemo(() => ({ eventId: eventId ?? 0, participantToken: participantToken ?? undefined }), [eventId, participantToken]);
  const contactOptions = trpc.communications.contactOptions.useQuery(queryInput, { enabled: Boolean(eventId) });
  const threads = trpc.communications.listThreads.useQuery(queryInput, { enabled: Boolean(eventId) });
  const messageInput = useMemo(() => ({ threadId: selectedThreadId ?? "00000000-0000-4000-8000-000000000000", participantToken: participantToken ?? undefined }), [participantToken, selectedThreadId]);
  const messages = trpc.communications.messages.useQuery(messageInput, { enabled: Boolean(selectedThreadId) });
  const startThread = trpc.communications.startThread.useMutation({ onSuccess: async (result) => { setSelectedThreadId(result.threadId); await utils.communications.listThreads.invalidate(); } });
  const sendMessage = trpc.communications.sendMessage.useMutation({ onSuccess: async () => { setDraft(""); await Promise.all([utils.communications.messages.invalidate(), utils.communications.listThreads.invalidate()]); } });

  const contacts = contactOptions.data ?? [];
  const preferredContact = contacts.find((contact) => contact.actorType === preferredTargetType);
  const selectedContact = contacts.find((contact) => `${contact.actorType}:${contact.actorId}` === selectedContactKey);

  useEffect(() => {
    if (!selectedContactKey && preferredContact) setSelectedContactKey(`${preferredContact.actorType}:${preferredContact.actorId}`);
  }, [preferredContact, selectedContactKey]);

  const openContact = (target?: { actorType: TargetType; actorId: string }) => {
    if (!eventId || !target) return;
    startThread.mutate({ eventId, targetActorType: target.actorType, targetActorId: target.actorId, participantToken: participantToken ?? undefined });
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedThreadId || !draft.trim()) return;
    sendMessage.mutate({ threadId: selectedThreadId, body: draft, participantToken: participantToken ?? undefined });
  };

  if (!eventId) return null;
  return <section className={`rounded-2xl border border-cyan-400/20 bg-slate-950/70 p-4 text-slate-100 ${className}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-cyan-300">In-app communications</p><h3 className="mt-1 text-lg font-bold">Messages stay inside Bowl Vegas</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">Contact details are not exposed through this inbox. Only authorized participants and role-specific oversight can view a thread.</p></div>{preferredContact && <button disabled={startThread.isPending} onClick={() => openContact(preferredContact)} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{startThread.isPending ? "Opening…" : primaryActionLabel}</button>}</div>
    {contactOptions.isLoading || threads.isLoading ? <p className="mt-4 text-sm text-slate-400">Loading approved contacts and messages…</p> : <div className="mt-4 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]"><aside className="space-y-4"><div><label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Start an approved contact</label><select className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" value={selectedContactKey} onChange={(event) => setSelectedContactKey(event.target.value)}><option value="" disabled>Select a contact</option>{contacts.map((contact) => <option key={`${contact.actorType}:${contact.actorId}`} value={`${contact.actorType}:${contact.actorId}`}>{contact.label} — {contact.subtitle}</option>)}</select><button disabled={!selectedContact || startThread.isPending} onClick={() => openContact(selectedContact)} className="mt-2 w-full rounded-lg border border-cyan-400/60 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50">Open message thread</button></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">My permitted threads</p><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{threads.data?.length ? threads.data.map((thread) => <button key={thread.id} onClick={() => setSelectedThreadId(thread.id)} className={`w-full rounded-lg border p-3 text-left text-xs ${thread.id === selectedThreadId ? "border-cyan-400 bg-cyan-500/10" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}><span className="block font-semibold text-slate-200">{label(thread.threadType)}</span><span className="mt-1 block truncate text-slate-400">{thread.lastMessage?.body ?? "No messages yet"}</span></button>) : <p className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-5 text-slate-400">No approved message threads yet.</p>}</div></div></aside><div className="rounded-xl border border-slate-800 bg-slate-900"><div className="border-b border-slate-800 p-3"><p className="text-sm font-semibold">{selectedThreadId ? "Conversation" : "Choose a thread"}</p></div>{selectedThreadId ? <><div className="max-h-72 min-h-44 space-y-3 overflow-y-auto p-4">{messages.isLoading ? <p className="text-sm text-slate-400">Loading messages…</p> : messages.data?.length ? messages.data.map((message: any) => <article key={message.id} className="rounded-lg bg-slate-950 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">{label(message.senderActorType)}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-100">{message.body}</p><p className="mt-2 text-xs text-slate-500">{new Date(message.createdAt).toLocaleString()}</p></article>) : <p className="text-sm text-slate-400">This thread is open. Send the first message when you are ready.</p>}</div><form onSubmit={send} className="border-t border-slate-800 p-3"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400" placeholder="Write an in-app message…" /><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">{draft.length}/2000</span><button disabled={!draft.trim() || sendMessage.isPending} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{sendMessage.isPending ? "Sending…" : "Send message"}</button></div></form></> : <div className="grid min-h-72 place-items-center p-6 text-center text-sm text-slate-400">Choose an existing permitted thread or open a new approved contact thread.</div>}</div></div>}
    {(contactOptions.error || threads.error || messages.error || startThread.error || sendMessage.error) && <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{contactOptions.error?.message ?? threads.error?.message ?? messages.error?.message ?? startThread.error?.message ?? sendMessage.error?.message}</p>}</section>;
}
