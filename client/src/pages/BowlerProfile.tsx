import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { SponsorAdBanner } from "@/components/SponsorAdBanner";

type Bowler = Record<string, unknown>;

export default function BowlerProfile() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const bowlerId = Number(params.id);

  const { data: bowler, isLoading } = trpc.bowlers.getById.useQuery({ id: bowlerId }, { enabled: !!bowlerId });
  const { data: tokenData } = trpc.tokens.getForBowler.useQuery({ bowlerId }, { enabled: !!bowlerId });

  const b = bowler as Bowler | undefined;

  if (isLoading) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="text-gray-500">Loading profile...</div>
    </div>
  );

  if (!b) return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-5xl mb-4">🎳</div>
        <p className="text-gray-400 mb-4">Bowler not found.</p>
        <button onClick={() => setLocation("/")} className="px-4 py-2 bg-yellow-500 text-black font-bold rounded-lg">Back to Home</button>
      </div>
    </div>
  );

  const token = tokenData as Record<string, unknown> | undefined;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="bg-[#1a1a1a] border-b border-yellow-500/30 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="text-gray-400 hover:text-white text-sm">← Home</button>
          <h1 className="text-xl font-black text-yellow-400" style={{ textShadow: "0 0 15px rgba(255,215,0,0.5)" }}>🎳 MY PROFILE</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-black text-white">{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</h2>
              <p className="text-gray-400 text-sm mt-1">{String(b.centerName ?? "")} • Team {String(b.teamCode ?? "")} — {String(b.teamName ?? "")}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${b.registrationStatus === "checked_in" ? "bg-yellow-900 text-yellow-300" : b.registrationStatus === "verified" ? "bg-green-900 text-green-300" : "bg-gray-700 text-gray-400"}`}>
              {String(b.registrationStatus ?? "pre_registered")}
            </span>
          </div>
          <div className="bg-[#111] rounded-xl p-4 border border-yellow-500/30 text-center">
            <div className="text-xs text-gray-500 mb-1">YOUR SCANTRON ID</div>
            <div className="font-mono text-2xl font-black text-yellow-400 tracking-widest" style={{ textShadow: "0 0 15px rgba(255,215,0,0.5)" }}>
              {String(b.scantronId ?? "Pending")}
            </div>
            <div className="text-xs text-gray-600 mt-1">CC · L · EE · TT · BB</div>
          </div>
        </div>

        {token != null && Boolean((token as Record<string, unknown>).qrDataUrl) && (
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 text-center">
            <h3 className="text-sm font-semibold text-gray-400 mb-4">Your Event QR Code</h3>
            <img src={String((token as Record<string, unknown>).qrDataUrl)} alt="QR Code" className="mx-auto rounded-xl border-2 border-yellow-500/30" style={{ width: 200 }} />
            <p className="text-xs text-gray-500 mt-3">Present this at the door for entry. Valid one-time use only.</p>
          </div>
        )}

        <SponsorAdBanner slot="top" />

        <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Event Details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500">Center:</span> <span className="text-white">{String(b.centerName ?? "—")}</span></div>
            <div><span className="text-gray-500">Team:</span> <span className="text-white">{String(b.teamName ?? "—")}</span></div>
            <div><span className="text-gray-500">Hotel Check-In:</span> <span className="text-white">{String(b.checkinDate ?? "—")}</span></div>
            <div><span className="text-gray-500">Room:</span> <span className="text-white">{String(b.roomType ?? "—")}</span></div>
            <div><span className="text-gray-500">Banquet:</span> <span className="text-white">{b.banquetAmount ? `$${b.banquetAmount}` : "—"}</span></div>
            <div><span className="text-gray-500">Captain:</span> <span className="text-white">{b.isCapitain ? "Yes ⭐" : "No"}</span></div>
          </div>
        </div>

        <SponsorAdBanner slot="bottom" />

        <div className="text-center py-4 text-xs text-gray-700">
          B.O.B. Roll-off Passport 2026 · Powered by EventDirector
        </div>
      </div>
    </div>
  );
}
