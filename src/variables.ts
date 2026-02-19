import nunjucks from "nunjucks";
import type { PublishPipeConfig } from "./config";

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

function coerceTemplateValue(value: unknown): unknown {
  if (typeof value === "string") {
    return parseDdMmYyyy(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => coerceTemplateValue(item));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, coerceTemplateValue(nested)])
    );
  }
  return value;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date, format: string): string {
  const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthNamesLong = [
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
  ];

  const replacements: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: monthNamesLong[date.getMonth()],
    MMM: monthNamesShort[date.getMonth()],
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
  };

  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, (token) => replacements[token] ?? token);
}

export function createTemplateEnvironment(loader?: nunjucks.Loader): nunjucks.Environment {
  const env = new nunjucks.Environment(loader ?? undefined, { autoescape: false });

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

    return formatDate(value, outputFormat);
  });

  return env;
}

export function resolveTemplateVariables(
  config: PublishPipeConfig,
  frontmatter: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return coerceTemplateValue({
    ...config.variables,
    ...config.frontmatter,
    ...frontmatter,
    ...extra,
  }) as Record<string, unknown>;
}

export function renderTemplateString(
  template: string,
  variables: Record<string, unknown>
): string {
  const env = createTemplateEnvironment();
  return env.renderString(template, variables);
}
