import matter from "gray-matter";
import { Glob } from "bun";
import { basename, resolve } from "path";
import type { DocumentModel, SourceDocument } from "./model";

async function readMarkdown(
  filePath: string
): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  const raw = await Bun.file(filePath).text();
  const { data, content } = matter(raw);
  return { frontmatter: data, body: content };
}

export async function loadDocumentFromInput(opts: {
  markdownPath?: string;
  chapters?: string[];
  cwd: string;
}): Promise<DocumentModel> {
  const { markdownPath, chapters, cwd } = opts;

  if (chapters?.length) {
    const bodies: string[] = [];
    let frontmatter: Record<string, unknown> = {};

    for (let i = 0; i < chapters.length; i++) {
      const absPath = resolve(cwd, chapters[i]);
      const { frontmatter: fm, body } = await readMarkdown(absPath);
      if (i === 0) {
        frontmatter = fm;
      }
      bodies.push(body);
    }

    return {
      frontmatter,
      markdown: bodies.join("\n\n---\n\n"),
    };
  }

  if (markdownPath) {
    const { frontmatter, body } = await readMarkdown(markdownPath);
    return { frontmatter, markdown: body };
  }

  throw new Error("No content source: provide markdownPath or config.chapters");
}

export async function resolveSourceDocuments(
  patterns: string[],
  cwd: string
): Promise<SourceDocument[]> {
  const seen = new Set<string>();
  const results: SourceDocument[] = [];

  for (const pattern of patterns) {
    const glob = new Glob(pattern);
    for await (const file of glob.scan({ cwd, absolute: true })) {
      if (seen.has(file)) {
        continue;
      }
      seen.add(file);
      results.push({
        path: file,
        filenameStem: basename(file, ".md"),
      });
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}
