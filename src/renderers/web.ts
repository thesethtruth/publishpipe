import { dirname } from "path";
import { mkdir } from "fs/promises";

export async function buildWebFromHtml(html: string, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, html);
}
