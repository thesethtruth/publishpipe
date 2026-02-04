# publishpipe

Markdown in, PDF out. No Electron, no LaTeX, no suffering.

Write your docs in markdown with YAML frontmatter. Preview with hot reload. Export to print-ready PDF with proper pagination, running headers, and page numbers. That's it.

## Why

Because every time you open Google Docs to write a proposal, a part of you dies. You already have a text editor you like. Use it.

The pipeline: **markdown** -> **gray-matter** (frontmatter) -> **marked** (HTML) -> **nunjucks** (template) -> **paged.js** (PDF). Each piece does one thing well.

## Install

```
bun install
```

## Quick start

Single file:

```
bun run dev content/example.md
```

Open `localhost:3000`. Edit the markdown. It reloads.

When you're done staring at it:

```
bun run build content/example.md -o proposal.pdf
```

## Projects

For anything longer than a one-pager, use projects. A project is a folder in `projects/` with its own config and content:

```
projects/example-proposal/
  publishpipe.config.ts
  content/
    01-intro.md
    02-background.md
    03-conclusion.md
```

The project config only needs what's specific to that project:

```ts
// projects/example-proposal/publishpipe.config.ts
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

Root `publishpipe.config.ts` provides defaults (template, theme, page size). Project config merges on top.

```
bun run dev example-proposal        # dev server
bun run build example-proposal      # -> projects/example-proposal/proposal.pdf
```

Detection is simple: ends in `.md` = single file, otherwise = project name.

## Frontmatter

First file's YAML frontmatter becomes document metadata:

```yaml
---
title: Project Proposal
subtitle: A thing we should do
author: Your Name
date: February 2026
---
```

These populate the title page and running headers.

## Config

All fields are optional. Root config sets defaults, project config overrides, CLI flags override everything.

```ts
// publishpipe.config.ts
import { defineConfig } from "./src/config";

export default defineConfig({
  template: "default",       // template folder in templates/
  titlePage: true,           // dedicated title page from frontmatter
  theme: "light",            // "light" | "dark"
  page: {
    size: "A4",              // paper size
    margin: "2.5cm 2cm",     // CSS margin
  },
  content: "doc.md",         // single file path
  chapters: ["ch1.md", ...], // ordered chapter files
  output: "output.pdf",      // output filename
});
```

## CLI

```
publishpipe dev [target] [options]     # hot-reload preview
publishpipe build [target] [options]   # generate PDF
```

`target` is a project name or a `.md` file path.

| Flag | What it does |
|------|-------------|
| `--template <name>` | Template folder (default: `default`) |
| `--output, -o <path>` | Output PDF path |
| `--port <number>` | Dev server port (default: `3000`) |
| `--title-page` | Enable title page |
| `--theme <light\|dark>` | Theme |

## Templates

Templates live in `templates/<name>/` and contain:

- `template.njk` -- Nunjucks HTML template
- `style.css` -- CSS with `@page` rules for print layout

Available variables in the template: `content`, `css`, `title`, `subtitle`, `author`, `date`, `titlePage`, `theme`, `pageSize`, `pageMargin`, plus any extra frontmatter fields.

## Stack

Bun for everything. `gray-matter` for frontmatter, `marked` for markdown, `nunjucks` for templates, `pagedjs-cli` for PDF. No bundler config, no framework, no build step.
