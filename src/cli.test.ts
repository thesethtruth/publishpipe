import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { resolve, basename } from "path";
import { mkdir, rm } from "fs/promises";
import { renderTemplateString } from "./variables";

const rootDir = resolve(import.meta.dir, "..");
const testProjectDir = resolve(rootDir, "projects/_test-multi-source");

describe("cli multi-file source", () => {
  beforeAll(async () => {
    // Create test project structure
    await mkdir(resolve(testProjectDir, "content"), { recursive: true });

    await Bun.write(
      resolve(testProjectDir, "content/doc-alpha.md"),
      `---
title: Alpha Document
klantnaam: Alpha-BV
vervaldatum: 21-02-2026
---

# Alpha

Content for alpha.
`
    );

    await Bun.write(
      resolve(testProjectDir, "content/doc-beta.md"),
      `---
title: Beta Document
klantnaam: Beta-BV
vervaldatum: 28-02-2026
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
  output: "output-{{klantnaam}}-{{vervaldatum | format(\\"YYYYMMDD\\")}}-{{fn}}.pdf",
  template: "default",
});
`
    );
  });

  afterAll(async () => {
    await rm(testProjectDir, { recursive: true, force: true });
  });

  test("builds multiple PDFs from source glob", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "build", "_test-multi-source"],
      {
        cwd: rootDir,
        env: { ...process.env, PUBLISHPIPE_MOCK_PDF: "1" },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Found 2 source file(s)");
    expect(stdout).toContain("output-Alpha-BV-20260221-doc-alpha.pdf");
    expect(stdout).toContain("output-Beta-BV-20260228-doc-beta.pdf");

    // Verify PDFs were created
    const alphaPdf = Bun.file(resolve(testProjectDir, "output-Alpha-BV-20260221-doc-alpha.pdf"));
    const betaPdf = Bun.file(resolve(testProjectDir, "output-Beta-BV-20260228-doc-beta.pdf"));
    expect(await alphaPdf.exists()).toBe(true);
    expect(await betaPdf.exists()).toBe(true);

    // notes.md should NOT be built (doesn't match doc-*.md pattern)
    const notesPdf = Bun.file(resolve(testProjectDir, "output-notes.pdf"));
    expect(await notesPdf.exists()).toBe(false);
  }, 30000);

  test("builds only one PDF when using --name", async () => {
    await rm(resolve(testProjectDir, "output-Alpha-BV-20260221-doc-alpha.pdf"), { force: true });
    await rm(resolve(testProjectDir, "output-Beta-BV-20260228-doc-beta.pdf"), { force: true });

    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "build", "_test-multi-source", "--name", "doc-alpha"],
      {
        cwd: rootDir,
        env: { ...process.env, PUBLISHPIPE_MOCK_PDF: "1" },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Found 1 source file(s)");
    expect(stdout).toContain("output-Alpha-BV-20260221-doc-alpha.pdf");
    expect(stdout).not.toContain("output-Beta-BV-20260228-doc-beta.pdf");

    const alphaPdf = Bun.file(resolve(testProjectDir, "output-Alpha-BV-20260221-doc-alpha.pdf"));
    const betaPdf = Bun.file(resolve(testProjectDir, "output-Beta-BV-20260228-doc-beta.pdf"));
    expect(await alphaPdf.exists()).toBe(true);
    expect(await betaPdf.exists()).toBe(false);
  }, 30000);

  test("fails when --name does not match any source file", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "build", "_test-multi-source", "--name", "missing-file"],
      {
        cwd: rootDir,
        env: { ...process.env, PUBLISHPIPE_MOCK_PDF: "1" },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).toBe(1);
    expect(stderr).toContain('No source file matched --name "missing-file"');
  }, 30000);

  test("variable replacement in output filename", () => {
    const testCases = [
      {
        vars: { fn: "doc-alpha" },
        template: "{{fn}}.pdf",
        expected: "doc-alpha.pdf",
      },
      {
        vars: { fn: "notes-weekly" },
        template: "report-{{fn}}.pdf",
        expected: "report-notes-weekly.pdf",
      },
      {
        vars: { fn: "test", klantnaam: "Acme", vervaldatum: "18-02-2026" },
        template: "{{klantnaam}}-{{vervaldatum | format(\"YYYYMMDD\")}}-{{fn}}.pdf",
        expected: "Acme-20260218-test.pdf",
      },
    ];

    for (const { vars, template, expected } of testCases) {
      const result = renderTemplateString(template, vars);
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
    const proc = Bun.spawn(
      ["bun", "run", "src/cli.ts", "build", "example-proposal"],
      {
        cwd: rootDir,
        env: { ...process.env, PUBLISHPIPE_MOCK_PDF: "1" },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();

    expect(exitCode).toBe(0);
    // Should NOT say "Found X source file(s)" - that's multi-file mode
    expect(stdout).not.toContain("source file(s)");
    expect(stdout).toContain("proposal.pdf");

    // Verify single PDF was created
    const pdf = Bun.file(resolve(rootDir, "projects/example-proposal/proposal.pdf"));
    expect(await pdf.exists()).toBe(true);
  }, 30000);
});
