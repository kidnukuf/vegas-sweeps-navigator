export interface EventScheduleConfiguration {
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
}

export interface EventScheduleInput {
  laneToEvent?: string | null;
  laneNumber?: number | null;
  squadTime?: string | null;
  laneNumber2?: number | null;
  squadTime2?: string | null;
  hotelName?: string | null;
  confirmationCode?: string | null;
  checkinDate?: string | null;
  checkoutDate?: string | null;
  roomType?: string | null;
  banquetTable?: string | null;
  banquetLocation?: string | null;
  banquetTime?: string | null;
  eventSettings?: EventScheduleConfiguration | null;
}

export function getEventScheduleState(input: EventScheduleInput) {
  const eventSettings = input.eventSettings;
  const configuredCheckin = [eventSettings?.hotelCheckinDay, eventSettings?.hotelCheckinTime].filter(Boolean).join(" · ");
  const configuredCheckout = [eventSettings?.hotelCheckoutDay, eventSettings?.hotelCheckoutTime].filter(Boolean).join(" · ");
  const checkinLabel = input.checkinDate || configuredCheckin || null;
  const checkoutLabel = input.checkoutDate || configuredCheckout || null;
  const hasHotel = Boolean(input.hotelName || input.confirmationCode || checkinLabel || checkoutLabel || input.roomType);
  const hasBanquet = Boolean(input.banquetTable || input.banquetLocation || input.banquetTime || eventSettings?.banquetDay);
  const hasEventSteps = Boolean(
    eventSettings && (
      eventSettings.registrationDay ||
      eventSettings.registrationTime ||
      eventSettings.poolPartyEnabled ||
      eventSettings.banquetDay ||
      eventSettings.hotelCheckinDay ||
      eventSettings.hotelCheckinTime ||
      eventSettings.hotelCheckoutDay ||
      eventSettings.hotelCheckoutTime
    )
  );
  const hasInfo = Boolean(
    input.laneToEvent || input.laneNumber || input.squadTime || input.laneNumber2 || input.squadTime2 || hasHotel || hasBanquet || hasEventSteps
  );

  return { checkinLabel, checkoutLabel, hasHotel, hasBanquet, hasInfo };
}
