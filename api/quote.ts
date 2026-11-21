/**
 * Vercel serverless entrypoint (Node runtime).
 *
 * File-based routing maps this file to GET /api/quote.
 *
 * NOTE on the adapter: `handle` from `hono/vercel` / `@hono/vercel` is a
 * web fetch handler — `(req: Request) => Response` — built for Vercel's
 * Edge runtime, NOT for the Node runtime. A Node serverless function
 * receives Node's (req, res), so this file converts between the two:
 * Node IncomingMessage -> web Request -> app.fetch() -> Node response.
 * The conversion is exercised by the local smoke test (see README).
 *
 * Required env vars (set in the Vercel dashboard, not in this repo):
 *   CDP_API_KEY_ID, CDP_API_KEY_SECRET   (Coinbase CDP facilitator)
 *   — or FACILITATOR_URL to use a different facilitator.
 * Optional: PAY_TO (defaults to the agent wallet in src/app.ts).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app.js";

const app = createApp();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const host = req.headers.host ?? "localhost";
  const url = `https://${host}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    // Buffer is a valid fetch body at runtime; the undici BodyInit type
    // just doesn't list it, so cast at this boundary.
    body = (await readBody(req)) as unknown as BodyInit;
  }

  const request = new Request(url, {
    method: req.method ?? "GET",
    headers,
    body,
  });

  const response = await app.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
