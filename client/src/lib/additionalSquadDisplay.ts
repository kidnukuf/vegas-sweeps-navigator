import { normalizeSquadTime } from "@/lib/squadTime";

export type AdditionalSquadDisplay = {
  label: string;
  value: string;
  icon: "lane" | "time";
} | null;

/**
 * Column X supplies the second-squad day/time shown as the identifier, while
 * Column Y remains the lane assignment shown beneath it.
 */
export function getAdditionalSquadDisplay(
  squadTime2: string | null | undefined,
  laneNumber2: number | null | undefined,
): AdditionalSquadDisplay {
  const rawSquadTime = String(squadTime2 ?? "").trim();
  if (!rawSquadTime) return null;

  const normalizedSquadTime = normalizeSquadTime(rawSquadTime);
  if (laneNumber2) {
    return {
      label: normalizedSquadTime,
      value: `Lane ${laneNumber2}`,
      icon: "lane",
    };
  }

  if (rawSquadTime) {
    return {
      label: "2nd Squad Time",
      value: normalizedSquadTime,
      icon: "time",
    };
  }

  return null;
}

export default getAdditionalSquadDisplay;
