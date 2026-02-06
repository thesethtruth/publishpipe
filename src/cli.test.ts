import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { resolve, basename } from "path";
import { mkdir, rm } from "fs/promises";

const rootDir = resolve(import.meta.dir, "..");
const testProjectDir = resolve(rootDir, "projects/_test-multi-source");

const testEnv = { ...process.env, PUBLISHPIPE_TEST_FAKE_PDF: "1" };

describe("cli multi-file source", () => {
  beforeAll(async () => {
    await mkdir(resolve(testProjectDir, "content"), { recursive: true });

    await Bun.write(
      resolve(testProjectDir, "content/doc-alpha.md"),
      `---
title: Alpha Document
---

# Alpha

Content for alpha.
`
    );

    await Bun.write(
      resolve(testProjectDir, "content/doc-beta.md"),
      `---
title: Beta Document
---

# Beta

Content for beta.
`
    );

    await Bun.write(
      resolve(testProjectDir, "content/notes.md"),
      `---
title: Notes
---

# Notes

Some notes.
`
    );

    await Bun.write(
      resolve(testProjectDir, "publishpipe.config.ts"),
      `import { defineConfig } from "../../src/config";

export default defineConfig({
  source: ["content/doc-*.md"],
  output: "output-{{fn}}.pdf",
  template: "default",
});
`
    );
  });

  afterAll(async () => {
    await rm(testProjectDir, { recursive: true, force: true });
  });

  test("builds multiple PDFs from source glob", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "build", "_test-multi-source"], {
      cwd: rootDir,
      env: testEnv,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Found 2 source file(s)");
    expect(stdout).toContain("output-doc-alpha.pdf");
    expect(stdout).toContain("output-doc-beta.pdf");

    const alphaPdf = Bun.file(resolve(testProjectDir, "output-doc-alpha.pdf"));
    const betaPdf = Bun.file(resolve(testProjectDir, "output-doc-beta.pdf"));
    expect(await alphaPdf.exists()).toBe(true);
    expect(await betaPdf.exists()).toBe(true);

    const notesPdf = Bun.file(resolve(testProjectDir, "output-notes.pdf"));
    expect(await notesPdf.exists()).toBe(false);
  }, 30000);

  test("fails when two sources map to the same output filename", async () => {
    await Bun.write(
      resolve(testProjectDir, "publishpipe.config.ts"),
      `import { defineConfig } from "../../src/config";

export default defineConfig({
  source: ["content/doc-*.md"],
  output: "same.pdf",
  template: "default",
});
`
    );

    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "build", "_test-multi-source"], {
      cwd: rootDir,
      env: testEnv,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Multiple source files resolve to the same output");

    await Bun.write(
      resolve(testProjectDir, "publishpipe.config.ts"),
      `import { defineConfig } from "../../src/config";

export default defineConfig({
  source: ["content/doc-*.md"],
  output: "output-{{fn}}.pdf",
  template: "default",
});
`
    );
  }, 30000);

  test("{{fn}} replacement in output filename", () => {
    const testCases = [
      { fn: "doc-alpha", template: "{{fn}}.pdf", expected: "doc-alpha.pdf" },
      { fn: "notes-weekly", template: "report-{{fn}}.pdf", expected: "report-notes-weekly.pdf" },
      { fn: "test", template: "prefix-{{fn}}-suffix.pdf", expected: "prefix-test-suffix.pdf" },
      { fn: "file", template: "{{fn}}-{{fn}}.pdf", expected: "file-file.pdf" },
    ];

    for (const { fn, template, expected } of testCases) {
      const result = template.replace(/\{\{fn\}\}/g, fn);
      expect(result).toBe(expected);
    }
  });

  test("extracts filename without extension", () => {
    const testCases = [
      { path: "/path/to/doc-alpha.md", expected: "doc-alpha" },
      { path: "content/notes-weekly-1.md", expected: "notes-weekly-1" },
      { path: "file.md", expected: "file" },
    ];

    for (const { path, expected } of testCases) {
      const result = basename(path, ".md");
      expect(result).toBe(expected);
    }
  });
});

