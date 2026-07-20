import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Center = Record<string, unknown>;
type MatchResult = Record<string, unknown>;

export default function BowlerRegistration() {
  const [, setLocation] = useLocation();
  const EVENT_ID = 1;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [centerId, setCenterId] = useState("");
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [selectedBowler, setSelectedBowler] = useState<MatchResult | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [generatedId, setGeneratedId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("team_id");
    if (t) setCenterId(t);
  }, []);

  const { data: centers = [] } = trpc.centers.list.useQuery();

  const matchMutation = trpc.bowlers.matchForSignup.useMutation({
    onSuccess: (data) => {
      const raw = data as unknown;
      const results: MatchResult[] = Array.isArray(raw) ? (raw as MatchResult[]) : (raw && typeof raw === 'object' && 'bowler' in (raw as object) ? [(raw as { bowler: MatchResult }).bowler as MatchResult] : []);
      setMatchResults(results);
      if (results.length === 0) toast.info("No matching records found. Contact the Event Director.");
    },
    onError: (e) => toast.error(e.message),
  });

  const claimMutation = trpc.appAuth.claimBowler.useMutation({
    onSuccess: (data) => {
      const result = data as Record<string, unknown>;
      setGeneratedId(String(result.scantronId ?? ""));
      setSubmitted(true);
      setPhoneLocked(true);
      toast.success("Account created! Your bowler ID has been assigned.");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSearch = () => {
    if (!firstName.trim() || !lastName.trim()) { toast.error("Enter first and last name."); return; }
    matchMutation.mutate({ firstName, lastName, phone: phone || undefined, centerId: centerId ? Number(centerId) : 0, eventId: EVENT_ID });
  };

  const handleClaim = () => {
    if (!selectedBowler) return;
    if (!email.trim() || !password.trim()) { toast.error("Email and password are required."); return; }
    setPhoneLocked(true);
    claimMutation.mutate({ bowlerId: selectedBowler.id as number, email, password, phone: phone || undefined });
  };

  if (submitted && generatedId) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <div className="bg-[#1a1a1a] rounded-2xl border border-yellow-500/30 p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🎳</div>
          <h2 className="text-2xl font-black text-yellow-400 mb-2" style={{ textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>Registration Complete!</h2>
          <p className="text-gray-400 mb-6">Your bowler ID has been assigned:</p>
          <div className="bg-[#111] rounded-xl border border-yellow-500/50 p-4 mb-6">
            <div className="font-mono text-3xl font-black text-yellow-400 tracking-widest" style={{ textShadow: "0 0 20px rgba(255,215,0,0.6)" }}>{generatedId}</div>
            <p className="text-xs text-gray-500 mt-2">Save this number — it is your scantron ID</p>
          </div>
          <button onClick={() => setLocation("/")} className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl transition-all active:scale-95">Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="bg-[#1a1a1a] border-b border-yellow-500/30 px-4 py-4 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="text-gray-400 hover:text-white text-sm">← Home</button>
          <span className="text-gray-600">|</span>
          <h1 className="text-2xl font-black" style={{ fontFamily: "'Rajdhani', sans-serif", color: "#ffd700", textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>🎳 BOWLER SIGN-UP</h1>
        </div>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {!selectedBowler ? (
          <div>
            <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6 mb-5">
              <h2 className="text-lg font-bold text-cyan-400 mb-1">Step 1: Find Your Record</h2>
              <p className="text-gray-500 text-sm mb-5">Your registration was pre-loaded by the Event Director. Enter your information to locate your record.</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">First Name *</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Last Name *</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Phone (optional)</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={phoneLocked} placeholder="Helps narrow results" className={`w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500 ${phoneLocked ? "opacity-60 cursor-not-allowed" : ""}`} />
                  {phoneLocked && <p className="text-xs text-gray-500 mt-1">🔒 Phone locked</p>}
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Bowling Center (optional)</label>
                  <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500">
                    <option value="">Any center</option>
                    {(centers as Center[]).map((c) => (<option key={String(c.id)} value={String(c.id)}>{String(c.centerName)}</option>))}
                  </select>
                </div>
              </div>
              <button onClick={handleSearch} disabled={matchMutation.isPending} className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-black rounded-xl transition-all active:scale-95">
                {matchMutation.isPending ? "Searching..." : "🔍 Find My Record"}
              </button>
            </div>
            {matchResults !== null && (
              <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-3">{matchResults.length === 0 ? "No records found" : `${matchResults.length} record${matchResults.length !== 1 ? "s" : ""} found — select yours:`}</h3>
                {matchResults.length === 0 ? (
                  <p className="text-gray-500 text-sm">Your name was not found in the pre-registered list. Please contact the Event Director.</p>
                ) : (
                  <div className="space-y-2">
                    {matchResults.map((b) => (
                      <button key={String(b.id)} onClick={() => setSelectedBowler(b)} className="w-full text-left p-4 bg-[#111] hover:bg-white/10 rounded-xl border border-white/10 hover:border-yellow-500/50 transition-all">
                        <div className="font-bold text-white">{String(b.legalFirstName ?? "")} {String(b.legalLastName ?? "")}</div>
                        <div className="text-sm text-gray-400 mt-0.5">{String(b.centerName ?? "")} • Team {String(b.teamCode ?? "")} — {String(b.teamName ?? "")}</div>
                        <div className="text-xs text-yellow-400 mt-1 font-mono">{String(b.scantronId ?? "ID pending")}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-cyan-400 mb-1">Step 2: Create Your Account</h2>
                <div className="mt-2 p-3 bg-[#111] rounded-xl border border-yellow-500/30">
                  <div className="font-bold text-white">{String(selectedBowler.legalFirstName ?? "")} {String(selectedBowler.legalLastName ?? "")}</div>
                  <div className="text-sm text-gray-400">{String(selectedBowler.centerName ?? "")} • Team {String(selectedBowler.teamCode ?? "")}</div>
                  <div className="text-xs text-yellow-400 font-mono mt-1">{String(selectedBowler.scantronId ?? "")}</div>
                </div>
              </div>
              <button onClick={() => setSelectedBowler(null)} className="text-gray-500 hover:text-white text-sm">← Back</button>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Email *</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Phone {phoneLocked ? "🔒 Locked" : "(will be locked after submission)"}</label>
                <input value={phone} disabled={phoneLocked} onChange={(e) => setPhone(e.target.value)} className={`w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500 ${phoneLocked ? "opacity-60 cursor-not-allowed" : ""}`} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Password *</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 bg-[#111] border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500" />
              </div>
            </div>
            <button onClick={handleClaim} disabled={claimMutation.isPending || !email || !password} className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-black rounded-xl transition-all active:scale-95">
              {claimMutation.isPending ? "Creating Account..." : "✅ Claim My Bowler Record"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
