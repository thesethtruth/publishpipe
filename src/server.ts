import { watch, type FSWatcher } from "fs";
import { resolve } from "path";
import { renderHtml, type HtmlRenderOptions } from "./renderers/html";

const HOT_RELOAD_SCRIPT = `
<script>
  const ws = new WebSocket("ws://" + location.host + "/ws");
  ws.onmessage = (e) => {
    if (e.data === "reload") location.reload();
  };
  ws.onclose = () => setTimeout(() => location.reload(), 1000);
</script>
`;

export interface DevServerOptions {
  port: number;
  initialRenderOptions: HtmlRenderOptions;
  resolveRenderOptions?: () => Promise<HtmlRenderOptions>;
  rootDir: string;
}

export function startDevServer(opts: DevServerOptions) {
  const clients = new Set<{ send(msg: string): void }>();
  let currentRenderOptions = opts.initialRenderOptions;
  let cachedHtml = "";

  const contentWatchers: FSWatcher[] = [];
  const configWatchers: FSWatcher[] = [];
  const templateWatchers: FSWatcher[] = [];

  async function renderPage(): Promise<string> {
    const { html } = await renderHtml(currentRenderOptions);
    return html.replace("</body>", HOT_RELOAD_SCRIPT + "</body>");
  }

  function closeWatchers(watchers: FSWatcher[]) {
    while (watchers.length > 0) {
      watchers.pop()?.close();
    }
  }

  function addContentWatcher(path: string, label: string) {
    contentWatchers.push(
      watch(path, () => {
        console.log(`${label}:`, path);
        void rebuild(false);
      })
    );
  }

  function syncContentWatchers() {
    closeWatchers(contentWatchers);

    if (currentRenderOptions.markdownPath) {
      addContentWatcher(resolve(currentRenderOptions.markdownPath), "Change detected");
    }

    const cwd = currentRenderOptions.cwd ?? process.cwd();
    const chapters = currentRenderOptions.config?.chapters;
    if (chapters?.length) {
      for (const chapter of chapters) {
        addContentWatcher(resolve(cwd, chapter), "Chapter change");
      }
    }
  }

  function syncTemplateWatchers() {
    closeWatchers(templateWatchers);
    const templatePath = resolve(currentRenderOptions.templateDir, currentRenderOptions.templateName);
    templateWatchers.push(
      watch(templatePath, { recursive: true }, (_event, filename) => {
        console.log("Template change:", filename);
        void rebuild(false);
      })
    );
  }

  async function refreshRenderOptions() {
    if (!opts.resolveRenderOptions) {
      return;
    }

    currentRenderOptions = await opts.resolveRenderOptions();
    syncContentWatchers();
    syncTemplateWatchers();
  }

  async function rebuild(refreshOptions: boolean) {
    try {
      if (refreshOptions) {
        await refreshRenderOptions();
      }
      cachedHtml = await renderPage();
      for (const client of clients) {
        client.send("reload");
      }
    } catch (err) {
      console.error("Rebuild error:", err);
    }
  }

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

  syncContentWatchers();
  syncTemplateWatchers();

  const projectConfigPath = resolve(currentRenderOptions.cwd ?? process.cwd(), "publishpipe.config.ts");
  try {
    configWatchers.push(
      watch(projectConfigPath, () => {
        console.log("Config change detected, rebuilding...");
        void rebuild(true);
      })
    );
  } catch {
    // Optional project config.
  }

  const rootConfigPath = resolve(opts.rootDir, "publishpipe.config.ts");
  if (resolve(rootConfigPath) !== resolve(projectConfigPath)) {
    try {
      configWatchers.push(
        watch(rootConfigPath, () => {
          console.log("Root config change detected, rebuilding...");
          void rebuild(true);
        })
      );
    } catch {
      // Optional root config.
    }
  }

  // Keep API parity with previous implementation by cleaning up watchers on stop.
  const originalStop = server.stop.bind(server);
  server.stop = ((closeActiveConnections?: boolean) => {
    closeWatchers(contentWatchers);
    closeWatchers(configWatchers);
    closeWatchers(templateWatchers);
    return originalStop(closeActiveConnections);
  }) as typeof server.stop;

  console.log(`Dev server running at http://localhost:${opts.port}`);
  return server;
}
