#!/usr/bin/env bun
import { parseArgs } from "util";
import { resolve, basename } from "path";
import { render } from "./render";
import { startDevServer } from "./server";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    template: { type: "string", default: "default" },
    output: { type: "string", short: "o" },
    port: { type: "string", default: "3000" },
  },
  allowPositionals: true,
});

const [command, markdownFile] = positionals;

if (!command || !markdownFile) {
  console.log(`Usage:
  publishpipe dev <file.md> [--template name] [--port 3000]
  publishpipe build <file.md> [--template name] [--output out.pdf]`);
  process.exit(1);
}

const markdownPath = resolve(markdownFile);
const templateDir = resolve(import.meta.dir, "../templates");
const templateName = values.template!;

const renderOpts = { markdownPath, templateDir, templateName };

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
    values.output || basename(markdownFile, ".md") + ".pdf";

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
