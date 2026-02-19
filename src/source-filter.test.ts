import { describe, expect, test } from "bun:test";
import { filterSourceFilesByName, normalizeSourceName } from "./source-filter";

describe("source file name filtering", () => {
  test("normalizes optional .md extension", () => {
    expect(normalizeSourceName("notes-weekly-1")).toBe("notes-weekly-1");
    expect(normalizeSourceName("notes-weekly-1.md")).toBe("notes-weekly-1");
    expect(normalizeSourceName("NOTES.md")).toBe("NOTES");
  });

  test("filters by basename without extension", () => {
    const sourceFiles = [
      "/tmp/content/notes-weekly-1.md",
      "/tmp/content/notes-weekly-2.md",
      "/tmp/content/result-weekly-1.md",
    ];

    expect(filterSourceFilesByName(sourceFiles, "notes-weekly-1")).toEqual([
      "/tmp/content/notes-weekly-1.md",
    ]);

    expect(filterSourceFilesByName(sourceFiles, "notes-weekly-2.md")).toEqual([
      "/tmp/content/notes-weekly-2.md",
    ]);

    expect(filterSourceFilesByName(sourceFiles, "missing")).toEqual([]);
  });
});
