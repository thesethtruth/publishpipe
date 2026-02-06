export interface TocItem {
  id: string;
  level: number;
  text: string;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function iconList(): string {
  return `<svg class="lucide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
}

function iconChevronDown(): string {
  return `<svg class="lucide-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
}

function renderTocHeaderMenu(toc: TocItem[]): string {
  const tocList = toc
    .map((item) => `<li class="doc-toc-item level-${item.level}"><a href="#${item.id}">${item.text}</a></li>`)
    .join("");

  return `
<details class="doc-menu">
  <summary>
    ${iconList()}
    <span>Contents</span>
    ${iconChevronDown()}
  </summary>
  <ol>${tocList}</ol>
</details>`;
}

export function renderContextHeader(opts: {
  toc: TocItem[];
  tocEnabled: boolean;
  pageMenuHtml?: string;
}): string {
  const controls: string[] = [];

  if (opts.pageMenuHtml) {
    controls.push(opts.pageMenuHtml);
  }

  if (opts.tocEnabled && opts.toc.length > 0) {
    controls.push(renderTocHeaderMenu(opts.toc));
  }

  if (controls.length === 0) {
    return "";
  }

  return `<header class="doc-context-header"><div class="doc-context-controls">${controls.join("")}</div></header>`;
}

export function enrichHeadings(contentHtml: string): { html: string; toc: TocItem[] } {
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

export function renderInteractiveShell(contentHtml: string, toc: TocItem[], tocEnabled: boolean): string {
  const header = renderContextHeader({ toc, tocEnabled });
  return `
<div class="doc-shell">
  <div class="doc-main">${header}<article class="doc-body">${contentHtml}</article></div>
</div>`;
}

export function renderPdfContent(contentHtml: string, toc: TocItem[], tocEnabled: boolean): string {
  if (!tocEnabled || toc.length === 0) {
    return contentHtml;
  }

  const tocItems = toc.some((item) => item.level === 1) ? toc.filter((item) => item.level === 1) : toc;

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
