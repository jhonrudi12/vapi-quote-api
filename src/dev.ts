/**
 * Local dev server — runs the exact same Hono app as the Vercel
 * function, on http://localhost:3000 by default.
 *
 * Usage:
 *   FACILITATOR_URL=https://facilitator.payai.network npm run dev
 *
 * For local testing, FACILITATOR_URL must point at a facilitator that
 * supports the route's network (Base mainnet eip155:8453). The CDP
 * facilitator needs real keys, so local tests use the PayAI public
 * facilitator instead (no keys; it supports eip155:8453).
 * The 402 path (no payment) does not move any money.
 */
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

serve(
  {
    fetch: createApp().fetch,
    port,
  },
  (info) => {
    console.log(`vapi-quote-api listening on http://localhost:${info.port}`);
    console.log(`Try: curl -i http://localhost:${info.port}/api/quote`);
  },
);
