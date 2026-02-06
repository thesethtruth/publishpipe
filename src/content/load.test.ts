import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { resolve } from "path";
import { loadDocumentFromInput, resolveSourceDocuments } from "./load";

const rootDir = resolve(import.meta.dir, "../..");
const fixtureDir = resolve(rootDir, "projects/_test-content-model");

describe("content model", () => {
  beforeAll(async () => {
    await mkdir(resolve(fixtureDir, "content"), { recursive: true });

    await Bun.write(
      resolve(fixtureDir, "content/01.md"),
      `---
title: Combined
---

# One
`
    );

    await Bun.write(
      resolve(fixtureDir, "content/02.md"),
      `# Two\n`
    );
  });

  afterAll(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  test("uses first chapter frontmatter and inserts page-break hr between chapters", async () => {
    const doc = await loadDocumentFromInput({
      chapters: ["content/01.md", "content/02.md"],
      cwd: fixtureDir,
    });

    expect(doc.frontmatter.title).toBe("Combined");
    expect(doc.markdown).toContain("# One");
    expect(doc.markdown).toContain("\n\n---\n\n");
    expect(doc.markdown).toContain("# Two");
  });

  test("deduplicates files across overlapping glob patterns", async () => {
    const docs = await resolveSourceDocuments(["content/*.md", "content/01.*"], fixtureDir);
    const paths = docs.map((doc) => doc.path);

    expect(paths.length).toBe(2);
    expect(new Set(paths).size).toBe(2);
  });
});
