import { useState } from "react";
import { normalizeSquadTime } from "@/lib/squadTime";
import OrleansHotelModal from "@/components/OrleansHotelModal";

/**
 * Shared "Lane to Banquet" trip-planner placard used by both the Bowler and
 * Captain portals. Renders the patron's personal logistics (hotel reg, lane,
 * squad, banquet table) plus the event-level steps configured in the Create
 * Event wizard (check-in, registration, t-shirts, pool party, banquet day,
 * check-out) and a tappable Orleans Hotel info card.
 */
export interface EventTripSettings {
  hotelCheckinDay?: string | null;
  hotelCheckinTime?: string | null;
  registrationDay?: string | null;
  registrationTime?: string | null;
  tshirtsProvided?: boolean | number | null;
  tshirtPickupLocation?: string | null;
  tshirtPickupTime?: string | null;
  poolPartyEnabled?: boolean | number | null;
  poolPartyTime?: string | null;
  banquetDay?: string | null;
  hotelCheckoutDay?: string | null;
  hotelCheckoutTime?: string | null;
  showHotelInfoCard?: boolean | number | null;
}

export interface LaneToBanquetPlacardProps {
  laneToEvent?: string | null;
  laneNumber?: number | null;
  squadTime?: string | null;
  hotelName?: string | null;
  confirmationCode?: string | null;
  checkinDate?: string | null;
  checkoutDate?: string | null;
  roomType?: string | null;
  banquetTable?: string | null;
  banquetLocation?: string | null;
  banquetTime?: string | null;
  ev?: EventTripSettings | null;
}

