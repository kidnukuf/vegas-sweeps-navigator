/**
 * ScanPassport.tsx
 * Handles the URL that QR codes point to:
 *   /scan/pool/:token   → validates pool party passport
 *   /scan/banquet/:token → validates banquet dinner passport
 *
 * This page is loaded when a doorman scans a QR code from their device camera
 * OR when the bowler's QR code URL is opened directly.
 * The doorman portal uses the camera scanner UI instead.
 */
import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";

type ScanResult = "loading" | "granted" | "used" | "disabled" | "invalid";

export default function ScanPassport() {
  const params = useParams<{ type: string; token: string }>();
  const passportType = params.type as "pool" | "banquet";
  const tokenValue = params.token ?? "";

  const [result, setResult] = useState<ScanResult>("loading");
  const [bowlerName, setName] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const scanMutation = trpc.bowlerAuth.scanPassport.useMutation({
    onSuccess: (data) => {
      setResult(data.result);
      setMessage(data.message);
      if ("bowlerName" in data && data.bowlerName) setName(data.bowlerName);
    },
    onError: () => {
      setResult("invalid");
      setMessage("An error occurred. Please try again.");
    },
  });

  useEffect(() => {
    if (tokenValue && (passportType === "pool" || passportType === "banquet")) {
      scanMutation.mutate({ tokenValue, passportType });
    } else {
      setResult("invalid");
      setMessage("Invalid scan URL.");
    }
  }, [tokenValue, passportType]);

  const config: Record<ScanResult, { bg: string; icon: string; title: string; textColor: string }> = {
    loading: { bg: "from-gray-800 to-gray-900", icon: "⏳", title: "Validating...", textColor: "text-white" },
    granted: { bg: "from-green-600 to-emerald-700", icon: "✅", title: "Entry Granted", textColor: "text-white" },
    used: { bg: "from-red-700 to-rose-800", icon: "🚫", title: "Already Redeemed", textColor: "text-white" },
    disabled: { bg: "from-orange-700 to-red-700", icon: "⛔", title: "Not Eligible", textColor: "text-white" },
    invalid: { bg: "from-gray-700 to-gray-900", icon: "❌", title: "Invalid QR Code", textColor: "text-white" },
  };

  const c = config[result];
  const passportLabel = passportType === "pool" ? "Pool Party" : "Banquet Dinner";

  return (
    <div className={`min-h-screen bg-gradient-to-br ${c.bg} flex items-center justify-center p-6`}>
      <div className="text-center max-w-sm w-full">
        <div className="text-8xl mb-6 animate-bounce">{c.icon}</div>
        <div className="text-xs font-bold tracking-widest text-white/60 uppercase mb-2">{passportLabel} Passport</div>
        <h1 className={`text-4xl font-black ${c.textColor} mb-3`}>{c.title}</h1>
        {bowlerName && (
          <div className="text-2xl font-bold text-white/90 mb-2">{bowlerName}</div>
        )}
        <p className="text-white/70 text-base">{message}</p>

        {result === "granted" && (
          <div className="mt-8 bg-white/20 rounded-2xl p-4">
            <div className="text-white font-bold text-lg">Welcome to the {passportLabel}!</div>
            <div className="text-white/70 text-sm mt-1">This QR code has been marked as used.</div>
          </div>
        )}
      </div>
    </div>
  );
}
