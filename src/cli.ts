#!/usr/bin/env bun
import { mkdir } from "fs/promises";
import { parseArgs } from "util";
import { basename, resolve } from "path";
import { isTheme, loadProjectConfig, type PublishPipeConfig, type Theme } from "./config";
import { resolveSourceDocuments } from "./content/load";
import { renderHtml, type HtmlRenderOptions } from "./renderers/html";
import { buildPdfFromHtml } from "./renderers/pdf";
import { buildWebFromHtml } from "./renderers/web";
import { buildMultipageSite } from "./renderers/site";
import type { RenderProfile } from "./renderers/profile";
import { startDevServer } from "./server";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    template: { type: "string" },
    output: { type: "string", short: "o" },
    port: { type: "string", default: "3000" },
    "title-page": { type: "boolean" },
    proposal: { type: "boolean" },
    theme: { type: "string" },
    multipage: { type: "string" },
    "split-on": { type: "string" },
  },
  allowPositionals: true,
});

const [command, target] = positionals;
const rootDir = resolve(import.meta.dir, "..");
const projectsRoot = resolve(rootDir, "projects");

function printUsage() {
  console.log(`Usage:
  publishpipe dev [project-name|file.md] [--template name] [--port 3000] [--title-page] [--proposal] [--theme light|dark]
  publishpipe build [project-name|file.md] [--template name] [--output out.pdf] [--title-page] [--proposal] [--theme light|dark]
  publishpipe web [project-name|file.md] [--template name] [--output out.html|out-dir] [--multipage true|false] [--split-on chapters|h1|both] [--title-page] [--proposal] [--theme light|dark]
  publishpipe new <project-name>`);
}

async function createNewProject(projectName: string) {
  if (projectName.endsWith(".md")) {
    console.error("Project name cannot end with .md");
    process.exit(1);
  }

  const projectDir = resolve(projectsRoot, projectName);
  const configPath = resolve(projectDir, "publishpipe.config.ts");
  if (await Bun.file(configPath).exists()) {
    console.error(`Project already exists: ${projectDir}`);
    process.exit(1);
  }

  await mkdir(resolve(projectDir, "content"), { recursive: true });

  await Bun.write(
    configPath,
    `import { defineConfig } from "../../src/config";

export default defineConfig({
  // Template folder name from templates/
  template: "default",

  // Show a dedicated title page in PDF output
  titlePage: true,

  // Optional proposal cover page for templates that support it
  proposal: false,

  // Theme: light | dark
  theme: "light",

  // Show generated TOC wrappers/pages
  toc: true,

  // Print page settings
  page: {
    size: "A4",
    margin: "2.5cm 2cm",
  },

  // Single-file source (alternative to chapters)
  // content: "content/doc.md",

  // Ordered chapter files for single-PDF build and multipage site structure
  chapters: [
    "content/01-intro.md",
    "content/02-body.md",
    "content/03-conclusion.md",
  ],

  // Multi-file build mode (alternative to chapters/content)
  // source: ["content/*.md"],

  // Default output filename template ({{fn}} works in source mode)
  output: "proposal.pdf",

  // Interactive web output defaults
  web: {
    // Multipage is enabled by default for web command
    multipage: true,

    // Split strategy for multipage web output:
    // - chapters: one page per chapter file
    // - h1: split by top-level headings
    // - both: chapters + H1 (default)
    splitOn: "both",
  },
});
`
  );

  await Bun.write(
    resolve(projectDir, "content/01-intro.md"),
    `---
title: ${projectName}
subtitle: Intro
author: Your Name
date: February 2026
---

# Introduction

Describe the context and goals.
`
  );

  await Bun.write(
    resolve(projectDir, "content/02-body.md"),
    `# Main Section

Write the core proposal details.
`
  );

  await Bun.write(
    resolve(projectDir, "content/03-conclusion.md"),
    `# Conclusion

Summarize next steps and decisions.
`
  );

  console.log(`Created project: ${projectDir}`);
  console.log(`Try:`);
  console.log(`  bun run dev ${projectName}`);
  console.log(`  bun run build ${projectName}`);
  console.log(`  bun run web ${projectName}`);
}

if (!command) {
  printUsage();
  process.exit(1);
}

