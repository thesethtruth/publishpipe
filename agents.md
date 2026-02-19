
Use Bun, not Node. `bun run`, `bun test`, `bun install`, `Bun.file`, `Bun.serve`.

## Architecture

Markdown-to-PDF pipeline: `gray-matter` (frontmatter) -> `marked` (HTML) -> `nunjucks` (template) -> `pagedjs-cli` (PDF).

- `src/cli.ts` -- entry point, arg parsing, project vs single-file detection
- `src/config.ts` -- config loading, root+project merge via `loadProjectConfig`
- `src/render.ts` -- markdown reading, chapter concatenation, template rendering
- `src/server.ts` -- dev server with WebSocket hot reload and file watching
- `templates/<name>/` -- `template.njk` + `style.css`
- `projects/<name>/` -- self-contained project dirs with own config + content

## Key patterns

- Root `publishpipe.config.ts` = defaults only (template, theme, page size)
- Project configs override root, CLI flags override everything
- `cwd` gets threaded through the pipeline for path resolution -- chapters resolve relative to project dir, not `process.cwd()`
- Positional arg ending in `.md` = single-file mode, otherwise = project name in `projects/`

## Running

```
bun run src/cli.ts dev example-proposal
bun run src/cli.ts build example-proposal
bun run src/cli.ts dev content/example.md
```

## Testing

Run `bun test`. Tests live next to source files (`src/*.test.ts`). Write tests for new features.

## Workflow

- Write tests for new features
- Update `README.md` at the end of a task if the change is user-facing
