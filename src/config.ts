import { resolve } from "path";

export interface PublishPipeConfig {
  /** Template folder name from templates/ */
  template?: string;
  /** Show a dedicated title page (uses frontmatter title/subtitle/author/date) */
  titlePage?: boolean;
  /** Theme: "light" or "dark" */
  theme?: "light" | "dark";
  /** Page layout */
  page?: {
    /** Paper size: "A4", "letter", etc. */
    size?: string;
    /** CSS margin string, e.g. "2.5cm 2cm" */
    margin?: string;
  };
  /** Single markdown file path */
  content?: string;
  /** Ordered list of markdown files (multi-chapter) */
  chapters?: string[];
  /** Show a Dutch proposal cover page (sethdev template) */
  proposal?: boolean;
  /** Default frontmatter values (overridden by markdown frontmatter) */
  frontmatter?: Record<string, unknown>;
  /** Output PDF filename */
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
    const mod = await import(configPath);
    return mod.default ?? {};
  } catch (err) {
    console.error(`Failed to load ${CONFIG_FILENAME}:`, err);
    return {};
  }
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
