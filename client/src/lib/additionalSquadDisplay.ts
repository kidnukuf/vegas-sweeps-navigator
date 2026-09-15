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
  if (laneNumber2) {
    return {
      label: normalizeSquadTime(squadTime2) || "2nd Squad",
      value: `Lane ${laneNumber2}`,
      icon: "lane",
    };
  }

  if (squadTime2) {
    return {
      label: "2nd Squad Time",
      value: normalizeSquadTime(squadTime2),
      icon: "time",
    };
  }

  return null;
}

export default getAdditionalSquadDisplay;
