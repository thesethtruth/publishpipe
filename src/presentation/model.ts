import type { Theme } from "../config";

export interface PresentationModel {
  templateName: string;
  theme: Theme;
  titlePage: boolean;
  proposal: boolean;
  pageSize: string;
  pageMargin: string;
  templateVars: Record<string, unknown>;
}
