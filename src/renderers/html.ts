import { marked } from "marked";
import type { PublishPipeConfig, Theme } from "../config";
import { loadDocumentFromInput } from "../content/load";
import { createTemplateEnv, loadTemplateCss } from "../presentation/template";
import type { PresentationModel } from "../presentation/model";

export interface HtmlRenderOptions {
  markdownPath?: string;
  templateName: string;
  templateDir: string;
  config?: PublishPipeConfig;
  cwd?: string;
}

export interface HtmlRenderResult {
  html: string;
  frontmatter: Record<string, unknown>;
}

function buildPresentationModel(config: PublishPipeConfig, frontmatter: Record<string, unknown>): PresentationModel {
  const theme = (config.theme ?? "light") as Theme;
  return {
    templateName: config.template ?? "default",
    theme,
    titlePage: config.titlePage ?? false,
    proposal: config.proposal ?? false,
    pageSize: config.page?.size ?? "A4",
    pageMargin: config.page?.margin ?? "2.5cm 2cm 2cm 2cm",
    templateVars: {
      ...config.frontmatter,
      ...frontmatter,
    },
  };
}

export async function renderHtml(opts: HtmlRenderOptions): Promise<HtmlRenderResult> {
  const config = opts.config ?? {};
  const cwd = opts.cwd ?? process.cwd();

  const document = await loadDocumentFromInput({
    markdownPath: opts.markdownPath,
    chapters: config.chapters,
    cwd,
  });

  const contentHtml = await marked(document.markdown);
  const presentation = buildPresentationModel(config, document.frontmatter);
  const env = createTemplateEnv(opts.templateDir, opts.templateName);
  const templateCss = await loadTemplateCss(opts.templateDir, opts.templateName);

  const html = env.render("template.njk", {
    content: contentHtml,
    css: templateCss,
    titlePage: presentation.titlePage,
    proposal: presentation.proposal,
    theme: presentation.theme,
    pageSize: presentation.pageSize,
    pageMargin: presentation.pageMargin,
    ...presentation.templateVars,
  });

  return {
    html,
    frontmatter: document.frontmatter,
  };
}
