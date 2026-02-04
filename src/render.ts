import matter from "gray-matter";
import { marked } from "marked";
import nunjucks from "nunjucks";
import { resolve } from "path";
import type { PublishPipeConfig } from "./config";

export interface RenderOptions {
  /** Single markdown file path (used when no chapters) */
  markdownPath?: string;
  templateName: string;
  templateDir: string;
  /** Full config (chapters, titlePage, theme, page, etc.) */
  config?: PublishPipeConfig;
  /** Base directory for resolving relative chapter paths */
  cwd?: string;
}

export interface RenderResult {
  html: string;
  frontmatter: Record<string, unknown>;
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

  // Convert markdown to HTML
  const contentHtml = await marked(mdBody);

  // Load and render Nunjucks template
  const templatePath = resolve(opts.templateDir, opts.templateName);
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(templatePath),
    { autoescape: false }
  );

  // Read template's style.css if it exists
  let templateCss = "";
  const stylePath = resolve(templatePath, "style.css");
  const styleFile = Bun.file(stylePath);
  if (await styleFile.exists()) {
    templateCss = await styleFile.text();
  }

  const html = env.render("template.njk", {
    content: contentHtml,
    css: templateCss,
    titlePage: config.titlePage ?? false,
    theme: config.theme ?? "light",
    pageSize: config.page?.size ?? "A4",
    pageMargin: config.page?.margin ?? "2.5cm 2cm 2cm 2cm",
    ...frontmatter,
  });

  return { html, frontmatter };
}
