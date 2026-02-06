import nunjucks from "nunjucks";
import { resolve } from "path";

export async function loadTemplateCss(
  templateDir: string,
  templateName: string,
  stack: string[] = []
): Promise<string> {
  if (stack.includes(templateName)) {
    const chain = [...stack, templateName].join(" -> ");
    throw new Error(`Template CSS inheritance cycle detected: ${chain}`);
  }

  const stylePath = resolve(templateDir, templateName, "style.css");
  const styleFile = Bun.file(stylePath);
  if (!(await styleFile.exists())) {
    if (stack.length > 0) {
      throw new Error(`Template '${templateName}' is missing style.css required by @extends`);
    }
    return "";
  }

  const css = await styleFile.text();
  const extendsMatch = css.match(/^\/\*\s*@extends\s+([\w-]+)\s*\*\//);

  if (!extendsMatch) {
    return css;
  }

  const parentName = extendsMatch[1];
  if (!parentName) {
    return css;
  }
  const parentCss = await loadTemplateCss(templateDir, parentName, [...stack, templateName]);
  const childCss = css.replace(/^\/\*\s*@extends\s+[\w-]+\s*\*\/\n?/, "");
  return `${parentCss}\n${childCss}`;
}

export function createTemplateEnv(templateDir: string, templateName: string): nunjucks.Environment {
  const templatePath = resolve(templateDir, templateName);
  return new nunjucks.Environment(new nunjucks.FileSystemLoader(templatePath), {
    autoescape: false,
  });
}
