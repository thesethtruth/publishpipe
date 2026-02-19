import { test, expect, describe } from "bun:test";
import { resolve } from "path";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
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

  test("merges variables from root and project configs", async () => {
    const tempRoot = resolve(tmpdir(), `publishpipe-config-test-${Date.now()}`);
    const tempProject = resolve(tempRoot, "projects", "vars-project");
    await mkdir(tempProject, { recursive: true });

    await Bun.write(
      resolve(tempRoot, "publishpipe.config.ts"),
      `import { defineConfig } from "${resolve(rootDir, "src/config.ts").replace(/\\/g, "/")}";

export default defineConfig({
  variables: {
    company: "Root BV",
    city: "Utrecht",
  },
});
`
    );

    await Bun.write(
      resolve(tempProject, "publishpipe.config.ts"),
      `import { defineConfig } from "${resolve(rootDir, "src/config.ts").replace(/\\/g, "/")}";

export default defineConfig({
  variables: {
    city: "Amsterdam",
    contact: "hello@example.com",
  },
});
`
    );

    try {
      const config = await loadProjectConfig(tempRoot, tempProject);
      expect(config.variables).toEqual({
        company: "Root BV",
        city: "Amsterdam",
        contact: "hello@example.com",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
