import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { loadConfig, loadProjectConfig, defineConfig } from "./config";

const repoRoot = resolve(import.meta.dir, "..");
const tempRoot = resolve(tmpdir(), `publishpipe-config-fixture-${Date.now()}`);
const tempProject = resolve(tempRoot, "projects", "fixture-project");
const configImportPath = resolve(repoRoot, "src/config.ts").replace(/\\/g, "/");

beforeAll(async () => {
  await mkdir(tempProject, { recursive: true });

  await Bun.write(
    resolve(tempRoot, "publishpipe.config.ts"),
    `import { defineConfig } from "${configImportPath}";

export default defineConfig({
  template: "default",
  titlePage: true,
  theme: "light",
  page: {
    size: "A4",
    margin: "2.5cm 2cm",
  },
  variables: {
    company: "Root BV",
    city: "Utrecht",
    contact: "root@example.com",
  },
});
`
  );

  await Bun.write(
    resolve(tempProject, "publishpipe.config.ts"),
    `import { defineConfig } from "${configImportPath}";

export default defineConfig({
  chapters: ["content/01.md"],
  output: "proposal.pdf",
  theme: "dark",
  page: {
    margin: "1in",
  },
  variables: {
    city: "Amsterdam",
  },
});
`
  );
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("defineConfig", () => {
  test("passes config through unchanged", () => {
    const config = { template: "fancy", theme: "dark" as const };
    expect(defineConfig(config)).toEqual(config);
  });
});

describe("loadConfig", () => {
  test("loads root config", async () => {
    const config = await loadConfig(tempRoot);
    expect(config.template).toBe("default");
    expect(config.theme).toBe("light");
    expect(config.page?.size).toBe("A4");
  });

  test("loads project config", async () => {
    const config = await loadConfig(tempProject);
    expect(config.chapters).toEqual(["content/01.md"]);
    expect(config.output).toBe("proposal.pdf");
    expect(config.theme).toBe("dark");
  });

  test("returns empty config for nonexistent dir", async () => {
    const config = await loadConfig("/tmp/does-not-exist-publishpipe");
    expect(config).toEqual({});
  });
});

describe("loadProjectConfig", () => {
  test("returns root config when projectDir is null", async () => {
    const config = await loadProjectConfig(tempRoot, null);
    expect(config.template).toBe("default");
    expect(config.chapters).toBeUndefined();
  });

  test("returns root config when projectDir equals rootDir", async () => {
    const config = await loadProjectConfig(tempRoot, tempRoot);
    expect(config.template).toBe("default");
  });

  test("merges project config over root defaults", async () => {
    const config = await loadProjectConfig(tempRoot, tempProject);
    // from root
    expect(config.template).toBe("default");
    expect(config.titlePage).toBe(true);
    // from project (overrides root)
    expect(config.theme).toBe("dark");
    expect(config.output).toBe("proposal.pdf");
    expect(config.chapters).toEqual(["content/01.md"]);
  });

  test("nested-merges page config", async () => {
    const config = await loadProjectConfig(tempRoot, tempProject);
    // root sets page.size, project overrides page.margin
    expect(config.page?.size).toBe("A4");
    expect(config.page?.margin).toBe("1in");
  });

  test("merges variables from root and project configs", async () => {
    const config = await loadProjectConfig(tempRoot, tempProject);
    expect(config.variables).toEqual({
      company: "Root BV",
      city: "Amsterdam",
      contact: "root@example.com",
    });
  });
});
