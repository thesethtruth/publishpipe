import { basename } from "path";

export function normalizeSourceName(name: string): string {
  return name.replace(/\.md$/i, "");
}

export function filterSourceFilesByName(
  sourceFiles: string[],
  name: string
): string[] {
  const requestedName = normalizeSourceName(name);
  return sourceFiles.filter(
    (file) => basename(file, ".md") === requestedName
  );
}
