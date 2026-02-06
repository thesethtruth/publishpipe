import matter from "gray-matter";
import { Glob } from "bun";
import { basename, resolve } from "path";
import type { DocumentModel, SourceDocument } from "./model";

export interface MarkdownDocument {
  frontmatter: Record<string, unknown>;
  body: string;
}

export async function readMarkdownFile(filePath: string): Promise<MarkdownDocument> {
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
      const chapterPath = chapters[i];
      if (!chapterPath) {
        continue;
      }
      const absPath = resolve(cwd, chapterPath);
      const { frontmatter: fm, body } = await readMarkdownFile(absPath);
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
    const { frontmatter, body } = await readMarkdownFile(markdownPath);
    return { frontmatter, markdown: body };
  }

  throw new Error("No content source: provide markdownPath or config.chapters");
}

export function splitMarkdownByH1(markdown: string): Array<{ title: string; markdown: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ title: string; markdown: string }> = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      if (currentTitle !== null) {
        sections.push({
          title: currentTitle,
          markdown: currentLines.join("\n").trim(),
        });
      }
      currentTitle = (h1[1] ?? "Section").trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle !== null) {
    sections.push({
      title: currentTitle,
      markdown: currentLines.join("\n").trim(),
    });
  }

  return sections.filter((section) => section.markdown.length > 0);
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
