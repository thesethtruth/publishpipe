import { test, expect, describe } from "bun:test";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { render } from "./render";

const rootDir = resolve(import.meta.dir, "..");
const templateDir = resolve(rootDir, "templates");
const projectDir = resolve(rootDir, "projects/example-proposal");

describe("render", () => {
  test("renders single markdown file", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "default",
      config: { titlePage: true, theme: "light" },
    });

    expect(result.html).toContain("Introduction");
    expect(result.frontmatter.title).toBe("Project Proposal");
    expect(result.frontmatter.author).toBe("Your Name");
  });

  test("renders multi-chapter project with cwd", async () => {
    const result = await render({
      templateDir,
      templateName: "default",
      config: {
        chapters: [
          "content/01-intro.md",
          "content/02-background.md",
          "content/03-conclusion.md",
        ],
        titlePage: true,
        theme: "light",
      },
      cwd: projectDir,
    });

    // frontmatter from first chapter
    expect(result.frontmatter.title).toBe("Project Proposal");
    // content from all chapters
    expect(result.html).toContain("Introduction");
    expect(result.html).toContain("Background");
    expect(result.html).toContain("Conclusion");
  });

  test("chapters resolve relative to cwd, not process.cwd()", async () => {
    const result = await render({
      templateDir,
      templateName: "default",
      config: {
        chapters: ["content/01-intro.md"],
      },
      cwd: projectDir,
    });

    expect(result.html).toContain("Introduction");
  });

  test("throws without any content source", async () => {
    expect(() =>
      render({
        templateDir,
        templateName: "default",
        config: {},
      })
    ).toThrow("No content source");
  });

  test("applies theme and page config to output", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "default",
      config: {
        theme: "dark",
        page: { size: "letter", margin: "1in" },
      },
    });

    expect(result.html).toContain('data-theme="dark"');
    expect(result.html).toContain("letter");
    expect(result.html).toContain("1in");
  });

  test("title page renders when enabled", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "default",
      config: { titlePage: true },
    });

    expect(result.html).toContain('<section class="title-page">');
  });

  test("title page absent when disabled", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "default",
      config: { titlePage: false },
    });

    expect(result.html).not.toContain('<section class="title-page">');
    expect(result.html).toContain("document-header");
  });

  test("config variables provide default template variables", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "sethdev",
      config: {
        proposal: true,
        variables: {
          bedrijf: "Test BV",
          plaats: "Amsterdam",
        },
      },
    });

    expect(result.html).toContain("Test BV");
    expect(result.html).toContain("Amsterdam");
    expect(result.html).toContain("proposal-cover");
  });

  test("file frontmatter overrides config variables", async () => {
    // 01-intro.md has title: "Project Proposal" in frontmatter
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "sethdev",
      config: {
        proposal: true,
        variables: {
          title: "Should Be Overridden",
          bedrijf: "Config BV",
        },
      },
    });

    // file frontmatter title wins over config variables title
    expect(result.html).toContain("Project Proposal");
    expect(result.html).not.toContain("Should Be Overridden");
    // config variables still provide values not in file
    expect(result.html).toContain("Config BV");
  });

  test("proposal cover renders with sethdev template", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "sethdev",
      config: {
        proposal: true,
        variables: {
          bedrijf: "Afzender BV",
          klant: "Ontvanger BV",
          offertedatum: "5 februari 2026",
        },
      },
    });

    expect(result.html).toContain("proposal-cover");
    expect(result.html).toContain("Afzender BV");
    expect(result.html).toContain("Ontvanger BV");
    expect(result.html).toContain("5 februari 2026");
    // should not render regular title page
    expect(result.html).not.toContain('<section class="title-page">');
  });

  test("CSS @extends loads parent template CSS", async () => {
    // sethdev-onepager extends sethdev
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "sethdev-onepager",
      config: {},
    });

    // Should have parent sethdev styles (title-page, proposal-cover classes)
    expect(result.html).toContain(".title-page {");
    expect(result.html).toContain(".proposal-cover {");
    // Should have child overrides (condensed sizes)
    expect(result.html).toContain("font-size: 9pt");
    // Child overrides should come after parent (for cascade priority)
    const titlePageIdx = result.html.indexOf(".title-page {");
    const condensedIdx = result.html.lastIndexOf("font-size: 9pt");
    expect(condensedIdx).toBeGreaterThan(titlePageIdx);
  });

  test("renders markdown variables from config and frontmatter", async () => {
    const tempDir = resolve(tmpdir(), `publishpipe-render-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    const markdownPath = resolve(tempDir, "vars.md");

    await Bun.write(
      markdownPath,
      `---
title: Variables Test
klantnaam: Frontmatter BV
---

# Hallo {{klantnaam}}
Geldig tot {{vervaldatum | format("YYYY/MM/DD")}}.
`
    );

    try {
      const result = await render({
        markdownPath,
        templateDir,
        templateName: "default",
        config: {
          variables: {
            klantnaam: "Config BV",
            vervaldatum: "21-02-2026",
          },
        },
      });

      expect(result.html).toContain("Hallo Frontmatter BV");
      expect(result.html).toContain("Geldig tot 2026/02/21");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("chapters apply first frontmatter globally and chapter frontmatter locally", async () => {
    const tempDir = resolve(tmpdir(), `publishpipe-render-chapters-${Date.now()}`);
    await mkdir(resolve(tempDir, "content"), { recursive: true });

    await Bun.write(
      resolve(tempDir, "content/01-first.md"),
      `---
title: Chapter Vars
klantnaam: First BV
vervaldatum: 21-02-2026
---

# One
{{klantnaam}} {{vervaldatum | format("YYYYMMDD")}} {{contact}} {{tag}}
`
    );

    await Bun.write(
      resolve(tempDir, "content/02-second.md"),
      `---
klantnaam: Second BV
---

# Two
{{klantnaam}} {{vervaldatum | format("YYYYMMDD")}} {{contact}} {{tag}}
`
    );

    try {
      const result = await render({
        templateDir,
        templateName: "default",
        cwd: tempDir,
        config: {
          chapters: ["content/01-first.md", "content/02-second.md"],
          variables: {
            klantnaam: "Config BV",
            vervaldatum: "01-01-2026",
            contact: "hello@example.com",
          },
        },
        variables: { tag: "RUNTIME" },
      });

      expect(result.html).toContain("First BV 20260221");
      expect(result.html).toContain("Second BV 20260221");
      expect(result.html).toContain("hello@example.com");
      expect(result.html).toContain("RUNTIME");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("formats dates with Dutch locale when date_locale is nl", async () => {
    const tempDir = resolve(tmpdir(), `publishpipe-render-locale-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    const markdownPath = resolve(tempDir, "locale.md");

    await Bun.write(
      markdownPath,
      `---
title: Locale Test
vervaldatum: 12-02-2026
---

{{vervaldatum | format("D MMMM YYYY")}}
`
    );

    try {
      const result = await render({
        markdownPath,
        templateDir,
        templateName: "default",
        config: {
          date_locale: "nl",
        },
      });

      expect(result.html).toContain("12 februari 2026");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("warns when markdown template variables are missing", async () => {
    const tempDir = resolve(tmpdir(), `publishpipe-render-missing-vars-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    const markdownPath = resolve(tempDir, "missing-vars.md");

    await Bun.write(
      markdownPath,
      `---
title: Missing Vars
---

Hello {{klantnaam}}.
`
    );

    const messages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      messages.push(args.map((v) => String(v)).join(" "));
    };

    try {
      await render({
        markdownPath,
        templateDir,
        templateName: "default",
        config: {},
      });
      expect(messages.join("\n")).toContain("Missing template variables");
      expect(messages.join("\n")).toContain("klantnaam");
    } finally {
      console.warn = originalWarn;
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("warns when template.njk variables are missing", async () => {
    const tempDir = resolve(tmpdir(), `publishpipe-render-missing-template-vars-${Date.now()}`);
    const templateRoot = resolve(tempDir, "templates");
    const templateName = "custom";
    await mkdir(resolve(templateRoot, templateName), { recursive: true });
    const markdownPath = resolve(tempDir, "doc.md");

    await Bun.write(
      resolve(templateRoot, templateName, "template.njk"),
      `<!doctype html><html><body>{{content}} {{required_a}} {{required_b}}</body></html>`
    );
    await Bun.write(resolve(markdownPath), "# Hello");

    const messages: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      messages.push(args.map((v) => String(v)).join(" "));
    };

    try {
      await render({
        markdownPath,
        templateDir: templateRoot,
        templateName,
        config: {},
      });
      const output = messages.join("\n");
      expect(output).toContain(`template "${templateName}/template.njk"`);
      expect(output).toContain("required_a");
      expect(output).toContain("required_b");
    } finally {
      console.warn = originalWarn;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
