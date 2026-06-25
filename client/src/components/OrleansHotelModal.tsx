import { X, MapPin, Phone, Clock, BedDouble } from "lucide-react";

/**
 * Orleans Hotel info pop-up shown in the Bowler & Captain portals when a patron
 * taps the Hotel Check-In or Check-Out step inside the Lane to Banquet placard.
 *
 * The content is rendered as readable HTML (not a flat image) so all fee text is
 * legible on small phones and tablets. Check-in / check-out times are passed in
 * from the event settings so they stay event-specific.
 */
export interface OrleansHotelModalProps {
  open: boolean;
  onClose: () => void;
  checkinLabel?: string | null; // e.g. "Thursday, 4:00 PM"
  checkoutLabel?: string | null; // e.g. "Sunday, 11:00 AM"
}

export function OrleansHotelModal({ open, onClose, checkinLabel, checkoutLabel }: OrleansHotelModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="The Orleans Hotel information"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border-2 border-[#caa84a] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "orleansPop 220ms cubic-bezier(0.23,1,0.32,1)" }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#caa84a] bg-white/90 text-[#4a2d6b] transition-transform active:scale-90"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-7 text-center">
          <div className="mx-auto mb-1 text-3xl font-extrabold tracking-tight text-[#1f6b3a]" style={{ fontFamily: "Georgia, serif" }}>
            The <span className="text-[#0f5a2e]">ORLEANS</span>
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.4em] text-[#caa84a]">Hotel</div>
          <h2 className="mt-4 text-2xl font-extrabold text-[#4a2d6b]">HOTEL — The Orleans Hotel</h2>
          <div className="mt-3 space-y-1.5 text-[15px] font-medium text-gray-700">
            <p className="flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 text-[#4a2d6b]" /> 4500 W. Tropicana Avenue, Las Vegas, NV 89103
            </p>
            <p className="flex items-center justify-center gap-2">
              <Phone className="h-4 w-4 text-[#4a2d6b]" /> (702) 365-7111
            </p>
          </div>
        </div>

        <div className="mx-6 my-4 border-t border-[#caa84a]/40" />

        {/* Rooms */}
        <div className="px-6 pb-6">
          <div className="overflow-hidden rounded-xl border border-[#4a2d6b]/20">
            <div className="flex items-center gap-2 bg-[#4a2d6b] px-4 py-2.5 text-white">
              <BedDouble className="h-5 w-5" />
              <span className="text-lg font-bold tracking-wide">ROOMS</span>
            </div>
            <div className="bg-[#faf8fc] px-4 py-4 text-center">
              <p className="text-[15px] font-semibold leading-snug text-gray-800">
                There is a <span className="text-[#4a2d6b]">$21.99 + tax/night Resort Fee</span> collected at check-in.
                A valid credit/debit card is required.
              </p>
              <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[15px] font-bold text-[#4a2d6b]">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" /> Check-in: {checkinLabel || "4:00 PM"}
                </span>
                <span className="hidden text-gray-300 sm:inline">|</span>
                <span>Check-out: {checkoutLabel || "11:00 AM"}</span>
              </p>
            </div>
          </div>

          {/* Early check-in */}
          <table className="mt-4 w-full overflow-hidden rounded-lg text-sm">
            <thead>
              <tr className="bg-[#1f6b3a] text-white">
                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide">Early Check-In</th>
                <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Fee</th>
              </tr>
            </thead>
            <tbody className="text-gray-800">
              <tr className="border-b border-gray-200 bg-gray-50">
                <td className="px-3 py-2 font-medium">Prior to 11am</td>
                <td className="px-3 py-2 text-right font-bold text-[#4a2d6b]">$35 +tax</td>
              </tr>
              <tr className="bg-white">
                <td className="px-3 py-2 font-medium">11am – 2pm</td>
                <td className="px-3 py-2 text-right font-bold text-[#4a2d6b]">$25 +tax</td>
              </tr>
            </tbody>
          </table>

          {/* Late check-out */}
          <table className="mt-3 w-full overflow-hidden rounded-lg text-sm">
            <thead>
              <tr className="bg-[#4a2d6b] text-white">
                <th className="px-3 py-2 text-left font-bold uppercase tracking-wide">Late Check-Out</th>
                <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Fee</th>
              </tr>
            </thead>
            <tbody className="text-gray-800">
              <tr className="border-b border-gray-200 bg-purple-50/40">
                <td className="px-3 py-2 font-medium">11am – 1pm</td>
                <td className="px-3 py-2 text-right font-bold text-[#4a2d6b]">$30 +tax</td>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <td className="px-3 py-2 font-medium">1pm – 3pm</td>
                <td className="px-3 py-2 text-right font-bold text-[#4a2d6b]">$50 +tax</td>
              </tr>
              <tr className="bg-purple-50/40">
                <td className="px-3 py-2 font-medium">After 3pm</td>
                <td className="px-3 py-2 text-right font-bold text-[#4a2d6b]">Full Day Rate</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-4 text-center text-xs text-gray-500">
            Fees are set by The Orleans Hotel and are subject to change. Confirm current rates at check-in.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes orleansPop {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] > div { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default OrleansHotelModal;
