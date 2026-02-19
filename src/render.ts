import matter from "gray-matter";
import { marked } from "marked";
import nunjucks from "nunjucks";
import { resolve } from "path";
import type { PublishPipeConfig } from "./config";
import {
  createTemplateEnvironment,
  findMissingTemplateVariables,
  findMissingTemplateVariablesInActiveTree,
  resolveTemplateVariables,
} from "./variables";
import { formatMissingVariableWarning } from "./warn";

export interface RenderOptions {
  /** Single markdown file path (used when no chapters) */
  markdownPath?: string;
  templateName: string;
  templateDir: string;
  /** Full config (chapters, titlePage, theme, page, etc.) */
  config?: PublishPipeConfig;
  /** Base directory for resolving relative chapter paths */
  cwd?: string;
  /** Extra variables available in markdown/template rendering (e.g. fn) */
  variables?: Record<string, unknown>;
}

export interface RenderResult {
  html: string;
  frontmatter: Record<string, unknown>;
  variables: Record<string, unknown>;
}

function warnMissingVariables(context: string, missing: string[]): void {
  if (missing.length === 0) return;
  console.warn(formatMissingVariableWarning(context, missing));
}

/** Load CSS with support for @extends directive */
async function loadTemplateCss(templateDir: string, templateName: string): Promise<string> {
  const stylePath = resolve(templateDir, templateName, "style.css");
  const styleFile = Bun.file(stylePath);
  if (!(await styleFile.exists())) return "";

  const css = await styleFile.text();

  // Check for @extends directive: /* @extends <parent-template> */
  const extendsMatch = css.match(/^\/\*\s*@extends\s+([\w-]+)\s*\*\//);
  if (extendsMatch) {
    const parentName = extendsMatch[1];
    const parentCss = await loadTemplateCss(templateDir, parentName);
    const childCss = css.replace(/^\/\*\s*@extends\s+[\w-]+\s*\*\/\n?/, "");
    return parentCss + "\n" + childCss;
  }

  return css;
}

/** Read a single markdown file and return frontmatter + body */
async function readMarkdown(
  filePath: string
): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  const raw = await Bun.file(filePath).text();
  const { data, content } = matter(raw);
  return { frontmatter: data, body: content };
}

/** Read chapter files in order with their own frontmatter/body. */
async function readChapters(
  chapterPaths: string[],
  cwd: string
): Promise<Array<{ path: string; frontmatter: Record<string, unknown>; body: string }>> {
  const chapters: Array<{ path: string; frontmatter: Record<string, unknown>; body: string }> = [];

  for (let i = 0; i < chapterPaths.length; i++) {
    const absPath = resolve(cwd, chapterPaths[i]);
    const { frontmatter: fm, body } = await readMarkdown(absPath);
    chapters.push({ path: chapterPaths[i], frontmatter: fm, body });
  }

  return chapters;
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const config = opts.config ?? {};
  const dateLocale = config.date_locale ?? config.dateLocale;
  let frontmatter: Record<string, unknown>;
  let templateVars: Record<string, unknown>;
  let renderedMdBody: string;
  const markdownEnv = createTemplateEnvironment(undefined, { dateLocale });

  if (config.chapters?.length) {
    // Multi-chapter mode
    const chapters = await readChapters(config.chapters, opts.cwd ?? process.cwd());
    frontmatter = chapters[0]?.frontmatter ?? {};

    // Precedence per chapter:
    // config variables (root+project merged) -> first chapter frontmatter -> chapter frontmatter -> runtime vars
    const baseVars = resolveTemplateVariables(config.variables, frontmatter);
    const chapterBodies = chapters.map((chapter) =>
      {
        const chapterVars = resolveTemplateVariables(baseVars, chapter.frontmatter, opts.variables);
        const missing = findMissingTemplateVariables(chapter.body, chapterVars);
        warnMissingVariables(`chapter "${chapter.path}"`, missing);
        return markdownEnv.renderString(chapter.body, chapterVars);
      }
    );
    renderedMdBody = chapterBodies.join("\n\n---\n\n");
    templateVars = resolveTemplateVariables(baseVars, opts.variables);
  } else if (opts.markdownPath) {
    // Single-file mode
    const result = await readMarkdown(opts.markdownPath);
    frontmatter = result.frontmatter;
    templateVars = resolveTemplateVariables(config.variables, frontmatter, opts.variables);
    const missing = findMissingTemplateVariables(result.body, templateVars);
    warnMissingVariables(`"${opts.markdownPath}"`, missing);
    renderedMdBody = markdownEnv.renderString(result.body, templateVars);
  } else {
    throw new Error("No content source: provide markdownPath or config.chapters");
  }

  // Convert templated markdown to HTML
  const contentHtml = await marked(renderedMdBody);

  // Load and render Nunjucks template
  const templatePath = resolve(opts.templateDir, opts.templateName);
  const env = createTemplateEnvironment(new nunjucks.FileSystemLoader(templatePath), {
    dateLocale,
  });

  // Read template's style.css (with @extends support)
  const templateCss = await loadTemplateCss(opts.templateDir, opts.templateName);

  const renderData = {
    content: contentHtml,
    css: templateCss,
    titlePage: config.titlePage ?? false,
    proposal: config.proposal ?? false,
    theme: config.theme ?? "light",
    pageSize: config.page?.size ?? "A4",
    pageMargin: config.page?.margin ?? "2.5cm 2cm 2cm 2cm",
    ...templateVars,
  };

  const templateFilePath = resolve(templatePath, "template.njk");
  const templateSource = await Bun.file(templateFilePath).text();
  const missingTemplateVars = await findMissingTemplateVariablesInActiveTree(
    templateSource,
    renderData,
    async (name: string) => {
      const includePath = resolve(templatePath, name);
      const includeFile = Bun.file(includePath);
      if (!(await includeFile.exists())) return null;
      return await includeFile.text();
    }
  );
  warnMissingVariables(`template "${opts.templateName}/template.njk"`, missingTemplateVars);

  const html = env.render("template.njk", renderData);

  return { html, frontmatter, variables: templateVars };
}
