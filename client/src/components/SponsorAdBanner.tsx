// Sponsor Ad Banner — thin wrapper around AdRotator so Profile/Captain pages
// show real sponsor ads (managed by the Event Director) and, when none are
// active, an "Advertise Here" placeholder that opens an inquiry form.
import { useState } from "react";
import { AdInquiryDialog } from "@/components/AdInquiryDialog";

const ADVERTISE_HERE_IMG = "/manus-storage/advertise-here_389a09e4.jpg";

interface SponsorAdBannerProps {
  slot?: "top" | "bottom" | "sidebar";
  className?: string;
  eventId?: number | null;
}

/**
 * Compact "Advertise Here" banner. Tapping it opens the advertiser inquiry
 * form, which routes to the Event Director's Advertiser Leads inbox.
 */
export function SponsorAdBanner({ slot = "bottom", className = "", eventId = null }: SponsorAdBannerProps) {
  const [inquiryOpen, setInquiryOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setInquiryOpen(true)}
        className={`group relative block w-full overflow-hidden rounded-xl border border-amber-500/20 bg-black shadow-md transition-transform active:scale-[0.99] ${className}`}
        title="Advertise here"
        aria-label="Advertise here — contact the Event Director"
        data-slot={slot}
      >
        <img
          src={ADVERTISE_HERE_IMG}
          alt="Advertise here"
          className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
        />
      </button>
      <AdInquiryDialog open={inquiryOpen} onOpenChange={setInquiryOpen} eventId={eventId} />
    </>
  );
}

export function SponsorAdSidebar({ className = "", eventId = null }: { className?: string; eventId?: number | null }) {
  const [inquiryOpen, setInquiryOpen] = useState(false);
  return (
    <div className={`space-y-3 ${className}`}>
      <button
        type="button"
        onClick={() => setInquiryOpen(true)}
        className="group relative block w-full overflow-hidden rounded-xl border border-amber-500/20 bg-black shadow-md transition-transform active:scale-[0.99]"
        title="Advertise here"
        aria-label="Advertise here — contact the Event Director"
      >
        <img
          src={ADVERTISE_HERE_IMG}
          alt="Advertise here"
          className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
        />
      </button>
      <AdInquiryDialog open={inquiryOpen} onOpenChange={setInquiryOpen} eventId={eventId} />
    </div>
  );
}