if (command === "new") {
  if (!target) {
    console.error("Missing project name: publishpipe new <project-name>");
    process.exit(1);
  }
  await createNewProject(target);
  process.exit(0);
}

let projectDir: string | null = null;
let targetMarkdownPath: string | undefined;

if (target) {
  if (target.endsWith(".md")) {
    targetMarkdownPath = resolve(target);
  } else {
    projectDir = resolve(projectsRoot, target);
    const configFile = Bun.file(resolve(projectDir, "publishpipe.config.ts"));
    if (!(await configFile.exists())) {
      console.error(`Project not found: ${projectDir}`);
      console.error(`Expected a publishpipe.config.ts in projects/${target}/`);
      process.exit(1);
    }
  }
}

const resolveBase = projectDir ?? process.cwd();
const templateDir = resolve(import.meta.dir, "../templates");

function parseTheme(themeRaw: unknown): Theme | undefined {
  if (themeRaw === undefined) {
    return undefined;
  }
  if (typeof themeRaw !== "string" || !isTheme(themeRaw)) {
    console.error(`Invalid theme '${String(themeRaw)}'. Expected one of: light, dark`);
    process.exit(1);
  }
  return themeRaw;
}

function parseSplitOn(splitOnRaw: unknown): "chapters" | "h1" | "both" | undefined {
  if (splitOnRaw === undefined) {
    return undefined;
  }
  if (splitOnRaw === "chapters" || splitOnRaw === "h1" || splitOnRaw === "both") {
    return splitOnRaw;
  }
  console.error(`Invalid split mode '${String(splitOnRaw)}'. Expected one of: chapters, h1, both`);
  process.exit(1);
}

const cliTheme = parseTheme(values.theme);
const cliMultipage = (() => {
  if (values.multipage === undefined) {
    return undefined;
  }
  if (values.multipage === "true") {
    return true;
  }
  if (values.multipage === "false") {
    return false;
  }
  console.error(`Invalid multipage value '${String(values.multipage)}'. Expected true or false`);
  process.exit(1);
})();
const cliSplitOn = parseSplitOn(values["split-on"]);

function applyCliOverrides(config: PublishPipeConfig): PublishPipeConfig {
  const titlePage = values["title-page"] ?? config.titlePage;
  const proposal = values.proposal ?? config.proposal;
  const theme = cliTheme ?? config.theme;

  if (theme !== undefined && !isTheme(theme)) {
    console.error(`Invalid theme '${String(theme)}' in config. Expected one of: light, dark`);
    process.exit(1);
  }

  return {
    ...config,
    template: values.template ?? config.template ?? "default",
    ...(titlePage !== undefined && { titlePage }),
    ...(proposal !== undefined && { proposal }),
    ...(theme !== undefined && { theme }),
    web: {
      multipage: true,
      splitOn: "both",
      ...config.web,
      ...(cliMultipage !== undefined && { multipage: cliMultipage }),
      ...(cliSplitOn !== undefined && { splitOn: cliSplitOn }),
    },
  };
}

async function resolveRenderOptions(profile: RenderProfile): Promise<HtmlRenderOptions> {
  const config = applyCliOverrides(await loadProjectConfig(rootDir, projectDir));
  const markdownPath = targetMarkdownPath ?? (config.content ? resolve(resolveBase, config.content) : undefined);

  if (!markdownPath && !config.chapters?.length && !config.source?.length) {
    console.error(
      "No content source. Provide a markdown file argument, a project name, or set content/chapters/source in publishpipe.config.ts"
    );
    process.exit(1);
  }

  return {
    markdownPath,
    templateDir,
    templateName: config.template ?? "default",
    config,
    cwd: resolveBase,
    profile,
  };
}

function resolveOutputCollisions(
  outputTemplate: string,
  sourceDocs: { path: string; filenameStem: string }[],
  resolveBaseDir: string
) {
  const outputMap = new Map<string, string[]>();

  for (const doc of sourceDocs) {
    const outputFilename = outputTemplate.replace(/\{\{fn\}\}/g, doc.filenameStem);
    const outputPath = resolve(resolveBaseDir, outputFilename);
    const collisions = outputMap.get(outputPath) ?? [];
    collisions.push(doc.path);
    outputMap.set(outputPath, collisions);
  }

  for (const [outputPath, sourceFiles] of outputMap) {
    if (sourceFiles.length > 1) {
      console.error(`Multiple source files resolve to the same output: ${outputPath}`);
      for (const file of sourceFiles) {
        console.error(`  - ${file}`);
      }
      process.exit(1);
    }
  }
}

