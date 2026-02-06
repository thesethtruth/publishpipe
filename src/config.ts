import { resolve } from "path";
import { pathToFileURL } from "url";

export const THEME_VALUES = ["light", "dark"] as const;
export type Theme = (typeof THEME_VALUES)[number];

export interface PublishPipeConfig {
  /** Template folder name from templates/ */
  template?: string;
  /** Show a dedicated title page (uses frontmatter title/subtitle/author/date) */
  titlePage?: boolean;
  /** Theme: "light" or "dark" */
  theme?: Theme;
  /** Page layout */
  page?: {
    /** Paper size: "A4", "letter", etc. */
    size?: string;
    /** CSS margin string, e.g. "2.5cm 2cm" */
    margin?: string;
  };
  /** Single markdown file path */
  content?: string;
  /** Ordered list of markdown files (multi-chapter) - produces single PDF */
  chapters?: string[];
  /** Glob patterns for multi-file output - each matched file becomes a separate PDF */
  source?: string[];
  /** Show a Dutch proposal cover page (sethdev template) */
  proposal?: boolean;
  /** Show generated table of contents wrappers for interactive/pdf renderers */
  toc?: boolean;
  /** Default frontmatter values (overridden by markdown frontmatter) */
  frontmatter?: Record<string, unknown>;
  /** Output PDF filename. Use {{fn}} for source filename without extension. */
  output?: string;
}

/** Identity helper for type-safe config files */
export function defineConfig(config: PublishPipeConfig): PublishPipeConfig {
  return config;
}

const CONFIG_FILENAME = "publishpipe.config.ts";

/** Load config from cwd, returns empty config if file doesn't exist */
export async function loadConfig(cwd: string): Promise<PublishPipeConfig> {
  const configPath = resolve(cwd, CONFIG_FILENAME);
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    return {};
  }

  try {
    // Cache-bust dynamic import so config edits apply during long-running dev sessions.
    const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const configUrl = `${pathToFileURL(configPath).href}?v=${cacheBust}`;
    const mod = await import(configUrl);
    return mod.default ?? {};
  } catch (err) {
    console.error(`Failed to load ${CONFIG_FILENAME}:`, err);
    return {};
  }
}

export function isTheme(value: string): value is Theme {
  return THEME_VALUES.includes(value as Theme);
}

/** Load root config as defaults, then shallow-merge project config on top (with nested merge for `page`) */
export async function loadProjectConfig(
  rootDir: string,
  projectDir: string | null
): Promise<PublishPipeConfig> {
  const rootConfig = await loadConfig(rootDir);
  if (!projectDir || resolve(projectDir) === resolve(rootDir)) {
    return rootConfig;
  }
  const projectConfig = await loadConfig(projectDir);
  return {
    ...rootConfig,
    ...projectConfig,
    page: { ...rootConfig.page, ...projectConfig.page },
    frontmatter: { ...rootConfig.frontmatter, ...projectConfig.frontmatter },
  };
}
