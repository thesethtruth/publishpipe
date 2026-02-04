import { defineConfig } from "../../src/config";

export default defineConfig({
  chapters: [
    "content/01-intro.md",
    "content/02-background.md",
    "content/03-conclusion.md",
  ],
  output: "proposal.pdf",
});
