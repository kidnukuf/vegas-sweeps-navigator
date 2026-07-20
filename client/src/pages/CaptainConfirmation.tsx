/**
 * CaptainConfirmation.tsx
 * Post-sign-up confirmation flow for Team Captains:
 *   Step 1 — Show 10-digit ID + collect phone & email
 *   Step 2 — Animated color burst splash "Bowlers Orleans Bound"
 *   Step 3 — Captain responsibility popup
 *   Step 4 — Event details card + Pool Party & Banquet Dinner passport boxes
 *   Step 5 — Team verification page (teammates' sign-up status)
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import { normalizeSquadTime } from "@/lib/squadTime";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

const BOWLER_TOKEN_KEY = "vsn_bowler_token";

function formatId(id: number): string {
  return String(id).padStart(10, "0");
}

type Step = "contact" | "splash" | "responsibility" | "passport" | "team";

export default function CaptainConfirmation() {
  const [, navigate] = useLocation();
  const token = localStorage.getItem(BOWLER_TOKEN_KEY) ?? "";
  const [step, setStep] = useState<Step>("contact");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [showResponsibilityPopup, setShowResponsibilityPopup] = useState(false);

  useEffect(() => {
    if (!token) navigate("/captain-login");
  }, [token]);

  const submitMutation = trpc.bowlerAuth.submitContactInfo.useMutation({
    onSuccess: (data) => {
      setProfile(data);
      setStep("splash");
      setTimeout(() => {
        setStep("responsibility");
        setShowResponsibilityPopup(true);
      }, 3000);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleSubmitContact(e: React.FormEvent) {
    e.preventDefault();
    if (!phone && !email) {
      toast.error("Please enter at least a phone number or email address.");
      return;
    }
    submitMutation.mutate({ token, phone: phone || undefined, email: email || undefined });
  }

  if (step === "contact") {
    return (
      <ContactStep
        token={token}
        phone={phone} setPhone={setPhone}
        email={email} setEmail={setEmail}
        onSubmit={handleSubmitContact}
        isLoading={submitMutation.isPending}
      />
    );
  }

  if (step === "splash") {
    return <SplashStep />;
  }

  if (step === "responsibility" || step === "passport") {
    return (
      <>
        <PassportStep
          profile={profile}
          onViewTeam={() => setStep("team")}
          onDone={() => navigate("/captain")}
        />
        {/* Captain Responsibility Popup */}
        <Dialog open={showResponsibilityPopup} onOpenChange={setShowResponsibilityPopup}>
          <DialogContent className="bg-gradient-to-br from-[#1a0533] to-[#2d0a5e] border border-amber-500/40 text-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-amber-400 text-xl font-black text-center">
                ⭐ Team Captain Responsibilities
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm text-purple-200 text-center">
              <p className="text-white/90 leading-relaxed">
                As Team Captain, you are the <strong className="text-amber-300">primary point of contact</strong> for your teammates.
              </p>
              <p className="text-white/80 leading-relaxed">
                If any of your teammates have questions, concerns, or need assistance with the event, they should come to <strong className="text-amber-300">you first</strong>.
              </p>
              <p className="text-white/80 leading-relaxed">
                You will handle all interactions with the <strong className="text-amber-300">Event Director</strong> on behalf of your team.
              </p>
              <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 text-amber-200">
                <span className="font-bold">⏰ Arrive Early!</span> Bring your team <strong>30 minutes early</strong> — lines form quickly!
              </div>
            </div>
            <Button
              onClick={() => { setShowResponsibilityPopup(false); setStep("passport"); }}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-400 text-amber-900 font-black mt-2"
            >
              I Understand — Let's Go! →
            </Button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (step === "team") {
    return <TeamVerificationStep token={token} profile={profile} onBack={() => setStep("passport")} onDone={() => navigate("/captain")} />;
  }

  return null;
}

