import { X, MapPin, Phone, Clock, BedDouble } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Orleans Hotel info dialog shown in the Bowler & Captain portals when a patron
 * opens the hotel details from the Lane to Banquet placard.
 */
export interface OrleansHotelModalProps {
  open: boolean;
  onClose: () => void;
  checkinLabel?: string | null;
  checkoutLabel?: string | null;
}

export function OrleansHotelModal({ open, onClose, checkinLabel, checkoutLabel }: OrleansHotelModalProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-md overflow-y-auto rounded-3xl border-2 border-[#caa84a] bg-white p-0 text-gray-900 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close hotel information"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#caa84a] bg-white/90 text-[#4a2d6b] transition-transform active:scale-90"
        >
          <X className="h-5 w-5" />
        </button>

        <DialogHeader className="px-6 pt-7 text-center">
          <div className="mx-auto mb-1 text-3xl font-extrabold tracking-tight text-[#1f6b3a]" style={{ fontFamily: "Georgia, serif" }}>
            The <span className="text-[#0f5a2e]">ORLEANS</span>
          </div>
          <DialogDescription className="text-xs font-semibold uppercase tracking-[0.4em] text-[#caa84a]">Hotel</DialogDescription>
          <DialogTitle className="mt-4 text-2xl font-extrabold text-[#4a2d6b]">HOTEL — The Orleans Hotel</DialogTitle>
          <div className="mt-3 space-y-1.5 text-[15px] font-medium text-gray-700">
            <p className="flex items-center justify-center gap-2">
              <MapPin className="h-4 w-4 text-[#4a2d6b]" /> 4500 W. Tropicana Avenue, Las Vegas, NV 89103
            </p>
            <p className="flex items-center justify-center gap-2">
              <Phone className="h-4 w-4 text-[#4a2d6b]" /> (702) 365-7111
            </p>
          </div>
        </DialogHeader>

        <div className="mx-6 my-4 border-t border-[#caa84a]/40" />

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
      </DialogContent>
    </Dialog>
  );
}

export default OrleansHotelModal;
