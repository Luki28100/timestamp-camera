// Date formatting with moment-style tokens. Kept dependency-free and German by
// default; literal text can be escaped with [square brackets].

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const DAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const DAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Date-time group (NATO) uses the English three-letter month in capitals.
const MONTHS_DTG = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

// Longest tokens first — the regex alternation is tried left to right.
const TOKEN_RE =
  /\[([^\]]*)\]|YYYY|YY|MON|MMMM|MMM|MM|M|DD|D|dddd|ddd|dd|HH|H|hh|h|mm|m|SSS|ss|s|A|a|ZZ|Z|X/g;

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

/**
 * NATO time zone letter: A..I and K..M east of UTC, N..Y west of it, Z for UTC.
 * J stands for local time and is used here for zones offset by half an hour,
 * which have no letter of their own.
 */
export function natoZoneLetter(date: Date): string {
  const offset = -date.getTimezoneOffset();
  if (offset % 60 !== 0) return "J";
  const hours = offset / 60;
  if (hours === 0) return "Z";
  if (hours > 0 && hours <= 12) return "ABCDEFGHIKLM"[hours - 1];
  if (hours < 0 && hours >= -12) return "NOPQRSTUVWXY"[-hours - 1];
  return "J";
}

/** "GMT+2" / "GMT-5:30" — the compact form shown next to the time. */
export function timezoneLabel(date: Date): string {
  const total = -date.getTimezoneOffset();
  const sign = total < 0 ? "-" : "+";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${pad(m)}` : ""}`;
}

/** "+02:00" — the ISO form. */
export function timezoneOffset(date: Date): string {
  const total = -date.getTimezoneOffset();
  const sign = total < 0 ? "-" : "+";
  const abs = Math.abs(total);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Formats `date` with moment-style tokens. A pattern starting with `!` is
 * rendered in UTC — needed for the Zulu form of a date-time group.
 */
export function formatDate(date: Date, pattern: string): string {
  const asUtc = pattern.startsWith("!");
  const body = asUtc ? pattern.slice(1) : pattern;
  // Shifting the instant lets every local getter below read UTC components.
  const d = asUtc ? new Date(date.getTime() + date.getTimezoneOffset() * 60_000) : date;

  const zoneLabel = asUtc ? "UTC" : timezoneLabel(date);
  const zoneOffset = asUtc ? "+00:00" : timezoneOffset(date);
  const zoneLetter = asUtc ? "Z" : natoZoneLetter(date);

  const h24 = d.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;

  return body.replace(TOKEN_RE, (token, literal?: string) => {
    if (literal !== undefined) return literal;
    switch (token) {
      case "YYYY":
        return String(d.getFullYear());
      case "YY":
        return pad(d.getFullYear() % 100);
      case "MON":
        return MONTHS_DTG[d.getMonth()];
      case "MMMM":
        return MONTHS[d.getMonth()];
      case "MMM":
        return MONTHS_SHORT[d.getMonth()];
      case "MM":
        return pad(d.getMonth() + 1);
      case "M":
        return String(d.getMonth() + 1);
      case "DD":
        return pad(d.getDate());
      case "D":
        return String(d.getDate());
      case "dddd":
        return DAYS[d.getDay()];
      case "ddd":
      case "dd":
        return DAYS_SHORT[d.getDay()];
      case "HH":
        return pad(h24);
      case "H":
        return String(h24);
      case "hh":
        return pad(h12);
      case "h":
        return String(h12);
      case "mm":
        return pad(d.getMinutes());
      case "m":
        return String(d.getMinutes());
      case "ss":
        return pad(d.getSeconds());
      case "s":
        return String(d.getSeconds());
      case "SSS":
        return pad(d.getMilliseconds(), 3);
      case "A":
        return h24 < 12 ? "AM" : "PM";
      case "a":
        return h24 < 12 ? "am" : "pm";
      case "ZZ":
        return zoneOffset;
      case "Z":
        return zoneLabel;
      case "X":
        return zoneLetter;
      default:
        return token;
    }
  });
}

export interface FormatPreset {
  label: string;
  pattern: string;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  { label: "31.12.2025 14:05:09", pattern: "DD.MM.YYYY HH:mm:ss" },
  { label: "31.12.2025 14:05", pattern: "DD.MM.YYYY HH:mm" },
  { label: "2025-12-31 14:05:09", pattern: "YYYY-MM-DD HH:mm:ss" },
  { label: "31/12/2025 02:05:09 PM", pattern: "DD/MM/YYYY hh:mm:ss A" },
  { label: "12/31/2025 2:05 PM", pattern: "MM/DD/YYYY h:mm A" },
  { label: "31. Dezember 2025, 14:05", pattern: "D. MMMM YYYY[,] HH:mm" },
  { label: "31 Dez 2025 14:05", pattern: "DD MMM YYYY HH:mm" },
  { label: "14:05:09", pattern: "HH:mm:ss" },
  // BOS "taktische Zeit" is day + hour + minute, no zone letter. The NATO
  // date-time group with its zone letter is offered separately as DTG.
  { label: "311405 · taktisch", pattern: "DDHHmm" },
  { label: "311405 Dez 25 · taktisch lang", pattern: "DDHHmm MMM YY" },
  { label: "311405A DEC 25 · DTG", pattern: "DDHHmmX MON YY" },
];

/** Filename-safe stamp, e.g. 20251231_140509. */
export function fileStamp(date: Date): string {
  return formatDate(date, "YYYYMMDD_HHmmss");
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad(m)}:${pad(s)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