if (command === "dev") {
  const port = parseInt(values.port!, 10);
  const initialRenderOptions = await resolveRenderOptions("interactive");
  startDevServer({
    port,
    initialRenderOptions,
    resolveRenderOptions: () => resolveRenderOptions("interactive"),
    rootDir,
  });
} else if (command === "build" || command === "web") {
  const isPdfBuild = command === "build";
  const renderOptions = await resolveRenderOptions(isPdfBuild ? "pdf" : "interactive");
  const resolvedConfig = renderOptions.config ?? {};
  const outputSuffix = isPdfBuild ? ".pdf" : ".html";
  const defaultOutputTemplate =
    !values.output && !isPdfBuild && resolvedConfig.output?.endsWith(".pdf")
      ? resolvedConfig.output.replace(/\.pdf$/i, ".html")
      : resolvedConfig.output;

  if (resolvedConfig.source?.length) {
    const sourceDocs = await resolveSourceDocuments(resolvedConfig.source, resolveBase);
    if (sourceDocs.length === 0) {
      console.error("No files matched source patterns:", resolvedConfig.source);
      process.exit(1);
    }

    console.log(`Found ${sourceDocs.length} source file(s)`);

    const outputTemplate = values.output ?? defaultOutputTemplate ?? `{{fn}}${outputSuffix}`;
    resolveOutputCollisions(outputTemplate, sourceDocs, resolveBase);

    for (const doc of sourceDocs) {
      const outputFilename = outputTemplate.replace(/\{\{fn\}\}/g, doc.filenameStem);
      const outputPath = resolve(resolveBase, outputFilename);
      const { html } = await renderHtml({
        ...renderOptions,
        markdownPath: doc.path,
        config: {
          ...resolvedConfig,
          chapters: undefined,
          content: undefined,
        },
      });

      if (isPdfBuild) {
        console.log(`Building PDF: ${outputPath}`);
        try {
          await buildPdfFromHtml(html, outputPath, resolveBase);
        } catch (err) {
          console.error(`pagedjs-cli failed for ${doc.filenameStem}`);
          console.error(err);
          process.exit(1);
        }
        console.log(`PDF saved: ${outputPath}`);
      } else {
        await buildWebFromHtml(html, outputPath);
        console.log(`HTML saved: ${outputPath}`);
      }
    }
  } else {
    const markdownPath = renderOptions.markdownPath;
    const webMultipage = !isPdfBuild && (resolvedConfig.web?.multipage ?? true);

    if (webMultipage) {
      const outputDir =
        values.output ??
        defaultOutputTemplate?.replace(/\.html?$/i, "") ??
        (markdownPath ? basename(markdownPath, ".md") : "site");
      const splitOn = resolvedConfig.web?.splitOn ?? "both";
      const writtenPaths = await buildMultipageSite({
        ...renderOptions,
        outputDir: resolve(resolveBase, outputDir),
        splitOn,
      });
      console.log(`Wrote ${writtenPaths.length} HTML page(s) to ${resolve(resolveBase, outputDir)}`);
    } else {
      const { html } = await renderHtml(renderOptions);
      const outputFilename =
        values.output ??
        defaultOutputTemplate ??
        (markdownPath ? `${basename(markdownPath, ".md")}${outputSuffix}` : `output${outputSuffix}`);

      const outputPath = resolve(resolveBase, outputFilename);
      if (isPdfBuild) {
        console.log(`Building PDF: ${outputPath}`);
        try {
          await buildPdfFromHtml(html, outputPath, resolveBase);
        } catch (err) {
          console.error("pagedjs-cli failed");
          console.error(err);
          process.exit(1);
        }
        console.log(`PDF saved: ${outputPath}`);
      } else {
        await buildWebFromHtml(html, outputPath);
        console.log(`HTML saved: ${outputPath}`);
      }
    }
  }
} else {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}
