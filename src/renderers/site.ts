import { mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { marked } from "marked";
import type { PublishPipeConfig, Theme } from "../config";
import { loadDocumentFromInput, readMarkdownFile, splitMarkdownByH1, type MarkdownDocument } from "../content/load";
import { createTemplateEnv, loadTemplateCss } from "../presentation/template";
import { enrichHeadings, renderContextHeader, slugify } from "../presentation/structured-content";

type SplitOn = "chapters" | "h1" | "both";

type SitePageKind = "content" | "proposal-cover";

interface SitePage {
  title: string;
  slug: string;
  markdown: string;
  kind: SitePageKind;
}

export interface BuildSiteOptions {
  markdownPath?: string;
  templateName: string;
  templateDir: string;
  config?: PublishPipeConfig;
  cwd?: string;
  outputDir: string;
  splitOn: SplitOn;
}

function iconBookOpen(): string {
  return `<svg class="lucide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18c0-1.66 1.34-3 3-3h6"></path><path d="M21 18c0-1.66-1.34-3-3-3h-6"></path><path d="M3 6c0-1.66 1.34-3 3-3h6v12H6c-1.66 0-3 1.34-3 3z"></path><path d="M21 6c0-1.66-1.34-3-3-3h-6v12h6c1.66 0 3 1.34 3 3z"></path></svg>`;
}

function iconChevronDown(): string {
  return `<svg class="lucide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
}

function getTitleFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? (match[1] ?? "").trim() : null;
}

function toSitePagesFromChapters(chapters: MarkdownDocument[]): SitePage[] {
  return chapters.map((chapter, index) => {
    const title =
      (chapter.frontmatter.title as string | undefined) ??
      getTitleFromMarkdown(chapter.body) ??
      `Chapter ${index + 1}`;
    return {
      title,
      slug: "",
      markdown: chapter.body,
      kind: "content",
    };
  });
}

function toSitePagesFromH1(markdown: string): SitePage[] {
  const sections = splitMarkdownByH1(markdown);
  if (sections.length === 0) {
    return [{ title: "Document", slug: "", markdown, kind: "content" }];
  }

  return sections.map((section) => ({
    title: section.title,
    slug: "",
    markdown: section.markdown,
    kind: "content",
  }));
}

function toSitePagesFromChaptersAndH1(chapters: MarkdownDocument[]): SitePage[] {
  const pages: SitePage[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (!chapter) {
      continue;
    }

    const sections = splitMarkdownByH1(chapter.body);
    if (sections.length <= 1) {
      const title =
        (chapter.frontmatter.title as string | undefined) ??
        getTitleFromMarkdown(chapter.body) ??
        `Chapter ${i + 1}`;
      pages.push({ title, slug: "", markdown: chapter.body, kind: "content" });
      continue;
    }

    for (const section of sections) {
      pages.push({
        title: section.title,
        slug: "",
        markdown: section.markdown,
        kind: "content",
      });
    }
  }

  return pages;
}

function withPageSlugs(pages: SitePage[]): SitePage[] {
  return pages.map((page, index) => {
    if (page.kind === "proposal-cover") {
      return { ...page, slug: "00-proposal-cover" };
    }

    return {
      ...page,
      slug: `${String(index + 1).padStart(2, "0")}-${slugify(page.title) || `section-${index + 1}`}`,
    };
  });
}

function renderPageSidebar(pages: Array<{ title: string; href: string }>, currentHref: string): string {
  if (pages.length <= 1) {
    return "";
  }

  const links = pages
    .map((page) => {
      const currentClass = page.href === currentHref ? ' class="current"' : "";
      return `<li${currentClass}><a href="${page.href}">${page.title}</a></li>`;
    })
    .join("");

  return `<aside class="doc-pages"><h2 class="doc-pages-title">Pages</h2><ol>${links}</ol></aside>`;
}

function renderPageHeaderMenu(pages: Array<{ title: string; href: string }>, currentHref: string): string | undefined {
  if (pages.length <= 1) {
    return undefined;
  }

  const links = pages
    .map((page) => {
      const currentClass = page.href === currentHref ? ' class="current"' : "";
      return `<li${currentClass}><a href="${page.href}">${page.title}</a></li>`;
    })
    .join("");

  return `
<details class="doc-menu doc-pages-menu">
  <summary>
    ${iconBookOpen()}
    <span>Pages</span>
    ${iconChevronDown()}
  </summary>
  <ol>${links}</ol>
</details>`;
}

function renderPageNav(
  prev: { href: string; title: string } | undefined,
  next: { href: string; title: string } | undefined
): string {
  if (!prev && !next) {
    return "";
  }

  const prevLink = prev ? `<a class="prev" href="${prev.href}">← ${prev.title}</a>` : "<span></span>";
  const nextLink = next ? `<a class="next" href="${next.href}">${next.title} →</a>` : "<span></span>";
  return `<nav class="doc-page-nav">${prevLink}${nextLink}</nav>`;
}

export async function buildMultipageSite(opts: BuildSiteOptions): Promise<string[]> {
  const config = opts.config ?? {};
  const cwd = opts.cwd ?? process.cwd();
  const tocEnabled = config.toc ?? true;

  const templateCss = await loadTemplateCss(opts.templateDir, opts.templateName);
  const env = createTemplateEnv(opts.templateDir, opts.templateName);

  const frontmatterSource = await loadDocumentFromInput({
    markdownPath: opts.markdownPath,
    chapters: config.chapters,
    cwd,
  });

  let pages: SitePage[] = [];

  if ((opts.splitOn === "chapters" || opts.splitOn === "both") && config.chapters?.length) {
    const chapters: MarkdownDocument[] = [];
    for (const chapter of config.chapters) {
      if (!chapter) {
        continue;
      }
      chapters.push(await readMarkdownFile(resolve(cwd, chapter)));
    }

    pages = opts.splitOn === "both" ? toSitePagesFromChaptersAndH1(chapters) : toSitePagesFromChapters(chapters);
  } else {
    pages = toSitePagesFromH1(frontmatterSource.markdown);
  }

  if (pages.length === 0) {
    pages = [{ title: "Document", slug: "", markdown: frontmatterSource.markdown, kind: "content" }];
  }

  if (config.proposal) {
    pages = [
      {
        title: "Proposal Cover",
        slug: "",
        markdown: "",
        kind: "proposal-cover",
      },
      ...pages,
    ];
  }

  pages = withPageSlugs(pages);

  await mkdir(opts.outputDir, { recursive: true });

  const pageRefs = pages.map((page, i) => ({
    title: page.title,
    href: i === 0 ? "index.html" : `${page.slug}.html`,
  }));

  const writtenPaths: string[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const ref = pageRefs[i];
    if (!page || !ref) {
      continue;
    }

    const prev = i > 0 ? pageRefs[i - 1] : undefined;
    const next = i < pageRefs.length - 1 ? pageRefs[i + 1] : undefined;

    const rawPageHtml = page.kind === "proposal-cover" ? "" : await marked(page.markdown);
    const enriched = enrichHeadings(rawPageHtml);
    const pageNav = page.kind === "proposal-cover" ? "" : renderPageNav(prev, next);
    const pageSidebar = renderPageSidebar(pageRefs, ref.href);
    const pageMenuHtml = renderPageHeaderMenu(pageRefs, ref.href);
    const contextHeader = renderContextHeader({
      toc: enriched.toc,
      tocEnabled: page.kind !== "proposal-cover" && tocEnabled,
      pageMenuHtml,
    });

    const wrappedContent = `
<div class="doc-shell doc-shell-multipage ${pageSidebar ? "has-pages" : ""}">
  ${pageSidebar}
  <div class="doc-main">${contextHeader}<article class="doc-body">${enriched.html}${pageNav}</article></div>
</div>`;

    const html = env.render("template.njk", {
      content: wrappedContent,
      css: templateCss,
      titlePage: false,
      proposal: page.kind === "proposal-cover",
      theme: (config.theme ?? "light") as Theme,
      pageSize: config.page?.size ?? "A4",
      pageMargin: config.page?.margin ?? "2.5cm 2cm 2cm 2cm",
      ...config.frontmatter,
      ...frontmatterSource.frontmatter,
      title: page.title,
    });

    const outputPath = resolve(opts.outputDir, ref.href);
    await mkdir(dirname(outputPath), { recursive: true });
    await Bun.write(outputPath, html);
    writtenPaths.push(outputPath);
  }

  return writtenPaths;
}