export function LaneToBanquetPlacard({
  laneToEvent, laneNumber, squadTime, hotelName, confirmationCode, checkinDate,
  checkoutDate, roomType, banquetTable, banquetLocation, banquetTime, ev,
}: LaneToBanquetPlacardProps) {
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [hotelModalOpen, setHotelModalOpen] = useState(false);

  function handleClick() {
    if (!open) {
      setAnimating(true);
      setTimeout(() => setAnimating(false), 600);
    }
    setOpen((o) => !o);
  }

  const hasHotel = hotelName || confirmationCode || checkinDate || checkoutDate;
  const hasBanquet = banquetTable || banquetLocation || banquetTime;
  const hasEvSteps = !!(ev && (ev.hotelCheckinDay || ev.hotelCheckinTime || ev.registrationDay || ev.registrationTime || ev.tshirtsProvided || ev.poolPartyEnabled || ev.banquetDay || ev.hotelCheckoutDay || ev.hotelCheckoutTime));
  const hasInfo = laneToEvent || laneNumber || squadTime || hasHotel || hasBanquet || hasEvSteps;
  if (!hasInfo) return null;

  const showHotelCard = !ev || ev.showHotelInfoCard === undefined || ev.showHotelInfoCard === null ? true : Boolean(ev.showHotelInfoCard);
  const checkinLabel = [ev?.hotelCheckinDay, ev?.hotelCheckinTime].filter(Boolean).join(" · ") || checkinDate || null;
  const checkoutLabel = [ev?.hotelCheckoutDay, ev?.hotelCheckoutTime].filter(Boolean).join(" · ") || checkoutDate || null;

  return (
    <div
      className={`bowler-card cursor-pointer select-none transition-all duration-300 ${open ? "ring-2 ring-amber-400/60" : "hover:ring-1 hover:ring-amber-400/30"}`}
      onClick={handleClick}
      role="button"
      aria-expanded={open}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🗺️</span>
          <div>
            <p className="text-amber-300 font-bold text-sm tracking-wide">Lane to Banquet</p>
            <p className="text-white/75 text-xs">Tap to see your event directions</p>
          </div>
        </div>
        <span className={`text-amber-300 text-lg transition-transform duration-300 ${open ? "rotate-90" : "rotate-0"}`} aria-hidden="true">▶</span>
      </div>

      <div className={`overflow-hidden transition-all duration-500 ease-out ${open ? "max-h-[2000px] opacity-100 mt-4" : "max-h-0 opacity-0 mt-0"}`}>
        {animating && <div className="h-0.5 w-full rounded-full bg-gradient-to-r from-transparent via-amber-400 to-transparent mb-3 animate-pulse" />}

        <div className="space-y-3 pt-1 border-t border-white/10">
          {hasHotel && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <p className="text-blue-300 text-xs font-semibold mb-2">🏨 Reg: Hotel Registration</p>
              <div className="space-y-1.5">
                {confirmationCode && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">🔑</span>
                    <div>
                      <p className="text-white/60 text-xs">Registration #</p>
                      <p className="text-amber-300 font-mono font-bold text-lg tracking-widest">{confirmationCode}</p>
                    </div>
                  </div>
                )}
                {hotelName && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏨</span>
                    <div>
                      <p className="text-white/60 text-xs">Hotel</p>
                      <p className="text-white font-semibold text-sm">{hotelName}</p>
                    </div>
                  </div>
                )}
                {checkinDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <div>
                      <p className="text-white/60 text-xs">Check-In</p>
                      <p className="text-white font-semibold text-sm">{checkinDate}</p>
                    </div>
                  </div>
                )}
                {checkoutDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <div>
                      <p className="text-white/60 text-xs">Check-Out</p>
                      <p className="text-white font-semibold text-sm">{checkoutDate}</p>
                    </div>
                  </div>
                )}
                {roomType && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">🛏️</span>
                    <div>
                      <p className="text-white/60 text-xs">Room Type</p>
                      <p className="text-white font-semibold text-sm">{roomType}</p>
                    </div>
                  </div>
                )}
              </div>
              {(checkinLabel || checkoutLabel) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {checkinLabel && (
                    <div className="rounded-lg bg-black/20 px-2 py-1.5">
                      <p className="text-white/60 text-[11px]">Check-In</p>
                      <p className="text-white font-semibold text-xs">{checkinLabel}</p>
                    </div>
                  )}
                  {checkoutLabel && (
                    <div className="rounded-lg bg-black/20 px-2 py-1.5">
                      <p className="text-white/60 text-[11px]">Check-Out</p>
                      <p className="text-white font-semibold text-xs">{checkoutLabel}</p>
                    </div>
                  )}
                </div>
              )}
              {showHotelCard && (
                <button
                  onClick={(e) => { e.stopPropagation(); setHotelModalOpen(true); }}
                  className="mt-2 w-full rounded-lg border border-blue-400/40 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-200 transition-transform active:scale-95 hover:bg-blue-500/25"
                >
                  🏨 View Orleans Hotel Info, Fees &amp; Policies
                </button>
              )}
            </div>
          )}

          {!hasHotel && (ev?.registrationDay || ev?.registrationTime) && (
            <div className="flex items-center gap-3">
              <span className="text-lg">📝</span>
              <div>
                <p className="text-white/75 text-xs">Bowling Registration</p>
                <p className="text-white font-semibold text-sm">{[ev?.registrationDay, ev?.registrationTime].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          )}

          {ev?.tshirtsProvided ? (
            <div className="flex items-center gap-3">
              <span className="text-lg">👕</span>
              <div>
                <p className="text-white/75 text-xs">T-Shirt Pickup</p>
                <p className="text-white font-semibold text-sm">{[ev?.tshirtPickupLocation, ev?.tshirtPickupTime].filter(Boolean).join(" · ") || "See your team captain"}</p>
              </div>
            </div>
          ) : null}

          {ev?.poolPartyEnabled ? (
            <div className="flex items-center gap-3">
              <span className="text-lg">🏖️</span>
              <div>
                <p className="text-white/75 text-xs">Pool Party</p>
                <p className="text-white font-semibold text-sm">{ev?.poolPartyTime ? `Check-in begins at ${ev.poolPartyTime}` : "Time to be announced"}</p>
              </div>
            </div>
          ) : null}

          {laneNumber && (
            <div className="flex items-center gap-3">
              <span className="text-lg">🎳</span>
              <div>
                <p className="text-white/75 text-xs">Your Starting Lane</p>
                <p className="text-white font-bold text-base">Lane {laneNumber}</p>
              </div>
            </div>
          )}
          {squadTime && (
            <div className="flex items-center gap-3">
              <span className="text-lg">🕐</span>
              <div>
                <p className="text-white/75 text-xs">Squad Time</p>
                <p className="text-white font-semibold text-sm">{normalizeSquadTime(squadTime)}</p>
              </div>
            </div>
          )}
          {laneToEvent && (
            <div className="flex items-start gap-3">
              <span className="text-lg">📍</span>
              <div>
                <p className="text-white/75 text-xs">Lane to Banquet Directions</p>
                <p className="text-amber-200 font-semibold text-sm leading-relaxed">{laneToEvent}</p>
              </div>
            </div>
          )}

          {hasBanquet && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-amber-300 text-xs font-semibold mb-2">🍽️ Banquet Dinner Assignment</p>
              <div className="space-y-1.5">
                {ev?.banquetDay && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <div>
                      <p className="text-white/60 text-xs">Banquet Day</p>
                      <p className="text-white font-semibold text-sm">{ev.banquetDay}</p>
                    </div>
                  </div>
                )}
                {banquetLocation && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">📍</span>
                    <div>
                      <p className="text-white/60 text-xs">Banquet Location</p>
                      <p className="text-white font-semibold text-sm">{banquetLocation}</p>
                    </div>
                  </div>
                )}
                {banquetTime && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">🕐</span>
                    <div>
                      <p className="text-white/60 text-xs">Dinner Time</p>
                      <p className="text-white font-semibold text-sm">{banquetTime}</p>
                    </div>
                  </div>
                )}
                {banquetTable && (
                  <div className="flex items-center gap-2">
                    <span className="text-base">🪑</span>
                    <div>
                      <p className="text-white/60 text-xs">Your Table</p>
                      <p className="text-amber-300 font-bold text-base">Table {banquetTable}</p>
                      <p className="text-white/50 text-xs">Choose any available seat at your table</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {checkoutLabel && (
            <div className="flex items-center gap-3">
              <span className="text-lg">🧳</span>
              <div>
                <p className="text-white/75 text-xs">Hotel Check-Out</p>
                <p className="text-white font-semibold text-sm">{checkoutLabel}</p>
              </div>
            </div>
          )}

          <div className="mt-3 space-y-2">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-amber-300 text-xs font-semibold mb-1">⏰ Arrive 30 Minutes Early</p>
              <p className="text-white/70 text-xs leading-relaxed">
                Lines can be long at event entry. Please plan to arrive at least 30 minutes before your squad time.
                Have your QR Passport ready on your phone for quick scanning at the door.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
              <p className="text-cyan-300 text-xs font-semibold mb-1">🎳 Practice Reminder</p>
              <p className="text-white/70 text-xs leading-relaxed">
                Practice begins <span className="text-white font-semibold">10 minutes before</span> your squad time. Don't be late!
              </p>
            </div>
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <p className="text-purple-300 text-xs font-semibold mb-1">🏆 Side Pots &amp; Brackets</p>
              <p className="text-white/70 text-xs leading-relaxed">
                Side pots and brackets are available at the <span className="text-white font-semibold">front desk</span>. See the desk before your squad begins.
              </p>
            </div>
          </div>
        </div>
      </div>
      <OrleansHotelModal open={hotelModalOpen} onClose={() => setHotelModalOpen(false)} checkinLabel={checkinLabel} checkoutLabel={checkoutLabel} />
    </div>
  );
}

export default LaneToBanquetPlacard;