describe("cli single-file mode", () => {
  test("chapters still produces single output", async () => {
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "build", "example-proposal"], {
      cwd: rootDir,
      env: testEnv,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("source file(s)");
    expect(stdout).toContain("proposal.pdf");

    const pdf = Bun.file(resolve(rootDir, "projects/example-proposal/proposal.pdf"));
    expect(await pdf.exists()).toBe(true);
  }, 30000);

  test("fails on invalid theme", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "build", "example-proposal", "--theme", "neon"],
      {
        cwd: rootDir,
        env: testEnv,
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid theme 'neon'");
  });

  test("web command defaults to multipage output", async () => {
    const outDir = resolve(rootDir, "projects/example-proposal/proposal");
    await rm(outDir, { recursive: true, force: true });

    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "web", "example-proposal"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Wrote");
    expect(await Bun.file(resolve(outDir, "index.html")).exists()).toBe(true);
  });

  test("web command can be forced to single-file output", async () => {
    const outputPath = resolve(rootDir, "projects/example-proposal/proposal.html");
    await rm(outputPath, { force: true });

    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "web", "example-proposal", "--multipage", "false", "--output", "proposal.html"],
      {
        cwd: rootDir,
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("HTML saved:");
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });

  test("web command can build multipage output", async () => {
    const outDir = resolve(rootDir, "projects/example-proposal/site");
    await rm(outDir, { recursive: true, force: true });

    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "web", "example-proposal", "--multipage", "true", "--output", "site"],
      {
        cwd: rootDir,
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Wrote");
    expect(await Bun.file(resolve(outDir, "index.html")).exists()).toBe(true);
    const files = await Array.fromAsync(new Bun.Glob("*.html").scan({ cwd: outDir }));
    expect(files.length).toBeGreaterThan(1);

    const indexHtml = await Bun.file(resolve(outDir, "index.html")).text();
    expect(indexHtml).toContain("doc-page-nav");
    expect(indexHtml).toContain("doc-pages-menu");
    expect(indexHtml).toContain("Contents");
  });
});

describe("cli project scaffolding", () => {
  const newProjectName = "_test-new-project";
  const newProjectDir = resolve(rootDir, "projects", newProjectName);

  afterAll(async () => {
    await rm(newProjectDir, { recursive: true, force: true });
  });

  test("new command creates a bootstrapped project", async () => {
    await rm(newProjectDir, { recursive: true, force: true });

    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "new", newProjectName], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Created project");
    expect(await Bun.file(resolve(newProjectDir, "publishpipe.config.ts")).exists()).toBe(true);
    expect(await Bun.file(resolve(newProjectDir, "content/01-intro.md")).exists()).toBe(true);

    const configText = await Bun.file(resolve(newProjectDir, "publishpipe.config.ts")).text();
    expect(configText).toContain("multipage: true");
    expect(configText).toContain('splitOn: "both"');
  });
});

describe("cli multipage proposal cover", () => {
  const proposalProject = resolve(rootDir, "projects/_test-proposal-site");

  beforeAll(async () => {
    await mkdir(resolve(proposalProject, "content"), { recursive: true });
    await Bun.write(
      resolve(proposalProject, "publishpipe.config.ts"),
      `import { defineConfig } from "../../src/config";

export default defineConfig({
  template: "sethdev",
  proposal: true,
  chapters: ["content/01.md", "content/02.md"],
  web: { multipage: true, splitOn: "both" },
  frontmatter: {
    bedrijf: "Sender BV",
    klant: "Receiver BV",
    offertedatum: "6 februari 2026",
  },
});
`
    );
    await Bun.write(resolve(proposalProject, "content/01.md"), "# Intro\n\nOne.\n");
    await Bun.write(resolve(proposalProject, "content/02.md"), "# Scope\n\nTwo.\n");
  });

  afterAll(async () => {
    await rm(proposalProject, { recursive: true, force: true });
  });

  test("proposal cover renders as separate first page in multipage web output", async () => {
    const outDir = resolve(proposalProject, "site");
    await rm(outDir, { recursive: true, force: true });

    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "web", "_test-proposal-site", "--output", "site"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const indexHtml = await Bun.file(resolve(outDir, "index.html")).text();
    expect(indexHtml).toContain("proposal-cover");

    const files = await Array.fromAsync(new Bun.Glob("*.html").scan({ cwd: outDir }));
    expect(files.length).toBeGreaterThan(2);
  });
});
