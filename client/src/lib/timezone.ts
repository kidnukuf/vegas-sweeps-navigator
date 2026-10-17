export const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

const timeOptions: Intl.DateTimeFormatOptions = {
  timeZone: PACIFIC_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
};

const dateOptions: Intl.DateTimeFormatOptions = {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
};

export function formatPacificDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-US", dateTimeOptions);
}

export function formatPacificTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("en-US", timeOptions);
}

export function formatPacificDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", dateOptions);
}
