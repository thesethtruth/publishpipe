import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { resolve } from "path";
import { loadTemplateCss } from "./template";

const rootDir = resolve(import.meta.dir, "../..");
const templateRoot = resolve(rootDir, "templates/_test-cycle");

describe("template css inheritance", () => {
  beforeAll(async () => {
    await mkdir(resolve(templateRoot, "a"), { recursive: true });
    await mkdir(resolve(templateRoot, "b"), { recursive: true });

    await Bun.write(resolve(templateRoot, "a/style.css"), "/* @extends b */\n.a { color: red; }");
    await Bun.write(resolve(templateRoot, "b/style.css"), "/* @extends a */\n.b { color: blue; }");
  });

  afterAll(async () => {
    await rm(templateRoot, { recursive: true, force: true });
  });

  test("throws on cyclic @extends references", async () => {
    await expect(loadTemplateCss(templateRoot, "a")).rejects.toThrow(
      "Template CSS inheritance cycle detected"
    );
  });
});
