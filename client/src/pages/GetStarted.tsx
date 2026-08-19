import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Crown, QrCode, ShieldCheck, Ticket, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    number: "01",
    title: "Keep your claim code handy",
    detail: "Your printed code is your personal invitation. It activates one account and should not be shared.",
    icon: Ticket,
  },
  {
    number: "02",
    title: "Create your event profile",
    detail: "Confirm your information, choose a password, and add the contact details your event team may need.",
    icon: UsersRound,
  },
  {
    number: "03",
    title: "Use your digital event passport",
    detail: "Your portal displays your event details, 10-digit Bowler ID, and eligible banquet or pool-party QR passes.",
    icon: QrCode,
  },
];

export default function GetStarted() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#040914] text-white">
      <section className="relative isolate border-b border-cyan-300/15 bg-[radial-gradient(circle_at_16%_10%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_85%_0%,rgba(250,204,21,0.18),transparent_28%)]">
        <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 hover:text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-200/30 bg-cyan-300/10 text-cyan-200">BV</span>
            Bowl Vegas Event Passport
          </Link>
        </div>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:pb-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-200/35 bg-yellow-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-yellow-200">
              <ShieldCheck className="h-3.5 w-3.5" /> Start here after scanning your claim-code card
            </p>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">
              Your event. <span className="text-cyan-300">One simple passport.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
              Bowl Vegas keeps your event information, Bowler ID, and eligible event passes in one place. Your printed claim code is the first step to activating your personal portal.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/bowler-login?tab=signup">
                <Button size="lg" className="w-full bg-cyan-300 px-6 font-bold text-slate-950 hover:bg-cyan-200 sm:w-auto">
                  I’m a bowler <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/captain-login">
                <Button size="lg" variant="outline" className="w-full border-yellow-200/60 bg-yellow-100/5 px-6 font-bold text-yellow-100 hover:bg-yellow-200/15 hover:text-white sm:w-auto">
                  I’m a team captain <Crown className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-300">Already have an account? <Link href="/bowler-login" className="font-semibold text-cyan-300 underline underline-offset-4">Sign in here</Link>.</p>
          </div>

          <aside className="rounded-3xl border border-white/15 bg-slate-950/60 p-6 shadow-2xl shadow-cyan-950/50 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Before you begin</p>
            <div className="mt-5 space-y-4">
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" /><p className="text-sm leading-6 text-slate-200">Enter the claim code printed next to your name during account creation.</p></div>
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" /><p className="text-sm leading-6 text-slate-200">Use your legal name so the app can match your event roster correctly.</p></div>
              <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" /><p className="text-sm leading-6 text-slate-200">Plan to arrive <strong className="text-white">30 minutes early</strong>; check-in and event lines can be busy.</p></div>
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-300">What happens next</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Three steps from claim card to event-ready.</h2>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {steps.map(({ number, title, detail, icon: Icon }) => (
            <article key={number} className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-lg shadow-black/15">
              <div className="flex items-center justify-between"><span className="font-mono text-sm font-bold text-yellow-300">{number}</span><Icon className="h-5 w-5 text-cyan-300" /></div>
              <h3 className="mt-9 text-xl font-bold">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-yellow-200/15 bg-yellow-300/5">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">For bowlers</p>
            <h2 className="mt-3 text-2xl font-black">Your personal event details stay with you.</h2>
            <p className="mt-3 leading-7 text-slate-300">After you activate your profile, the Bowler Portal keeps your lane assignment, event information, shirt details, and eligible event passes ready to show when needed.</p>
          </div>
          <div className="border-t border-yellow-200/15 pt-8 md:border-l md:border-t-0 md:pl-8 md:pt-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-yellow-300">For team captains</p>
            <h2 className="mt-3 text-2xl font-black">You are the team’s primary point of contact.</h2>
            <p className="mt-3 leading-7 text-slate-300">Captains can access their own event profile and help verify team information. Your Event Director will rely on you to help communicate event updates to your teammates.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 text-center sm:px-8">
        <h2 className="text-3xl font-black">Ready to activate your passport?</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-300">Have your printed claim code nearby, then select the option that matches your role.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/bowler-login?tab=signup"><Button className="bg-yellow-300 font-bold text-slate-950 hover:bg-yellow-200">Create my bowler account</Button></Link>
          <Link href="/captain-login"><Button variant="outline" className="border-cyan-300/50 text-cyan-200 hover:bg-cyan-300/10 hover:text-cyan-100">Team captain sign-in</Button></Link>
        </div>
      </section>
    </main>
  );
}
