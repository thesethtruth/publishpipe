export interface SourceDocument {
  path: string;
  filenameStem: string;
}

export interface DocumentModel {
  frontmatter: Record<string, unknown>;
  markdown: string;
}
