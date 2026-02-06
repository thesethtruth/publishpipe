import { mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { resolve } from "path";

async function runPagedJs(html: string, outputPath: string, workingDir: string): Promise<void> {
  if (process.env.PUBLISHPIPE_TEST_FAKE_PDF === "1") {
    // Test mode: avoid invoking pagedjs-cli in constrained environments.
    await Bun.write(outputPath, "%PDF-1.4\n% publishpipe test artifact\n");
    return;
  }

  const tempRoot = resolve(workingDir, ".publishpipe-tmp");
  await mkdir(tempRoot, { recursive: true });

  const tmpHtml = resolve(tempRoot, `publishpipe-${Date.now()}-${randomUUID()}.html`);
  await Bun.write(tmpHtml, html);

  try {
    const proc = Bun.spawn(["bunx", "pagedjs-cli", tmpHtml, "-o", outputPath], {
      cwd: workingDir,
      env: {
        ...process.env,
        TMPDIR: tempRoot,
      },
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`pagedjs-cli failed with exit code ${exitCode}`);
    }
  } finally {
    await Bun.file(tmpHtml).delete();
  }
}

export async function buildPdfFromHtml(html: string, outputPath: string, workingDir: string): Promise<void> {
  await runPagedJs(html, outputPath, workingDir);
}
