const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export function formatMissingVariableWarning(context: string, missing: string[]): string {
  const icon = "⚠️";
  const header = `${YELLOW}${BOLD}${icon} [publishpipe] Missing template variables in ${context} (${missing.length})${RESET}`;
  const lines = missing.map((item) => `${YELLOW}  - ${item}${RESET}`).join("\n");
  return `${header}\n${lines}`;
}