// ─── Contact Step ─────────────────────────────────────────────────────────────
function ContactStep({ token, phone, setPhone, email, setEmail, onSubmit, isLoading }: {
  token: string;
  phone: string; setPhone: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}) {
  const { data: me } = trpc.bowlerAuth.me.useQuery({ token }, { enabled: !!token });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#0a1a3d] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-xs font-bold tracking-[0.3em] text-amber-400 uppercase mb-2">B.O.B. Roll-off Passport</div>
          <div className="inline-block bg-amber-500/20 border border-amber-500/40 rounded-full px-4 py-1 text-amber-300 text-xs font-bold uppercase tracking-widest mb-3">⭐ Team Captain</div>
          <h1 className="text-3xl font-black text-white mb-1">Welcome, Captain!</h1>
          <p className="text-purple-300 text-sm">Your account has been created successfully.</p>
        </div>

        {me && (
          <div className="bg-gradient-to-r from-amber-500 to-yellow-400 rounded-2xl p-5 mb-6 shadow-2xl shadow-amber-500/30">
            <div className="text-center">
              <div className="text-xs font-bold tracking-widest text-amber-900 uppercase mb-1">Your Captain ID</div>
              <div className="text-4xl font-black text-amber-900 tracking-widest font-mono">
                {formatId(me.id)}
              </div>
              <div className="text-sm text-amber-800 mt-1">
                {me.legalFirstName} {me.legalLastName}
                {me.teamName && <span className="ml-2">· {me.teamName}</span>}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <h2 className="text-white font-bold text-lg mb-1">Complete Your Profile</h2>
          <p className="text-purple-300 text-sm mb-5">Add your contact info so we can reach you about the event.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label className="text-purple-200 text-sm font-medium">Phone Number</Label>
              <Input
                type="tel"
                placeholder="(555) 555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 bg-white/10 border-white/30 text-white placeholder:text-white/40 focus:border-amber-400"
              />
            </div>
            <div>
              <Label className="text-purple-200 text-sm font-medium">Email Address</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 bg-white/10 border-white/30 text-white placeholder:text-white/40 focus:border-amber-400"
              />
            </div>

            <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-sm">
              <span className="font-bold">⏰ Arrive Early!</span> Bring your team <strong>30 minutes early</strong> — lines form quickly at check-in!
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-amber-900 font-black text-lg py-3 rounded-xl"
            >
              {isLoading ? "Saving..." : "Continue →"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Splash Step ──────────────────────────────────────────────────────────────
function SplashStep() {
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-pink-800 to-amber-600 animate-pulse" />
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-30 animate-ping"
            style={{
              width: `${Math.random() * 200 + 50}px`,
              height: `${Math.random() * 200 + 50}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              background: `hsl(${Math.random() * 360}, 80%, 60%)`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${Math.random() * 2 + 1}s`,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 text-center px-6">
        <div className="text-6xl md:text-8xl font-black text-white drop-shadow-2xl leading-tight"
          style={{ textShadow: "0 0 40px rgba(255,200,0,0.8), 0 0 80px rgba(255,100,0,0.5)" }}>
          BOWLERS
        </div>
        <div className="text-5xl md:text-7xl font-black text-amber-300 drop-shadow-2xl"
          style={{ textShadow: "0 0 40px rgba(255,200,0,0.8), 0 0 80px rgba(255,100,0,0.5)" }}>
          ORLEANS
        </div>
        <div className="text-6xl md:text-8xl font-black text-white drop-shadow-2xl"
          style={{ textShadow: "0 0 40px rgba(255,200,0,0.8), 0 0 80px rgba(255,100,0,0.5)" }}>
          BOUND!
        </div>
        <div className="mt-6 text-white/70 text-lg animate-bounce">Loading your passport...</div>
      </div>
    </div>
  );
}

// ─── Passport Step ────────────────────────────────────────────────────────────
function PassportStep({ profile, onViewTeam, onDone }: { profile: any; onViewTeam: () => void; onDone: () => void }) {
  if (!profile) return null;

  const bowlerName = `${profile.legalFirstName} ${profile.legalLastName}`;
  const eventDates = profile.startDate && profile.endDate
    ? `${profile.startDate} – ${profile.endDate}`
    : profile.bowlingDate ?? "Date TBD";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#0a1a3d] p-4 pb-10">
      <div className="max-w-md mx-auto">
        <div className="text-center pt-8 mb-6">
          <div className="text-xs font-bold tracking-[0.3em] text-amber-400 uppercase mb-1">B.O.B. Roll-off Passport</div>
          <div className="inline-block bg-amber-500/20 border border-amber-500/40 rounded-full px-3 py-0.5 text-amber-300 text-xs font-bold uppercase tracking-widest mb-2">⭐ Team Captain</div>
          <h1 className="text-2xl font-black text-white">{bowlerName}</h1>
          <div className="text-amber-300 font-mono text-lg tracking-widest">{formatId(profile.id)}</div>
          {profile.teamName && <div className="text-purple-300 text-sm mt-1">{profile.teamName}</div>}
        </div>

        {/* Event Details */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20 mb-5">
          <h2 className="text-amber-400 font-bold text-sm uppercase tracking-widest mb-3">Event Details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-purple-300">Event</span>
              <span className="text-white font-medium">{profile.eventName ?? "B.O.B. Roll-off"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-300">Event Dates</span>
              <span className="text-white font-medium">{eventDates}</span>
            </div>
            {profile.squadTime && (
              <div className="flex justify-between">
                <span className="text-purple-300">Squad Time</span>
                <span className="text-white font-medium">{normalizeSquadTime(profile.squadTime)}</span>
              </div>
            )}
            {profile.laneNumber && (
              <div className="flex justify-between">
                <span className="text-purple-300">Starting Lane</span>
                <span className="text-white font-bold text-lg">{profile.laneNumber}</span>
              </div>
            )}
            {profile.centerName && (
              <div className="flex justify-between">
                <span className="text-purple-300">Bowling Center</span>
                <span className="text-white font-medium">{profile.centerName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Early Arrival */}
        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 text-amber-200 text-sm mb-5">
          <span className="font-bold">⏰ Arrive Early!</span> Bring your team <strong>30 minutes early</strong> — lines form quickly at check-in!
        </div>

        {/* Passport Boxes */}
        <div className="space-y-4 mb-5">
          <PassportBox
            title="Pool Party Passport"
            icon="🏊"
            color="from-cyan-500 to-blue-600"
            qrDataUrl={profile.poolPartyQR}
            isUsed={Boolean(profile.poolPartyUsed)}
            isDisabled={!profile.poolPartyToken}
          />
          <PassportBox
            title="Banquet Dinner Passport"
            icon="🍽️"
            color="from-purple-500 to-pink-600"
            qrDataUrl={profile.banquetQR}
            isUsed={Boolean(profile.banquetUsed)}
            isDisabled={!profile.banquetToken}
          />
          {/* Guest Pool Party Passes */}
          {Array.isArray(profile.guestPoolQRs) && profile.guestPoolQRs.length > 0 && (
            <>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 h-px bg-white/20" />
                <span className="text-white/50 text-xs font-semibold tracking-widest uppercase">Guest Pool Passes</span>
                <div className="flex-1 h-px bg-white/20" />
              </div>
              {profile.guestPoolQRs.map((g: { suffix: string; qrDataUrl: string; used: boolean; disabled: boolean }) => (
                <PassportBox
                  key={g.suffix}
                  title={`Guest Pool Pass ${g.suffix}`}
                  icon="🎟️"
                  color="from-teal-500 to-cyan-600"
                  qrDataUrl={g.used ? null : g.qrDataUrl}
                  isUsed={g.used}
                  isDisabled={g.disabled}
                />
              ))}
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button
            onClick={onViewTeam}
            variant="outline"
            className="w-full border-amber-500/50 text-amber-300 hover:bg-amber-500/10 font-bold py-3 rounded-xl"
          >
            ⭐ View My Team's Status →
          </Button>
          <PwaInstallPrompt />
          <Button
            onClick={onDone}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-amber-900 font-black text-lg py-3 rounded-xl"
          >
            Go to Captain Dashboard →
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Passport Box ─────────────────────────────────────────────────────────────
function PassportBox({ title, icon, color, qrDataUrl, isUsed, isDisabled }: {
  title: string; icon: string; color: string;
  qrDataUrl: string | null; isUsed: boolean; isDisabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden border border-white/20 shadow-xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full bg-gradient-to-r ${color} p-4 flex items-center justify-between text-white`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div className="text-left">
            <div className="font-black text-base">{title}</div>
            <div className="text-xs opacity-80">
              {isDisabled ? "Not Eligible" : isUsed ? "✓ Redeemed" : "Tap to view QR code"}
            </div>
          </div>
        </div>
        <span className="text-xl">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="bg-white/10 backdrop-blur-sm p-5 text-center">
          {isDisabled ? (
            <div className="py-4">
              <div className="text-4xl mb-3">ℹ️</div>
              <p className="text-white/80 text-sm leading-relaxed">
                You are not currently registered for this event. If you are interested in attending, please see your <strong className="text-amber-300">Event Director</strong> before the event begins.
              </p>
            </div>
          ) : isUsed ? (
            <div className="py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-white font-bold text-lg">Already Redeemed</p>
              <p className="text-white/60 text-sm mt-1">This passport has been used for entry.</p>
            </div>
          ) : qrDataUrl ? (
            <div>
              <div className="bg-white rounded-xl p-3 inline-block mb-3 shadow-lg">
                <img src={qrDataUrl} alt={`${title} QR Code`} className="w-48 h-48" />
              </div>
              <p className="text-white/70 text-xs">Show this QR code to the doorman for entry.</p>
            </div>
          ) : (
            <div className="py-4 text-white/60 text-sm">QR code not available yet.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Team Verification Step ───────────────────────────────────────────────────
function TeamVerificationStep({ token, profile, onBack, onDone }: {
  token: string; profile: any; onBack: () => void; onDone: () => void;
}) {
  const { data: teamData, isLoading } = trpc.bowlerAuth.myTeam.useQuery(
    { token },
    { enabled: !!token }
  );

  const statusColor: Record<string, string> = {
    pre_registered: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    signed_up: "bg-green-500/20 text-green-400 border-green-500/30",
    verified: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    checked_in: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    unmatched: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const statusLabel: Record<string, string> = {
    pre_registered: "Not Signed Up",
    signed_up: "✓ Signed Up",
    verified: "✓ Verified",
    checked_in: "✓ Checked In",
    unmatched: "⚠ Unmatched",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a0533] via-[#2d0a5e] to-[#0a1a3d] p-4 pb-10">
      <div className="max-w-md mx-auto">
        <div className="text-center pt-8 mb-6">
          <div className="text-xs font-bold tracking-[0.3em] text-amber-400 uppercase mb-1">B.O.B. Roll-off Passport</div>
          <h1 className="text-2xl font-black text-white">Team Sign-Up Status</h1>
          {teamData?.profile?.teamName && (
            <div className="text-purple-300 text-sm mt-1">{teamData.profile.teamName}</div>
          )}
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white/70 text-sm">
              Teammates who haven't signed up yet will need to create their account before the event. Remind them to sign up at <strong className="text-amber-300">/bowler-login</strong>.
            </p>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-white/50">Loading team roster...</div>
          ) : teamData?.roster?.length ? (
            <div className="divide-y divide-white/10">
              {teamData.roster.map((member: any) => (
                <div key={member.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-white font-medium text-sm">
                      {member.legalFirstName} {member.legalLastName}
                      {member.isCapitain ? " ⭐" : ""}
                    </div>
                    {member.scantronId && (
                      <div className="text-white/40 text-xs font-mono">{member.scantronId}</div>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full border ${statusColor[member.registrationStatus] ?? statusColor.pre_registered}`}>
                    {statusLabel[member.registrationStatus] ?? member.registrationStatus}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-white/50">No teammates found.</div>
          )}
        </div>

        <div className="space-y-3">
          <Button
            onClick={onBack}
            variant="outline"
            className="w-full border-white/30 text-white/70 hover:bg-white/10 font-medium py-3 rounded-xl"
          >
            ← Back to My Passport
          </Button>
          <PwaInstallPrompt />
          <Button
            onClick={onDone}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-amber-900 font-black text-lg py-3 rounded-xl"
          >
            Go to Captain Dashboard →
          </Button>
        </div>
      </div>
    </div>
  );
}
