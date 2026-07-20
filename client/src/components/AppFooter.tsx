/**
 * AppFooter — shared copyright and legal footer for all app pages
 *
 * Rendered at the bottom of every bowler, captain, and ED portal page.
 * Provides the legally required copyright notice, liability disclaimer,
 * privacy statement, and terms-of-use reference.
 */

const CURRENT_YEAR = 2026;

export default function AppFooter({ dark = true }: { dark?: boolean }) {
  const bg = dark
    ? "bg-black/60 border-white/10 text-white/40"
    : "bg-white/80 border-black/10 text-black/40";

  return (
    <footer
      className={`w-full border-t ${bg} px-4 py-6 mt-8 text-center`}
      role="contentinfo"
      aria-label="Site footer"
    >
      <div className="max-w-2xl mx-auto space-y-2 text-[11px] leading-relaxed">

        {/* Primary copyright line */}
        <p className="font-semibold tracking-wide">
          &copy; {CURRENT_YEAR} B.O.B. Roll-off Passport &mdash; All Rights Reserved.
        </p>

        {/* Operator attribution */}
        <p>
          Developed and operated by <span className="font-medium">Vegas Sweeps Navigator</span>.
          Unauthorized reproduction, distribution, or commercial use of any content,
          data, or software on this platform is strictly prohibited.
        </p>

        {/* Liability disclaimer */}
        <p>
          <span className="font-medium">Disclaimer:</span> This application is provided
          &ldquo;as is&rdquo; without warranty of any kind, express or implied. Vegas Sweeps
          Navigator and its operators shall not be liable for any direct, indirect,
          incidental, or consequential damages arising from the use of or inability to use
          this service, including but not limited to errors, omissions, interruptions, or
          loss of data.
        </p>

        {/* Privacy statement */}
        <p>
          <span className="font-medium">Privacy:</span> Personal information collected
          through this platform (including name, contact details, and event registration
          data) is used solely for event management and communication purposes. We do not
          sell or share your personal information with third parties except as required by
          law or necessary to operate this service.
        </p>

        {/* Event-specific notice */}
        <p>
          Event participation is subject to the rules and regulations of the B.O.B.
          Roll-off Tournament. All bowling center policies apply. Management reserves the
          right to modify event details, seating, or schedules without prior notice.
        </p>

        {/* Terms of use */}
        <p>
          By using this application you agree to our{" "}
          <span className="underline cursor-default">Terms of Use</span> and{" "}
          <span className="underline cursor-default">Privacy Policy</span>.
          For questions or concerns, contact the Event Director at your bowling center.
        </p>

        {/* Build / version stamp */}
        <p className="opacity-50 text-[10px] pt-1">
          Vegas Sweeps Navigator &bull; B.O.B. Roll-off Passport &bull; {CURRENT_YEAR}
        </p>
      </div>
    </footer>
  );
}
