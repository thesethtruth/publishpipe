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
});
