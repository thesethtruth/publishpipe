import { marked } from "marked";
import type { PublishPipeConfig, Theme } from "../config";
import { loadDocumentFromInput } from "../content/load";
import { createTemplateEnv, loadTemplateCss } from "../presentation/template";
import type { PresentationModel } from "../presentation/model";
import type { RenderProfile } from "./profile";

export interface HtmlRenderOptions {
  markdownPath?: string;
  templateName: string;
  templateDir: string;
  config?: PublishPipeConfig;
  cwd?: string;
  profile?: RenderProfile;
}

export interface HtmlRenderResult {
  html: string;
  frontmatter: Record<string, unknown>;
}

interface TocItem {
  id: string;
  level: number;
  text: string;
}

function buildPresentationModel(config: PublishPipeConfig, frontmatter: Record<string, unknown>): PresentationModel {
  const theme = (config.theme ?? "light") as Theme;
  return {
    templateName: config.template ?? "default",
    theme,
    titlePage: config.titlePage ?? false,
    proposal: config.proposal ?? false,
    pageSize: config.page?.size ?? "A4",
    pageMargin: config.page?.margin ?? "2.5cm 2cm 2cm 2cm",
    templateVars: {
      ...config.frontmatter,
      ...frontmatter,
    },
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function enrichHeadings(contentHtml: string): { html: string; toc: TocItem[] } {
  const counts = new Map<string, number>();
  const toc: TocItem[] = [];

  const html = contentHtml.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_match, levelRaw, innerHtml) => {
    const level = parseInt(levelRaw, 10);
    const text = innerHtml.replace(/<[^>]+>/g, "").trim();
    const base = slugify(text) || "section";
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;

    if (level <= 2 && text) {
      toc.push({ id, level, text });
    }

    return `<h${level} id="${id}">${innerHtml}</h${level}>`;
  });

  return { html, toc };
}

function renderInteractiveShell(contentHtml: string, toc: TocItem[], tocEnabled: boolean): string {
  if (!tocEnabled || toc.length === 0) {
    return `<article class="doc-body">${contentHtml}</article>`;
  }

  const tocList = toc
    .map((item) => `<li class="doc-toc-item level-${item.level}"><a href="#${item.id}">${item.text}</a></li>`)
    .join("");

  return `
<div class="doc-shell">
  <aside class="doc-toc">
    <h2 class="doc-toc-title">Contents</h2>
    <ol>${tocList}</ol>
  </aside>
  <article class="doc-body">${contentHtml}</article>
</div>`;
}

function renderPdfContent(contentHtml: string, toc: TocItem[], tocEnabled: boolean): string {
  if (!tocEnabled || toc.length === 0) {
    return contentHtml;
  }

  const tocItems = toc.some((item) => item.level === 1)
    ? toc.filter((item) => item.level === 1)
    : toc;

  const tocList = tocItems
    .map((item) => `<li><a href="#${item.id}">${item.text}</a></li>`)
    .join("");

  if (!tocList) {
    return contentHtml;
  }

  return `
<section class="toc-page">
  <h1>Contents</h1>
  <ol>${tocList}</ol>
</section>
${contentHtml}`;
}

export async function renderHtml(opts: HtmlRenderOptions): Promise<HtmlRenderResult> {
  const config = opts.config ?? {};
  const cwd = opts.cwd ?? process.cwd();
  const profile: RenderProfile = opts.profile ?? "interactive";

  const document = await loadDocumentFromInput({
    markdownPath: opts.markdownPath,
    chapters: config.chapters,
    cwd,
  });

  const rawHtml = await marked(document.markdown);
  const { html: htmlWithHeadingIds, toc } = enrichHeadings(rawHtml);
  const tocEnabled = config.toc ?? true;
  const contentHtml =
    profile === "pdf"
      ? renderPdfContent(htmlWithHeadingIds, toc, tocEnabled)
      : renderInteractiveShell(htmlWithHeadingIds, toc, tocEnabled);
  const presentation = buildPresentationModel(config, document.frontmatter);
  const env = createTemplateEnv(opts.templateDir, opts.templateName);
  const templateCss = await loadTemplateCss(opts.templateDir, opts.templateName);

  const html = env.render("template.njk", {
    content: contentHtml,
    css: templateCss,
    titlePage: presentation.titlePage,
    proposal: presentation.proposal,
    theme: presentation.theme,
    pageSize: presentation.pageSize,
    pageMargin: presentation.pageMargin,
    ...presentation.templateVars,
  });

  return {
    html,
    frontmatter: document.frontmatter,
  };
}
