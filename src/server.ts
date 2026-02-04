import { watch, type FSWatcher } from "fs";
import { resolve } from "path";
import { render, type RenderOptions } from "./render";

const HOT_RELOAD_SCRIPT = `
<script>
  const ws = new WebSocket("ws://" + location.host + "/ws");
  ws.onmessage = (e) => {
    if (e.data === "reload") location.reload();
  };
  ws.onclose = () => setTimeout(() => location.reload(), 1000);
</script>
`;

export function startDevServer(opts: RenderOptions & { port: number }) {
  const clients = new Set<{ send(msg: string): void }>();

  async function renderPage(): Promise<string> {
    const { html } = await render(opts);
    // Inject hot reload script before </body>
    return html.replace("</body>", HOT_RELOAD_SCRIPT + "</body>");
  }

  let cachedHtml = "";

  const server = Bun.serve({
    port: opts.port,
    async fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return undefined;
      }

      // Serve rendered HTML
      if (!cachedHtml) {
        cachedHtml = await renderPage();
      }
      return new Response(cachedHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
    websocket: {
      open(ws) {
        clients.add(ws);
      },
      close(ws) {
        clients.delete(ws);
      },
      message() {},
    },
  });

  async function rebuild() {
    try {
      cachedHtml = await renderPage();
      for (const client of clients) {
        client.send("reload");
      }
    } catch (err) {
      console.error("Rebuild error:", err);
    }
  }

  const watchers: FSWatcher[] = [];

  // Watch single markdown file if provided
  if (opts.markdownPath) {
    const mdPath = resolve(opts.markdownPath);
    watchers.push(
      watch(mdPath, () => {
        console.log("Change detected:", mdPath);
        rebuild();
      })
    );
  }

  // Watch chapter files
  const chapters = opts.config?.chapters;
  if (chapters?.length) {
    for (const chapter of chapters) {
      const chapterPath = resolve(chapter);
      watchers.push(
        watch(chapterPath, () => {
          console.log("Chapter change:", chapterPath);
          rebuild();
        })
      );
    }
  }

  // Watch config file
  const configPath = resolve(process.cwd(), "publishpipe.config.ts");
  try {
    watchers.push(
      watch(configPath, () => {
        console.log("Config change detected, rebuilding...");
        rebuild();
      })
    );
  } catch {
    // Config file may not exist, that's fine
  }

  // Watch template directory
  const templatePath = resolve(opts.templateDir, opts.templateName);
  watchers.push(
    watch(templatePath, { recursive: true }, (_event, filename) => {
      console.log("Template change:", filename);
      rebuild();
    })
  );

  console.log(`Dev server running at http://localhost:${opts.port}`);
  return server;
}
