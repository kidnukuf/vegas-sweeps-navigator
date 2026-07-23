/**
 * ScanPassport.tsx
 * Handles the URL that QR codes point to:
 *   /scan/pool/:token          → shows pool party passport status
 *   /scan/banquet/:token       → shows banquet dinner passport status
 *   /scan/guest-pool/:token    → shows guest pool pass status
 *   /scan/guest-banquet/:token → shows guest banquet pass status
 *
 * ⚠️  THIS PAGE IS READ-ONLY — it NEVER marks a token as used.
 *
 * Why: The /scan/:type/:token URL is embedded in QR codes and written to the
 * Google Sheet. Google Sheets link-preview bots, email security scanners, and
 * accidental clicks all navigate to this URL. If this page called scanPassport
 * (the mutation that marks tokens used), those automated requests would
 * permanently consume tokens with nobody at the door.
 *
 * Tokens are only marked used by the in-app doorman scanner:
 *   - DoormanCheckIn.tsx   (online mode, calls scanPassport mutation)
 *   - DoormanTablet.tsx    (tablet mode, calls scanPassport mutation)
 *   - offlineDoorEngine.ts (offline mode, queues for sync)
 */
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";

type PassportType = "pool" | "banquet" | "guest-pool" | "guest-banquet";
type DisplayState  = "loading" | "valid" | "used" | "disabled" | "invalid";

const CONFIG: Record<DisplayState, { bg: string; icon: string; title: string }> = {
  loading:  { bg: "from-gray-800 to-gray-900",   icon: "⏳", title: "Checking…"        },
  valid:    { bg: "from-blue-700 to-indigo-800", icon: "🎟️", title: "Valid Passport"   },
  used:     { bg: "from-red-700 to-rose-800",    icon: "🚫", title: "Already Redeemed" },
  disabled: { bg: "from-orange-700 to-red-700",  icon: "⛔", title: "Not Eligible"     },
  invalid:  { bg: "from-gray-700 to-gray-900",   icon: "❌", title: "Invalid QR Code"  },
};

export default function ScanPassport() {
  const params       = useParams<{ type: string; token: string }>();
  const passportType = (params.type ?? "") as PassportType;
  const tokenValue   = params.token ?? "";

  const validType =
    passportType === "pool" ||
    passportType === "banquet" ||
    passportType === "guest-pool" ||
    passportType === "guest-banquet";

  // Read-only query — zero DB writes, safe for bots and accidental clicks
  const { data, isLoading } = trpc.bowlerAuth.validatePassportToken.useQuery(
    { tokenValue, passportType },
    {
      enabled:   Boolean(tokenValue) && validType,
      retry:     false,
      staleTime: 10_000, // 10 s — short enough to reflect real-time status
    }
  );

  const state: DisplayState =
    !validType || !tokenValue ? "invalid"
    : isLoading               ? "loading"
    : data?.result === "valid" ? "valid"
    : (data?.result as DisplayState | undefined) ?? "invalid";

  const c = CONFIG[state];

  const passportLabel =
    passportType === "pool"            ? "Pool Party"
    : passportType === "banquet"       ? "Banquet Dinner"
    : passportType === "guest-pool"    ? "Guest Pool Party"
    : passportType === "guest-banquet" ? "Guest Banquet"
    : "Passport";

  return (
    <div className={`min-h-screen bg-gradient-to-br ${c.bg} flex items-center justify-center p-6`}>
      <div className="text-center max-w-sm w-full">

        <div className="text-8xl mb-6">{c.icon}</div>

        <div className="text-xs font-bold tracking-widest text-white/60 uppercase mb-2">
          {passportLabel} Passport
        </div>

        <h1 className="text-4xl font-black text-white mb-3">{c.title}</h1>

        {data?.bowlerName && (
          <div className="text-2xl font-bold text-white/90 mb-2">{data.bowlerName}</div>
        )}

        {data?.message && (
          <p className="text-white/70 text-base mb-6">{data.message}</p>
        )}

        {state === "valid" && (
          <div className="mt-4 bg-white/15 rounded-2xl p-5 border border-white/20">
            <div className="text-white font-bold text-lg mb-1">✅ Ready to Admit</div>
            <div className="text-white/70 text-sm">
              This QR code is valid. Scan it using the{" "}
              <span className="font-semibold text-white/90">Doorman Portal</span>{" "}
              to grant entry and mark it as used.
            </div>
          </div>
        )}

        {state === "used" && (
          <div className="mt-4 bg-white/10 rounded-2xl p-5 border border-white/20">
            <div className="text-white/70 text-sm">
              This QR code has already been redeemed at the door.
              If you believe this is an error, contact the Event Director.
            </div>
          </div>
        )}

        {state === "disabled" && (
          <div className="mt-4 bg-white/10 rounded-2xl p-5 border border-white/20">
            <div className="text-white/70 text-sm">
              This passport has been disabled by the Event Director.
              Please see them at the registration desk.
            </div>
          </div>
        )}

        <div className="mt-8 text-white/30 text-xs">
          B.O.B. Roll-off Passport System
        </div>

      </div>
    </div>
  );
}
