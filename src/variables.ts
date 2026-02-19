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

const INTERPOLATION_RE = /\{\{\s*([^}]+)\s*\}\}/g;
const KEYWORDS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "and",
  "or",
  "not",
  "in",
  "if",
  "else",
]);

function extractVariablePaths(expr: string): string[] {
  const paths = new Set<string>();
  const primary = expr.split("|")[0]?.trim();
  if (primary && /^[A-Za-z_][\w.]*$/.test(primary) && !KEYWORDS.has(primary)) {
    paths.add(primary);
  }

  // Strip string literals so identifiers inside quotes are ignored.
  let sanitized = expr.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "");
  // Strip filter names after pipes, but keep filter arguments.
  sanitized = sanitized.replace(/\|\s*([A-Za-z_]\w*)/g, "|");

  const tokens = sanitized.match(/[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*/g) ?? [];
  for (const token of tokens) {
    if (!KEYWORDS.has(token)) {
      paths.add(token);
    }
  }

  return Array.from(paths);
}

function hasValueAtPath(values: Record<string, unknown>, path: string): boolean {
  const parts = path.split(".");
  let current: unknown = values;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current !== undefined;
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

export function findMissingTemplateVariables(
  template: string,
  variables: Record<string, unknown>
): string[] {
  const missing = new Set<string>();
  for (const match of template.matchAll(INTERPOLATION_RE)) {
    for (const path of extractVariablePaths(match[1] ?? "")) {
      if (!hasValueAtPath(variables, path)) {
        missing.add(path);
      }
    }
  }
  return Array.from(missing).sort();
}

function asPath(node: any): string | null {
  if (!node) return null;
  if (node.typename === "Symbol" && typeof node.value === "string") {
    return node.value;
  }
  if (node.typename === "LookupVal") {
    const base = asPath(node.target);
    if (!base) return null;
    const keyNode = node.val;
    if (!keyNode) return null;
    if (keyNode.typename === "Symbol" && typeof keyNode.value === "string") {
      return `${base}.${keyNode.value}`;
    }
    if (keyNode.typename === "Literal") {
      return `${base}.${String(keyNode.value)}`;
    }
  }
  return null;
}

function getValueAtPath(values: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = values;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evalExpr(node: any, values: Record<string, unknown>): unknown {
  if (!node) return undefined;
  switch (node.typename) {
    case "Literal":
      return node.value;
    case "Symbol":
      return getValueAtPath(values, node.value);
    case "LookupVal": {
      const path = asPath(node);
      if (path) return getValueAtPath(values, path);
      return undefined;
    }
    case "And":
      return Boolean(evalExpr(node.left, values)) && Boolean(evalExpr(node.right, values));
    case "Or":
      return Boolean(evalExpr(node.left, values)) || Boolean(evalExpr(node.right, values));
    case "Not":
      return !Boolean(evalExpr(node.target, values));
    case "Is": {
      const testName = node.right?.value;
      if (testName === "defined") {
        const path = asPath(node.left);
        if (!path) return evalExpr(node.left, values) !== undefined;
        return hasValueAtPath(values, path);
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function collectPathsFromExpr(node: any, out: Set<string>): void {
  if (!node) return;

  const directPath = asPath(node);
  if (directPath) {
    out.add(directPath);
  }

  if (node.typename === "Filter" && node.name?.value === "default") {
    // {{ var | default("...") }} marks var as optional.
    const args = node.args?.children ?? [];
    for (let i = 1; i < args.length; i++) {
      collectPathsFromExpr(args[i], out);
    }
    return;
  }

  if (node.typename === "NodeList") {
    for (const child of node.children ?? []) {
      collectPathsFromExpr(child, out);
    }
    return;
  }

  if (typeof node.iterFields === "function") {
    node.iterFields((_, value: any) => {
      if (Array.isArray(value)) {
        for (const item of value) collectPathsFromExpr(item, out);
      } else {
        collectPathsFromExpr(value, out);
      }
    });
  }
}

async function collectMissingFromActiveTemplateTree(
  templateSource: string,
  variables: Record<string, unknown>,
  loadTemplateSource: (name: string) => Promise<string | null>,
  seen: Set<string>,
  templateName = "<inline>"
): Promise<Set<string>> {
  const ast = nunjucks.parser.parse(templateSource);
  const missing = new Set<string>();

  const walkNodes = async (nodes: any[]): Promise<void> => {
    for (const node of nodes) {
      if (!node) continue;

      if (node.typename === "If") {
        let current: any = node;
        while (current) {
          const cond = current.cond;
          const branchActive = cond ? Boolean(evalExpr(cond, variables)) : true;
          if (branchActive) {
            await walkNodeList(current.body);
            break;
          }
          const next = current.else_;
          if (!next) break;
          if (next.typename === "If") {
            current = next;
          } else {
            await walkNodeList(next);
            break;
          }
        }
        continue;
      }

      if (node.typename === "Include") {
        const includeName = evalExpr(node.template, variables);
        if (typeof includeName === "string" && includeName.length > 0 && !seen.has(includeName)) {
          seen.add(includeName);
          const source = await loadTemplateSource(includeName);
          if (source) {
            const nestedMissing = await collectMissingFromActiveTemplateTree(
              source,
              variables,
              loadTemplateSource,
              seen,
              includeName
            );
            for (const item of nestedMissing) missing.add(item);
          } else if (!node.ignoreMissing) {
            missing.add(`include:${includeName}`);
          }
        }
        continue;
      }

      if (node.typename === "Output") {
        for (const child of node.children ?? []) {
          const refs = new Set<string>();
          collectPathsFromExpr(child, refs);
          for (const path of refs) {
            if (!hasValueAtPath(variables, path)) {
              missing.add(path);
            }
          }
        }
        continue;
      }

      await walkNodeList(node);
    }
  };

  const walkNodeList = async (node: any): Promise<void> => {
    if (!node) return;
    if (node.typename === "NodeList") {
      await walkNodes(node.children ?? []);
      return;
    }
    if (Array.isArray(node.children)) {
      await walkNodes(node.children);
      return;
    }
    if (typeof node.iterFields === "function") {
      const nested: any[] = [];
      node.iterFields((_, value: any) => {
        if (!value) return;
        if (Array.isArray(value)) nested.push(...value);
        else nested.push(value);
      });
      await walkNodes(nested);
    }
  };

  await walkNodeList(ast);
  return missing;
}

export async function findMissingTemplateVariablesInActiveTree(
  templateSource: string,
  variables: Record<string, unknown>,
  loadTemplateSource: (name: string) => Promise<string | null>
): Promise<string[]> {
  const missing = await collectMissingFromActiveTemplateTree(
    templateSource,
    variables,
    loadTemplateSource,
    new Set()
  );
  return Array.from(missing).sort();
}

export function renderTemplateString(
  template: string,
  variables: Record<string, unknown>,
  options?: TemplateEnvOptions
): string {
  const env = createTemplateEnvironment(undefined, options);
  return env.renderString(template, variables);
}
