import express from "express";
import type { Deps } from "./execute";
import { execute } from "./execute";
import type { RequestRow } from "./db";
import type { Router } from "express";

export function createApp(d: Deps, world?: Router) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));
  app.use((req, res, next) => {
    // Dashboard reads /requests and /events cross-origin; /execute is authorized by signatures, not origin.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  });

  if (world) app.use(world);
  app.get("/health", (_req, res) => void res.json({ ok: true, audience: d.cfg.SERVICE_AUDIENCE }));

  app.post("/execute", async (req, res) => {
    try {
      const out = await execute(req.body, d);
      res.status(out.decision === "DENIED" ? 403 : out.decision === "PENDING" ? 202 : 200).json(out);
    } catch (e) {
      // Fail closed: any unexpected error is a denial with no side effect beyond what was already persisted.
      res.status(500).json({ decision: "DENIED", checks: [{ name: "internal", ok: false, plainEnglish: "The service hit an error, so nothing was executed.", detail: String(e).slice(0, 300) }], violations: [] });
    }
  });

  app.get("/requests", (_req, res) => {
    const rows = d.db.prepare("SELECT * FROM requests ORDER BY id DESC LIMIT 100").all() as unknown as RequestRow[];
    res.json(rows.map(({ raw_tx: _raw, response, ...r }) => ({ ...r, response: JSON.parse(response) })));
  });

  app.get("/events", (req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n");
    const send = (ev: unknown) => res.write(`event: request\ndata: ${JSON.stringify(ev)}\n\n`);
    const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
    const sendWorld = (ev: unknown) => res.write(`event: world\ndata: ${JSON.stringify(ev)}\n\n`);
    d.events.on("request", send);
    d.events.on("world", sendWorld);
    const sendReceipt = (ev: unknown) => res.write(`event: receipt\ndata: ${JSON.stringify(ev)}\n\n`);
    d.events.on("receipt", sendReceipt);
    req.on("close", () => {
      clearInterval(ping);
      d.events.off("request", send);
      d.events.off("world", sendWorld);
      d.events.off("receipt", sendReceipt);
    });
  });

  // Bad JSON etc. -> structured denial
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(400).json({ decision: "DENIED", checks: [{ name: "schema", ok: false, plainEnglish: "The request body is not valid JSON.", detail: String(err).slice(0, 200) }], violations: [] });
  });
  return app;
}
