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

  test("web command writes html output", async () => {
    const outputPath = resolve(rootDir, "projects/example-proposal/proposal.html");
    await rm(outputPath, { force: true });

    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "web", "example-proposal"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("HTML saved:");
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });
});
