#!/usr/bin/env bun
import { parseArgs } from "util";
import { resolve, basename } from "path";
import { render } from "./render";
import { startDevServer } from "./server";
import { loadConfig, type PublishPipeConfig } from "./config";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    template: { type: "string" },
    output: { type: "string", short: "o" },
    port: { type: "string", default: "3000" },
    "title-page": { type: "boolean" },
    theme: { type: "string" },
  },
  allowPositionals: true,
});

const [command, markdownFile] = positionals;

// Load config file
const config = await loadConfig(process.cwd());

// CLI args override config values
const templateName = values.template ?? config.template ?? "default";
const titlePage = values["title-page"] ?? config.titlePage;
const theme = (values.theme as PublishPipeConfig["theme"]) ?? config.theme;

// Merge into resolved config
const resolvedConfig: PublishPipeConfig = {
  ...config,
  template: templateName,
  ...(titlePage !== undefined && { titlePage }),
  ...(theme && { theme }),
};

// Determine markdown source
const markdownPath = markdownFile
  ? resolve(markdownFile)
  : config.content
    ? resolve(config.content)
    : undefined;

// Need either a file, content, or chapters
if (!command) {
  console.log(`Usage:
  publishpipe dev [file.md] [--template name] [--port 3000] [--title-page] [--theme light|dark]
  publishpipe build [file.md] [--template name] [--output out.pdf] [--title-page] [--theme light|dark]`);
  process.exit(1);
}

if (!markdownPath && !resolvedConfig.chapters?.length) {
  console.error(
    "No content source. Provide a markdown file argument, or set content/chapters in publishpipe.config.ts"
  );
  process.exit(1);
}

const templateDir = resolve(import.meta.dir, "../templates");

const renderOpts = {
  markdownPath,
  templateDir,
  templateName,
  config: resolvedConfig,
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
  const outputPath =
    values.output ??
    resolvedConfig.output ??
    (markdownPath ? basename(markdownPath, ".md") + ".pdf" : "output.pdf");

  console.log(`Building PDF: ${outputPath}`);

  const proc = Bun.spawn(
    ["bunx", "pagedjs-cli", tmpHtml, "-o", resolve(outputPath)],
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
