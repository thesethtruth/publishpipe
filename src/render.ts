import matter from "gray-matter";
import { marked } from "marked";
import nunjucks from "nunjucks";
import { resolve, dirname } from "path";

export interface RenderOptions {
  markdownPath: string;
  templateName: string;
  templateDir: string;
}

export interface RenderResult {
  html: string;
  frontmatter: Record<string, unknown>;
}

export async function render(opts: RenderOptions): Promise<RenderResult> {
  const mdFile = Bun.file(opts.markdownPath);
  const raw = await mdFile.text();

  // Parse frontmatter + markdown body
  const { data: frontmatter, content: mdBody } = matter(raw);

  // Convert markdown to HTML
  const contentHtml = await marked(mdBody);

  // Load and render Nunjucks template
  const templatePath = resolve(opts.templateDir, opts.templateName);
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(templatePath),
    { autoescape: false }
  );

  // Read template's style.css if it exists
  let templateCss = "";
  const stylePath = resolve(templatePath, "style.css");
  const styleFile = Bun.file(stylePath);
  if (await styleFile.exists()) {
    templateCss = await styleFile.text();
  }

  const html = env.render("template.njk", {
    content: contentHtml,
    css: templateCss,
    ...frontmatter,
  });

  return { html, frontmatter };
}
