# z-publishpipe Implementation Plan

## Summary
A Bun CLI tool that converts markdown to print-ready PDFs via Nunjucks templates, Tailwind CSS, and pagedjs-cli.

## Pipeline
```
markdown (frontmatter + body)
  → parse frontmatter (gray-matter) + convert body to HTML (marked)
  → inject into Nunjucks template
  → process Tailwind CSS
  → dev: serve HTML via Bun.serve + WebSocket hot reload
  → build: pipe HTML to pagedjs-cli → PDF
```

## Project Structure
```
z-publishpipe/
├── package.json
├── tailwind.config.ts
├── src/
│   ├── cli.ts            # CLI entry point (arg parsing, command routing)
│   ├── render.ts         # Markdown → HTML → Nunjucks → final HTML pipeline
│   ├── styles.ts         # Tailwind CSS processing
│   └── server.ts         # Dev server with WebSocket hot reload
├── templates/
│   └── default/
│       ├── template.njk  # Default Nunjucks template
│       └── style.css     # Base print styles (raw CSS for paged media)
└── content/
    └── example.md        # Example markdown file with frontmatter
```

## CLI Interface
```bash
# Dev mode - hot reload preview in browser
publishpipe dev content/example.md
publishpipe dev content/example.md --template minimal

# Build PDF
publishpipe build content/example.md
publishpipe build content/example.md --template minimal --output out.pdf
```

Entry point via `package.json` `"bin"` field pointing to `src/cli.ts`.

## Dependencies
- **nunjucks** - templating
- **marked** - markdown → HTML
- **gray-matter** - frontmatter parsing
- **pagedjs-cli** - HTML → PDF rendering
- **tailwindcss** + **@tailwindcss/cli** - CSS processing
- No extra file watcher needed — Bun has `Bun.file` + `fs.watch`

## Implementation Steps

### Step 1: Project scaffolding
- `bun init`, install dependencies
- Create directory structure (`src/`, `templates/default/`, `content/`)
- Configure `package.json` with `bin` entry

### Step 2: Render pipeline (`src/render.ts`)
- Parse markdown file: extract frontmatter via `gray-matter`, convert body via `marked`
- Load Nunjucks template from `templates/<name>/template.njk`
- Render template with `{ content: htmlBody, ...frontmatterData }`
- Return complete HTML string

### Step 3: Tailwind processing (`src/styles.ts`)
- Run Tailwind CLI as a subprocess (`bun x tailwindcss ...`) against the rendered HTML
- Inline the processed CSS into the HTML `<head>`
- Template's `style.css` is included as a Tailwind `@import` or appended after Tailwind output

### Step 4: Default template (`templates/default/`)
- `template.njk`: basic HTML document shell with `<head>` (styles, paged.js CSS) and `<body>` (content block, header/footer slots from frontmatter)
- `style.css`: `@page` rules, margins, page size (A4), print-specific CSS (orphans, widows, page breaks)

### Step 5: Build command (`src/cli.ts` - build path)
- Run render pipeline → get final HTML
- Write HTML to a temp file
- Shell out to `pagedjs-cli <temp.html> -o <output.pdf>`
- Clean up temp file

### Step 6: Dev server (`src/server.ts`)
- `Bun.serve()` on localhost:3000 (configurable)
- Serves the rendered HTML at `/`
- WebSocket endpoint at `/ws` — injects a small `<script>` into the HTML that connects to the WebSocket
- `fs.watch` on the markdown file + template directory
- On file change: re-render, notify WebSocket clients → browser reloads

### Step 7: CLI arg parsing (`src/cli.ts`)
- Parse `dev` / `build` command
- Flags: `--template` (default: "default"), `--output` (default: `<input-name>.pdf`), `--port` (default: 3000)
- Use `Bun.argv` or `util.parseArgs` (built into Node/Bun)

### Step 8: Example content
- `content/example.md` with sample frontmatter (`title`, `author`, `date`) and body content

## Template Contract (frontmatter → template)
Templates receive:
- `content` — the rendered HTML body from markdown
- All frontmatter fields (e.g., `title`, `author`, `date`, `subtitle`)
- Templates can reference any frontmatter field: `{{ title }}`, `{{ author }}`, etc.

## Verification
1. `bun run src/cli.ts dev content/example.md` → opens browser preview with styled content, hot reloads on edit
2. `bun run src/cli.ts build content/example.md` → produces a PDF file
3. Edit markdown → dev server reflects changes without manual refresh
4. `--template` flag switches templates correctly
