import { test, expect, describe } from "bun:test";
import { resolve } from "path";
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
    expect(result.html).toContain("doc-shell");
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

  test("config frontmatter provides default template variables", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "sethdev",
      config: {
        proposal: true,
        frontmatter: {
          bedrijf: "Test BV",
          plaats: "Amsterdam",
        },
      },
    });

    expect(result.html).toContain("Test BV");
    expect(result.html).toContain("Amsterdam");
    expect(result.html).toContain("proposal-cover");
  });

  test("file frontmatter overrides config frontmatter", async () => {
    // 01-intro.md has title: "Project Proposal" in frontmatter
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "sethdev",
      config: {
        proposal: true,
        frontmatter: {
          title: "Should Be Overridden",
          bedrijf: "Config BV",
        },
      },
    });

    // file frontmatter title wins over config frontmatter title
    expect(result.html).toContain("Project Proposal");
    expect(result.html).not.toContain("Should Be Overridden");
    // config frontmatter still provides values not in file
    expect(result.html).toContain("Config BV");
  });

  test("proposal cover renders with sethdev template", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "sethdev",
      config: {
        proposal: true,
        frontmatter: {
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

  test("pdf profile injects a TOC page instead of interactive shell", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "default",
      profile: "pdf",
      config: {},
    });

    expect(result.html).toContain('class="toc-page"');
    expect(result.html).not.toContain('<div class="doc-shell">');
  });

  test("toc can be disabled", async () => {
    const result = await render({
      markdownPath: resolve(projectDir, "content/01-intro.md"),
      templateDir,
      templateName: "default",
      profile: "interactive",
      config: { toc: false },
    });

    expect(result.html).not.toContain('<aside class="doc-toc">');
    expect(result.html).toContain("doc-body");
  });
});
