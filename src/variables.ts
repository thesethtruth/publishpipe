import nunjucks from "nunjucks";

const DATE_DD_MM_YYYY_RE = /^(\d{2})-(\d{2})-(\d{4})$/;

function parseDdMmYyyy(value: string): Date | null {
  const match = value.match(DATE_DD_MM_YYYY_RE);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface TemplateEnvOptions {
  dateLocale?: string;
}

function resolveDateLocale(locale?: string): "en" | "nl" {
  if (!locale) return "en";
  const normalized = locale.toLowerCase();
  if (normalized === "nl" || normalized.startsWith("nl-")) return "nl";
  return "en";
}

function getMonthNames(locale: "en" | "nl"): { short: string[]; long: string[] } {
  if (locale === "nl") {
    return {
      short: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
      long: [
        "januari",
        "februari",
        "maart",
        "april",
        "mei",
        "juni",
        "juli",
        "augustus",
        "september",
        "oktober",
        "november",
        "december",
      ],
    };
  }
  return {
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    long: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
  };
}

function formatDate(date: Date, format: string, locale: "en" | "nl"): string {
  const monthNames = getMonthNames(locale);

  const replacements: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: monthNames.long[date.getMonth()],
    MMM: monthNames.short[date.getMonth()],
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
  };

  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, (token) => replacements[token] ?? token);
}

export function createTemplateEnvironment(
  loader?: nunjucks.Loader,
  options?: TemplateEnvOptions
): nunjucks.Environment {
  const env = new nunjucks.Environment(loader ?? undefined, { autoescape: false });
  const locale = resolveDateLocale(options?.dateLocale);

  env.addFilter("format", (value: unknown, outputFormat = "DD-MM-YYYY") => {
    if (!(value instanceof Date)) {
      if (typeof value === "string") {
        const parsed = parseDdMmYyyy(value);
        if (parsed) value = parsed;
      }
    }

    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return String(value ?? "");
    }

    return formatDate(value, outputFormat, locale);
  });

  return env;
}

export function resolveTemplateVariables(
  ...layers: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  return Object.assign({}, ...layers.filter(Boolean));
}

export function renderTemplateString(
  template: string,
  variables: Record<string, unknown>,
  options?: TemplateEnvOptions
): string {
  const env = createTemplateEnvironment(undefined, options);
  return env.renderString(template, variables);
}
