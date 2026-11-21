/**
 * Hono app for the paid quote API.
 *
 * Flow (x402 v2, "exact" scheme, EIP-3009 USDC on Base mainnet):
 *   1. Client calls GET /api/quote with no payment header.
 *      -> paymentMiddleware answers HTTP 402 with a PAYMENT-REQUIRED
 *         header (base64 JSON: scheme, network, amount, asset, payTo).
 *   2. Client signs an EIP-3009 transfer authorization for $0.001 USDC
 *      to PAY_TO and retries with a PAYMENT-SIGNATURE header.
 *   3. The middleware asks the facilitator to verify the signature,
 *      runs the handler below, then settles the payment on-chain
 *      (only if the handler returned < 400) and attaches a
 *      PAYMENT-RESPONSE header with the settlement receipt.
 *   4. Client receives HTTP 200 + the quote JSON.
 *
 * The app factory is shared by the Vercel entrypoint (api/quote.ts)
 * and the local dev server (src/dev.ts), so local tests exercise the
 * exact code that gets deployed.
 */
import { Hono } from "hono";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { getFacilitatorClient } from "./facilitator.js";
import { randomQuote, QUOTES } from "./quotes.js";

/** Base mainnet, CAIP-2 network id. */
export const NETWORK = "eip155:8453";

/** Where the $0.001 per call goes. Defaults to the owner's agent wallet. */
export const PAY_TO =
  process.env.PAY_TO?.trim() ||
  "0x112b5A6c9d94199e264949a0da5AA0eAD1a7324D";

/** Price per call. USDC has 6 decimals, so $0.001 = 1000 atomic units. */
export const PRICE = "$0.001";

export function createApp(): Hono {
  const facilitatorClient = getFacilitatorClient();

  const server = new x402ResourceServer(facilitatorClient).register(
    NETWORK,
    new ExactEvmScheme(),
  );

  const app = new Hono();

  // Protect GET /api/quote. Any other route passes through untouched.
  app.use(
    paymentMiddleware(
      {
        "GET /api/quote": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE,
              network: NETWORK,
              payTo: PAY_TO,
            },
          ],
          description:
            "A random inspirational quote, $0.001 in USDC per call on Base.",
          mimeType: "application/json",
        },
      },
      server,
    ),
  );

  // Reached only after the payment was verified (and settled on success).
  app.get("/api/quote", (c) => {
    const q = randomQuote();
    return c.json({
      quote: q.text,
      author: q.author,
      price: PRICE,
      network: NETWORK,
      payTo: PAY_TO,
    });
  });

  // Free info route (not protected) so the listing page / health checks
  // can see what this API is without paying.
  app.get("/", (c) =>
    c.json({
      service: "vapi-quote-api",
      description:
        "A random inspirational quote, $0.001 USDC per call (x402, Base mainnet).",
      endpoint: "/api/quote",
      price: PRICE,
      network: NETWORK,
      payTo: PAY_TO,
      quotes: QUOTES.length,
    }),
  );

  return app;
}
