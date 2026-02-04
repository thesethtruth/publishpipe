import { watch } from "fs";
import { resolve, dirname } from "path";
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

  // Watch markdown file
  const mdPath = resolve(opts.markdownPath);
  watch(mdPath, () => {
    console.log("Change detected:", mdPath);
    rebuild();
  });

  // Watch template directory
  const templatePath = resolve(opts.templateDir, opts.templateName);
  watch(templatePath, { recursive: true }, (event, filename) => {
    console.log("Template change:", filename);
    rebuild();
  });

  console.log(`Dev server running at http://localhost:${opts.port}`);
  return server;
}
