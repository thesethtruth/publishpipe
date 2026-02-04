import { test, expect, describe } from "bun:test";
import { resolve } from "path";
import { loadConfig, loadProjectConfig, defineConfig } from "./config";

const rootDir = resolve(import.meta.dir, "..");
const projectDir = resolve(rootDir, "projects/example-proposal");

describe("defineConfig", () => {
  test("passes config through unchanged", () => {
    const config = { template: "fancy", theme: "dark" as const };
    expect(defineConfig(config)).toEqual(config);
  });
});

describe("loadConfig", () => {
  test("loads root config", async () => {
    const config = await loadConfig(rootDir);
    expect(config.template).toBe("default");
    expect(config.theme).toBe("light");
    expect(config.page?.size).toBe("A4");
  });

  test("loads project config", async () => {
    const config = await loadConfig(projectDir);
    expect(config.chapters).toEqual([
      "content/01-intro.md",
      "content/02-background.md",
      "content/03-conclusion.md",
    ]);
    expect(config.output).toBe("proposal.pdf");
  });

  test("returns empty config for nonexistent dir", async () => {
    const config = await loadConfig("/tmp/does-not-exist-publishpipe");
    expect(config).toEqual({});
  });
});

describe("loadProjectConfig", () => {
  test("returns root config when projectDir is null", async () => {
    const config = await loadProjectConfig(rootDir, null);
    expect(config.template).toBe("default");
    expect(config.chapters).toBeUndefined();
  });

  test("returns root config when projectDir equals rootDir", async () => {
    const config = await loadProjectConfig(rootDir, rootDir);
    expect(config.template).toBe("default");
  });

  test("merges project config over root defaults", async () => {
    const config = await loadProjectConfig(rootDir, projectDir);
    // from root
    expect(config.template).toBe("default");
    expect(config.theme).toBe("light");
    expect(config.titlePage).toBe(true);
    // from project (overrides)
    expect(config.chapters).toEqual([
      "content/01-intro.md",
      "content/02-background.md",
      "content/03-conclusion.md",
    ]);
    expect(config.output).toBe("proposal.pdf");
  });

  test("nested-merges page config", async () => {
    const config = await loadProjectConfig(rootDir, projectDir);
    // root sets page.size and page.margin, project doesn't override
    expect(config.page?.size).toBe("A4");
    expect(config.page?.margin).toBe("2.5cm 2cm");
  });
});
