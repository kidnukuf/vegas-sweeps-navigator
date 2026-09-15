import { useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, Database, Handshake, Headphones, QrCode, ShieldCheck, UsersRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AppFooter from "@/components/AppFooter";

const workflow = [
  { icon: ClipboardList, step: "01", title: "Start with the roster you already have", body: "Import coordinator files or enter the minimum information needed to begin building a workable event roster. The Event Director reviews what was received before finalizing the event." },
  { icon: UsersRound, step: "02", title: "Keep responsibilities visible", body: "Coordinators provide roster information, Event Directors audit and complete operational details, and the owner workspace provides broader oversight when needed." },
  { icon: QrCode, step: "03", title: "Give guests a clear event path", body: "Claim codes, digital passes, guest records, and online or offline check-in tools help move attendees from roster to event entry without requiring every task to live in one spreadsheet." },
  { icon: ShieldCheck, step: "04", title: "Plan for real-world event nights", body: "The current production includes station-scoped QR validation, offline scanner support, paper-ticket and admission-pass fallbacks, and reconciliation tools for interrupted operations." },
];

const fit = [
  "Multi-center or multi-league bowling events",
  "Events where coordinators send roster data in different formats",
  "Teams that need clear claim-code and guest-pass instructions",
  "Operations that need online tools plus an offline contingency",
];

export default function EventDirectorProspect() {
  const [form, setForm] = useState({ name: "", company: "", contact: "", league: "", referral: "", message: "" });
  const [sent, setSent] = useState(false);
  const submit = trpc.adInquiry.submit.useMutation({ onSuccess: () => setSent(true) });
  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submitInterest = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.contact.trim() || !form.message.trim()) return;
    const referralLine = form.referral.trim() ? `\nReferral or introduction: ${form.referral.trim()}` : "";
    const leagueLine = form.league.trim() ? `\nLeague or event context: ${form.league.trim()}` : "";
    submit.mutate({
      eventId: 0,
      name: form.name.trim(),
      company: form.company.trim() || undefined,
      contact: form.contact.trim(),
      message: `${form.message.trim()}${leagueLine}${referralLine}`,
    });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#060912] text-white">
      <header className="border-b border-cyan-200/10 bg-[#080d19]/90 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a href="/" className="text-lg font-black tracking-tight text-white">Bowl <span className="text-cyan-300">Vegas</span></a>
          <a href="#conversation" className="rounded-full border border-amber-300/40 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-300/10">Start a conversation</a>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden px-5 pb-20 pt-16 sm:px-8 sm:pt-24">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_10%,rgba(34,211,238,.18),transparent_33%),radial-gradient(circle_at_14%_20%,rgba(168,85,247,.18),transparent_35%),linear-gradient(180deg,#10152a,#060912_80%)]" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_.85fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[.25em] text-cyan-200">A practical event-operations workspace</p>
              <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">Turn a complicated bowling event into a clearer handoff from roster to check-in.</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Bowl Vegas helps organize the moving pieces around large bowling events: roster intake, coordinator collaboration, claim-code distribution, attendee passes, guest details, and check-in operations.</p>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">It is not a replacement for an Event Director’s judgment, a coordinator’s communication, or a venue’s operating procedures. It is a shared workspace designed to make those responsibilities easier to see and manage.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#conversation" className="inline-flex items-center gap-2 rounded-xl bg-amber-300 px-5 py-3 font-black text-slate-950 transition hover:bg-amber-200">Explore a fit for your event <ArrowRight className="h-4 w-4" /></a>
                <a href="#referrals" className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/30 px-5 py-3 font-bold text-cyan-100 transition hover:bg-cyan-200/10">Become a Bowl Vegas ambassador</a>
              </div>
            </div>
            <div className="rounded-3xl border border-cyan-200/20 bg-white/[.045] p-5 shadow-2xl shadow-cyan-950/30">
              <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">What the workspace brings together</p>
              <div className="mt-5 grid gap-3">
                {[{ icon: Database, label: "Roster and event data", note: "A reviewable source for the information your team is coordinating." }, { icon: UsersRound, label: "Role-based handoffs", note: "Coordinator, Event Director, owner, captain, and bowler responsibilities stay distinct." }, { icon: QrCode, label: "Passes and check-in", note: "Online validation with an offline scanner and paper fallback for event-night resilience." }, { icon: Headphones, label: "Operational communication", note: "Keep questions moving through the event’s communication hierarchy." }].map(({ icon: Icon, label, note }) => <div key={label} className="flex gap-3 rounded-2xl border border-white/10 bg-black/20 p-4"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><div><p className="font-bold text-white">{label}</p><p className="mt-1 text-sm leading-5 text-slate-400">{note}</p></div></div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[.025] px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-6xl"><div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[.22em] text-amber-200">How the workflow feels different</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">One event view, with the work still assigned to the right people.</h2><p className="mt-4 leading-7 text-slate-400">Bowl Vegas is designed around practical handoffs rather than a promise that software can remove every challenge. The point is to make the next action easier to find, review, and complete.</p></div><div className="mt-10 grid gap-4 md:grid-cols-2">{workflow.map(({ icon: Icon, step, title, body }) => <article key={step} className="rounded-2xl border border-white/10 bg-[#0b1220] p-5"><div className="flex items-center justify-between"><Icon className="h-6 w-6 text-cyan-300" /><span className="font-mono text-xs text-slate-500">{step}</span></div><h3 className="mt-5 text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></article>)}</div></div>
        </section>

        <section className="px-5 py-16 sm:px-8"><div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">A reasonable starting point</p><h2 className="mt-3 text-3xl font-black">Where Bowl Vegas may fit.</h2><p className="mt-4 leading-7 text-slate-400">A fit depends on your event structure, data readiness, staffing, and venue procedures. A conversation lets us identify what the current production can support and what would still need a manual process.</p><div className="mt-6 grid gap-3">{fit.map((item) => <div key={item} className="flex items-start gap-3 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{item}</div>)}</div></div><div id="referrals" className="rounded-3xl border border-amber-200/20 bg-gradient-to-br from-amber-200/[.1] to-cyan-200/[.05] p-6"><div className="flex items-center gap-3"><Handshake className="h-6 w-6 text-amber-200" /><h2 className="text-2xl font-black">Help build the Bowl Vegas community.</h2></div><p className="mt-4 leading-7 text-slate-300">If you know a league or coordinator who is evaluating event-management support, introduce us. A referral may qualify for a bonus only when Bowl Vegas accepts and records the referral and the introduction results in a completed event contract.</p><p className="mt-3 text-sm leading-6 text-slate-400">Any bonus amount, eligibility, approval, timing, tax responsibility, and payment method are confirmed in written program terms before a referral is treated as eligible. There is no automatic payout or guaranteed amount from submitting this form.</p><a href="#conversation" className="mt-6 inline-flex items-center gap-2 font-bold text-amber-200 underline underline-offset-4">Introduce a potential event partner <ArrowRight className="h-4 w-4" /></a></div></div></section>

        <section id="conversation" className="border-t border-white/10 bg-[#080d19] px-5 py-16 sm:px-8"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.8fr_1.2fr]"><div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-200">Start with a conversation</p><h2 className="mt-3 text-3xl font-black">Let’s see whether the current production fits your event.</h2><p className="mt-4 leading-7 text-slate-400">This sends a reviewable inquiry to the Bowl Vegas team. It does not create a contract, authorize a payout, or guarantee a product feature. We will use the information to understand your event and discuss next steps.</p></div>{sent ? <div className="rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-7"><CheckCircle2 className="h-8 w-8 text-emerald-300" /><h3 className="mt-4 text-xl font-black">Thanks — your introduction is recorded.</h3><p className="mt-2 leading-7 text-slate-300">A Bowl Vegas representative can review the details and follow up through the contact route you provided.</p></div> : <form onSubmit={submitInterest} className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.035] p-6 sm:grid-cols-2"><div><Label className="text-slate-300">Your name</Label><Input required value={form.name} onChange={update("name")} className="mt-1 border-white/10 bg-slate-950 text-white" /></div><div><Label className="text-slate-300">League, company, or center</Label><Input value={form.company} onChange={update("company")} className="mt-1 border-white/10 bg-slate-950 text-white" /></div><div><Label className="text-slate-300">Phone or email</Label><Input required value={form.contact} onChange={update("contact")} className="mt-1 border-white/10 bg-slate-950 text-white" /></div><div><Label className="text-slate-300">Event or league context</Label><Input value={form.league} onChange={update("league")} className="mt-1 border-white/10 bg-slate-950 text-white" /></div><div className="sm:col-span-2"><Label className="text-slate-300">Who are you referring? <span className="text-slate-500">(optional)</span></Label><Input value={form.referral} onChange={update("referral")} placeholder="Coordinator, league, or organization and the best public contact route" className="mt-1 border-white/10 bg-slate-950 text-white placeholder:text-slate-600" /></div><div className="sm:col-span-2"><Label className="text-slate-300">How can Bowl Vegas help?</Label><textarea required rows={4} value={form.message} onChange={update("message")} placeholder="Tell us what you are coordinating or who you would like to introduce." className="mt-1 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300" /></div><div className="sm:col-span-2"><Button type="submit" disabled={submit.isPending} className="w-full bg-amber-300 font-black text-slate-950 hover:bg-amber-200">{submit.isPending ? "Sending…" : "Start the conversation"}</Button>{submit.error && <p className="mt-2 text-sm text-rose-200">{submit.error.message}</p>}</div></form>}</div></section>
      </main>
      <AppFooter />
    </div>
  );
}
