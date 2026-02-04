import { defineConfig } from "./src/config";

export default defineConfig({
  template: "default",
  titlePage: true,
  theme: "light",
  page: {
    size: "A4",
    margin: "2.5cm 2cm",
  },
  chapters: [
    "content/01-intro.md",
    "content/02-background.md",
    "content/03-conclusion.md",
  ],
  output: "proposal.pdf",
});
