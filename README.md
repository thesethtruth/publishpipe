# publishpipe

Markdown in. Branded HTML out. Print-ready PDF out. One content source, two render targets.

## Philosophy

Most document tooling forces a bad tradeoff: either write fast in Markdown and lose design control, or design precisely and lose writing velocity.

`publishpipe` is built to remove that tradeoff:

- Write in Markdown for speed and focus.
- Apply brand-consistent presentation in HTML/CSS templates.
- Render the same content into:
  - `interactive` HTML for web/static publishing.
  - `pdf` for proposals, reports, and print workflows.

This keeps docs consistent with your web brand while preserving maximum author productivity.

## Architecture

The codebase is organized as three layers:

1. Content model (`src/content/`)
- Parses frontmatter + markdown.
- Resolves chapters and source globs.
- Produces normalized document inputs.

2. Presentation model (`src/presentation/`)
- Loads Nunjucks templates.
- Resolves CSS inheritance (`@extends`) with cycle detection.
- Maps config/frontmatter into template variables.

3. Renderers (`src/renderers/`)
- `html`: renders branded HTML with a profile (`interactive` or `pdf`).
- `pdf`: turns HTML into PDF via `pagedjs-cli`.
- `web`: writes interactive-profile HTML output.

Pipeline: **Markdown** -> **Content model** -> **Presentation model** -> **HTML renderer** -> (**PDF renderer** or **Web renderer**).

### Profile behavior

- `interactive` profile:
  - Heading IDs + sticky context header with TOC menu.
  - Output optimized for web/static hosting.
  - Optional multipage site mode (split by chapters or H1).
  - In multipage mode: page navigation on the left (desktop) and TOC in sticky header menu.
- `pdf` profile:
  - Heading IDs + generated contents page.
  - Output optimized for paged media.

No generic MDX-style component runtime is required; the pipeline stays markdown-first with structural wrappers.

## Install

```bash
bun install
```

## Quick start

Single file preview:

```bash
bun run dev content/example.md
```

Build PDF:

```bash
bun run build content/example.md -o proposal.pdf
```

Build static HTML:

```bash
bun run web content/example.md -o proposal.html
```

## Projects

For larger docs, use project folders in `projects/`:

```text
projects/example-proposal/
  publishpipe.config.ts
  content/
    01-intro.md
    02-background.md
    03-conclusion.md
```

Example project config:

```ts
import { defineConfig } from "../../src/config";

export default defineConfig({
  chapters: [
    "content/01-intro.md",
    "content/02-background.md",
    "content/03-conclusion.md",
  ],
  output: "proposal.pdf",
});
```

Run:

```bash
bun run dev example-proposal
bun run build example-proposal
bun run web example-proposal
```

Target detection: if `target` ends with `.md`, it's treated as a file path; otherwise it's treated as a project name under `projects/`.

## Frontmatter

The first file's frontmatter is used as document metadata:

```yaml
---
title: Project Proposal
subtitle: A thing we should do
author: Your Name
date: February 2026
---
```

These fields feed title pages, running headers, and other template variables.

## Page breaks

Use `---` in markdown to insert a page break:

```md
Content on page one.

---

Content on page two.
```

## Config

Root `publishpipe.config.ts` provides defaults. Project config overrides root values. CLI flags override both.

```ts
import { defineConfig } from "./src/config";

export default defineConfig({
  template: "default",
  titlePage: true,
  theme: "light", // light | dark
  page: {
    size: "A4",
    margin: "2.5cm 2cm",
  },
  content: "doc.md",
  chapters: ["ch1.md", "ch2.md"],
  source: ["content/*.md"],
  output: "{{fn}}.pdf", // use {{fn}} for multi-source
  toc: true,
  web: {
    multipage: true, // default for web output
    splitOn: "both", // "chapters" | "h1" | "both"
  },
});
```

## Multi-file output

Use `source` to render each matched markdown file independently:

```ts
export default defineConfig({
  source: ["content/*.md"],
  output: "report-{{fn}}.pdf",
});
```

`publishpipe` deduplicates overlapping globs and fails fast if multiple files resolve to the same output filename.
In multipage web mode with `proposal: true`, a dedicated proposal-cover page is generated as the first page.

## CLI

```text
publishpipe dev [target] [options]      # hot-reload preview server
publishpipe build [target] [options]    # generate PDF
publishpipe web [target] [options]      # generate static HTML
publishpipe new <project-name>          # scaffold a project
```

Flags:

- `--template <name>` template folder (default: `default`)
- `--output, -o <path>` output path (supports `{{fn}}` in multi-source mode)
- `--port <number>` dev server port (default: `3000`)
- `--title-page` enable title page
- `--proposal` enable proposal cover (template-specific)
- `--theme <light|dark>` validated theme value
- `--multipage <true|false>` toggle linked multi-page HTML output (`true` default)
- `--split-on <chapters|h1|both>` multipage split strategy (`both` default)
- `toc: false` in config disables generated TOC wrappers/pages

Multipage web example:

```bash
bun run web example-proposal --multipage true --split-on chapters --output site
```

Scaffold a new project:

```bash
bun run src/cli.ts new my-proposal
```

## Templates

Templates live in `templates/<name>/`:

- `template.njk` HTML template
- `style.css` CSS including `@page` rules for print

Template vars include: `content`, `css`, `title`, `subtitle`, `author`, `date`, `titlePage`, `proposal`, `theme`, `pageSize`, `pageMargin`, plus custom frontmatter fields.

### CSS inheritance

Use `/* @extends <parent-template> */` at the top of `style.css` to inherit parent CSS. Parent styles load first, then child overrides. Cycles are detected and rejected.

## Stack

Bun runtime + tests, `gray-matter` for frontmatter, `marked` for markdown, `nunjucks` for templating, and `pagedjs-cli` for PDF pagination.
