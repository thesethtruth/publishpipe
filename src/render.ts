import matter from "gray-matter";
import { marked } from "marked";
import nunjucks from "nunjucks";
import { resolve } from "path";
import type { PublishPipeConfig } from "./config";
import { createTemplateEnvironment, resolveTemplateVariables } from "./variables";

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

/** Read and concatenate multiple chapter files. First file's frontmatter is used as document metadata. */
async function readChapters(
  chapterPaths: string[],
  cwd: string
): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  const bodies: string[] = [];
  let frontmatter: Record<string, unknown> = {};

  for (let i = 0; i < chapterPaths.length; i++) {
    const absPath = resolve(cwd, chapterPaths[i]);
    const { frontmatter: fm, body } = await readMarkdown(absPath);

    if (i === 0) {
      frontmatter = fm;
    }

    bodies.push(body);
  }

  return { frontmatter, body: bodies.join("\n\n---\n\n") };
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const config = opts.config ?? {};
  let frontmatter: Record<string, unknown>;
  let mdBody: string;

  if (config.chapters?.length) {
    // Multi-chapter mode
    const result = await readChapters(config.chapters, opts.cwd ?? process.cwd());
    frontmatter = result.frontmatter;
    mdBody = result.body;
  } else if (opts.markdownPath) {
    // Single-file mode
    const result = await readMarkdown(opts.markdownPath);
    frontmatter = result.frontmatter;
    mdBody = result.body;
  } else {
    throw new Error("No content source: provide markdownPath or config.chapters");
  }

  const templateVars = resolveTemplateVariables(config, frontmatter, opts.variables);

  // Render markdown as a template first, then convert markdown to HTML
  const markdownEnv = createTemplateEnvironment();
  const renderedMdBody = markdownEnv.renderString(mdBody, templateVars);
  const contentHtml = await marked(renderedMdBody);

  // Load and render Nunjucks template
  const templatePath = resolve(opts.templateDir, opts.templateName);
  const env = createTemplateEnvironment(new nunjucks.FileSystemLoader(templatePath));

  // Read template's style.css (with @extends support)
  const templateCss = await loadTemplateCss(opts.templateDir, opts.templateName);

  const html = env.render("template.njk", {
    content: contentHtml,
    css: templateCss,
    titlePage: config.titlePage ?? false,
    proposal: config.proposal ?? false,
    theme: config.theme ?? "light",
    pageSize: config.page?.size ?? "A4",
    pageMargin: config.page?.margin ?? "2.5cm 2cm 2cm 2cm",
    ...templateVars,
  });

  return { html, frontmatter, variables: templateVars };
}
