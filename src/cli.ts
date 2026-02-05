#!/usr/bin/env bun
import { parseArgs } from "util";
import { resolve, basename } from "path";
import { render } from "./render";
import { startDevServer } from "./server";
import { loadProjectConfig, type PublishPipeConfig } from "./config";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    template: { type: "string" },
    output: { type: "string", short: "o" },
    port: { type: "string", default: "3000" },
    "title-page": { type: "boolean" },
    proposal: { type: "boolean" },
    theme: { type: "string" },
  },
  allowPositionals: true,
});

const [command, target] = positionals;
const rootDir = resolve(import.meta.dir, "..");

// Detect project vs single .md file
let projectDir: string | null = null;
let markdownPath: string | undefined;

if (target) {
  if (target.endsWith(".md")) {
    // Single-file backward compat
    markdownPath = resolve(target);
  } else {
    // Project mode
    projectDir = resolve(rootDir, "projects", target);
    const configFile = Bun.file(resolve(projectDir, "publishpipe.config.ts"));
    if (!(await configFile.exists())) {
      console.error(`Project not found: ${projectDir}`);
      console.error(`Expected a publishpipe.config.ts in projects/${target}/`);
      process.exit(1);
    }
  }
}

// Load config: root defaults merged with project config
const config = await loadProjectConfig(rootDir, projectDir);

// CLI args override config values
const templateName = values.template ?? config.template ?? "default";
const titlePage = values["title-page"] ?? config.titlePage;
const proposal = values.proposal ?? config.proposal;
const theme = (values.theme as PublishPipeConfig["theme"]) ?? config.theme;

// Merge into resolved config
const resolvedConfig: PublishPipeConfig = {
  ...config,
  template: templateName,
  ...(titlePage !== undefined && { titlePage }),
  ...(proposal !== undefined && { proposal }),
  ...(theme && { theme }),
};

// Base directory for resolving relative paths
const resolveBase = projectDir ?? process.cwd();

// Resolve markdown path from config.content if not already set
if (!markdownPath && config.content) {
  markdownPath = resolve(resolveBase, config.content);
}

// Need either a file, content, or chapters
if (!command) {
  console.log(`Usage:
  publishpipe dev [project-name|file.md] [--template name] [--port 3000] [--title-page] [--proposal] [--theme light|dark]
  publishpipe build [project-name|file.md] [--template name] [--output out.pdf] [--title-page] [--proposal] [--theme light|dark]`);
  process.exit(1);
}

if (!markdownPath && !resolvedConfig.chapters?.length) {
  console.error(
    "No content source. Provide a markdown file argument, a project name, or set content/chapters in publishpipe.config.ts"
  );
  process.exit(1);
}

const templateDir = resolve(import.meta.dir, "../templates");

const renderOpts = {
  markdownPath,
  templateDir,
  templateName,
  config: resolvedConfig,
  cwd: resolveBase,
};

if (command === "dev") {
  const port = parseInt(values.port!, 10);
  startDevServer({ ...renderOpts, port });
} else if (command === "build") {
  const { html } = await render(renderOpts);

  // Write HTML to temp file
  const tmpDir = await import("os").then((os) => os.tmpdir());
  const tmpHtml = resolve(tmpDir, `publishpipe-${Date.now()}.html`);
  await Bun.write(tmpHtml, html);

  // Determine output path
  const outputFilename =
    resolvedConfig.output ??
    (markdownPath ? basename(markdownPath, ".md") + ".pdf" : "output.pdf");

  const outputPath = values.output
    ? resolve(values.output) // CLI flag: resolve from cwd
    : resolve(resolveBase, outputFilename); // config: resolve from project dir

  console.log(`Building PDF: ${outputPath}`);

  const proc = Bun.spawn(
    ["bunx", "pagedjs-cli", tmpHtml, "-o", outputPath],
    {
      stdout: "inherit",
      stderr: "inherit",
    }
  );
  const exitCode = await proc.exited;

  // Clean up
  await Bun.file(tmpHtml).delete();

  if (exitCode !== 0) {
    console.error("pagedjs-cli failed");
    process.exit(exitCode);
  }

  console.log(`PDF saved: ${outputPath}`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
