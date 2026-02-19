#!/usr/bin/env bun
import { parseArgs } from "util";
import { resolve, basename } from "path";
import { Glob } from "bun";
import { render } from "./render";
import { startDevServer } from "./server";
import { loadProjectConfig, type PublishPipeConfig } from "./config";
import { filterSourceFilesByName } from "./source-filter";
import { findMissingTemplateVariables, renderTemplateString } from "./variables";
import { formatMissingVariableWarning } from "./warn";

function warnMissingVariables(context: string, missing: string[]): void {
  if (missing.length === 0) return;
  console.warn(formatMissingVariableWarning(context, missing));
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    template: { type: "string" },
    output: { type: "string", short: "o" },
    name: { type: "string" },
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
  publishpipe build [project-name|file.md] [--template name] [--output out.pdf] [--name filename] [--title-page] [--proposal] [--theme light|dark]`);
  process.exit(1);
}

if (!markdownPath && !resolvedConfig.chapters?.length && !resolvedConfig.source?.length) {
  console.error(
    "No content source. Provide a markdown file argument, a project name, or set content/chapters/source in publishpipe.config.ts"
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

async function buildPdfFromHtml(tmpHtml: string, outputPath: string): Promise<number> {
  if (process.env.PUBLISHPIPE_MOCK_PDF === "1") {
    await Bun.write(outputPath, "%PDF-1.4\n% mock pdf generated in test mode\n");
    return 0;
  }

  const proc = Bun.spawn(
    ["bunx", "pagedjs-cli", tmpHtml, "-o", outputPath],
    { stdout: "inherit", stderr: "inherit" }
  );
  return await proc.exited;
}

if (command === "dev") {
  const port = parseInt(values.port!, 10);
  startDevServer({ ...renderOpts, port });
} else if (command === "build") {
  const tmpDir = await import("os").then((os) => os.tmpdir());

  // Multi-file mode: source glob patterns
  if (resolvedConfig.source?.length) {
    let sourceFiles: string[] = [];

    for (const pattern of resolvedConfig.source) {
      const glob = new Glob(pattern);
      for await (const file of glob.scan({ cwd: resolveBase, absolute: true })) {
        sourceFiles.push(file);
      }
    }

    if (values.name) {
      sourceFiles = filterSourceFilesByName(sourceFiles, values.name);
      if (sourceFiles.length === 0) {
        console.error(
          `No source file matched --name "${values.name}" in patterns:`,
          resolvedConfig.source
        );
        process.exit(1);
      }
    }

    if (sourceFiles.length === 0) {
      console.error("No files matched source patterns:", resolvedConfig.source);
      process.exit(1);
    }

    console.log(`Found ${sourceFiles.length} source file(s)`);

    for (const sourceFile of sourceFiles) {
      const fn = basename(sourceFile, ".md");
      const { html, variables } = await render({
        ...renderOpts,
        markdownPath: sourceFile,
        variables: { fn },
        config: { ...resolvedConfig, chapters: undefined },
      });
      const outputTemplate = values.output ?? resolvedConfig.output ?? "{{fn}}.pdf";
      const missingOutputVars = findMissingTemplateVariables(outputTemplate, variables);
      warnMissingVariables(`output template for "${fn}"`, missingOutputVars);
      const outputFilename = renderTemplateString(outputTemplate, variables, {
        dateLocale: resolvedConfig.date_locale ?? resolvedConfig.dateLocale,
      });
      const outputPath = values.output
        ? resolve(outputFilename)
        : resolve(resolveBase, outputFilename);

      const tmpHtml = resolve(tmpDir, `publishpipe-${Date.now()}-${fn}.html`);
      await Bun.write(tmpHtml, html);

      console.log(`Building PDF: ${outputPath}`);

      const exitCode = await buildPdfFromHtml(tmpHtml, outputPath);
      await Bun.file(tmpHtml).delete();

      if (exitCode !== 0) {
        console.error(`pagedjs-cli failed for ${fn}`);
        process.exit(exitCode);
      }

      console.log(`PDF saved: ${outputPath}`);
    }
  } else {
    // Single-file mode: chapters or content
    const singleFn = markdownPath ? basename(markdownPath, ".md") : undefined;
    const { html, variables } = await render({
      ...renderOpts,
      variables: singleFn ? { fn: singleFn } : undefined,
    });

    const tmpHtml = resolve(tmpDir, `publishpipe-${Date.now()}.html`);
    await Bun.write(tmpHtml, html);

    const outputTemplate =
      values.output ??
      resolvedConfig.output ??
      (singleFn ? "{{fn}}.pdf" : "output.pdf");
    const missingOutputVars = findMissingTemplateVariables(outputTemplate, variables);
    warnMissingVariables("output template", missingOutputVars);
    const outputFilename = renderTemplateString(outputTemplate, variables, {
      dateLocale: resolvedConfig.date_locale ?? resolvedConfig.dateLocale,
    });

    const outputPath = values.output
      ? resolve(outputFilename)
      : resolve(resolveBase, outputFilename);

    console.log(`Building PDF: ${outputPath}`);

    const exitCode = await buildPdfFromHtml(tmpHtml, outputPath);
    await Bun.file(tmpHtml).delete();

    if (exitCode !== 0) {
      console.error("pagedjs-cli failed");
      process.exit(exitCode);
    }

    console.log(`PDF saved: ${outputPath}`);
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
