# vapi-quote-api

A minimal **x402 paid API**: `GET /api/quote` returns a random
inspirational quote (JSON) for **$0.001 USDC per call on Base mainnet**
(`eip155:8453`). Payments go to the agent wallet
`0x112b5A6c9d94199e264949a0da5AA0eAD1a7324D`.

Built to be listed on **vAPI Call** (api.vapinetwork.ai → Call → My APIs →
Add your API) to complete the "API listed" quest. No external API keys,
no external data sources, no secrets in the repo — the quote list is
built in (16 quotes).

## How it works (x402 v2, `exact` scheme)

1. Client calls `GET /api/quote` with no payment header.
   The server answers **HTTP 402** with a `PAYMENT-REQUIRED` header
   (base64 JSON: scheme `exact`, network `eip155:8453`, amount `1000`
   atomic USDC = $0.001, asset = Base USDC
   `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, payTo = agent wallet).
2. Client signs an EIP-3009 `transferWithAuthorization` for $0.001 USDC
   and retries with a `PAYMENT-SIGNATURE` header.
3. The server asks the facilitator to **verify** the signature, runs the
   handler, then **settles** the payment on-chain (only if the handler
   returned < 400) and attaches a `PAYMENT-RESPONSE` header with the
   settlement receipt.
4. Client receives **HTTP 200** + the quote JSON.

The server never holds a private key and never signs anything — the
facilitator does the on-chain settlement.

## Stack

- [Hono](https://hono.dev/) + `@x402/hono` `paymentMiddleware`
  (x402 v2, scoped packages — the old unscoped `x402`/`x402-hono`
  packages are v1/legacy and are NOT used)
- `@x402/evm` `ExactEvmScheme`, `@x402/core` `HTTPFacilitatorClient`
- `@coinbase/x402` `createFacilitatorConfig` (CDP facilitator)
- Vercel serverless function, **Node runtime** (`api/quote.ts`)
- Node >= 20, TypeScript (strict, `tsc --noEmit` passes)

## Facilitator — READ THIS FIRST

The facilitator verifies signatures and settles payments. The task brief
assumed the Coinbase public facilitator at `https://x402.org/facilitator`
would work for Base mainnet. **It does not.** Checked live on
2026-11-21 via its `/supported` endpoint: it only supports testnets
(Base Sepolia `eip155:84532`, Solana devnet, ...). There is no
`eip155:8453` in its list.

So this project defaults to the **Coinbase CDP facilitator**, the
documented mainnet path (also used in Stripe's official x402 guide):

- URL: `https://api.cdp.coinbase.com/platform/v2/x402`
- Auth: `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`
- Cost: **first 1,000 settlements/month free**, then $0.001 each.
  (At $0.001/call, settlements beyond the free 1,000 would eat the
  whole payment — but the quest only needs the API listed, and the
  free tier covers realistic test/quest traffic.)

You can override the facilitator with the `FACILITATOR_URL` env var
(see `.env.example`). Notes on the alternatives:

- `https://x402.org/facilitator` — public, no keys, **testnets only**.
  Use it only if you switch the route to Base Sepolia.
- `https://facilitator.payai.network` — public, no keys, **does**
  support Base mainnet `eip155:8453` (verified live). But it charges
  the seller a per-settlement fee in credits (~$0.00148 per Base
  mainnet settlement per its `/supported` pricing), so it is not free.
  It was used only for local testing of the 402 path.

If neither `FACILITATOR_URL` nor CDP keys are set, the function throws
a clear error at startup instead of failing later with a confusing 500.

## Get CDP API keys (free, ~5 minutes, on your phone or computer)

1. Go to https://portal.cdp.coinbase.com/ and sign up / sign in
   (email + password; this is a Coinbase developer account, not a wallet).
2. Create an API key: **API Keys → Create API Key**. Keep the key ID
   and the secret somewhere safe — the secret is shown once.
3. No card is needed for the facilitator free tier.
4. You will paste these two values into Vercel as env vars in the
   deploy step below. **Never paste them into a chat.**

## Deploy on Vercel (free Hobby tier)

Prerequisite: the code is in a GitHub repo (e.g. `jhonrudi12/vapi-quote-api`).
Push this folder as the repo root. Then:

1. Go to https://vercel.com/ and sign in (use **Continue with GitHub**).
2. **Add New… → Project → Import** the `vapi-quote-api` repo.
3. Framework preset: leave it as detected (no framework / Other).
   Root directory: the repo root. Build command / output: leave empty
   (Vercel auto-detects the `api/` serverless function; no build step).
4. **Environment Variables** — add these three (Production):
   - `CDP_API_KEY_ID` = your CDP key id
   - `CDP_API_KEY_SECRET` = your CDP key secret
   - (optional) `PAY_TO` = `0x112b5A6c9d94199e264949a0da5AA0eAD1a7324D`
     (already the default — only set it if you want a different recipient)
5. **Deploy**. Wait for "Ready".
6. Your URL will be `https://vapi-quote-api-<something>.vercel.app`.
   The paid endpoint is `https://<your-url>/api/quote`.

No build command is needed: Vercel compiles the TypeScript function
automatically. Hobby tier limits: 10s function timeout (a verify+settle
round trip is normally 1–3s) and 100 GB-hours/month — far above what
this API needs.

## Test it

Replace `<url>` with your deployed URL.

**1. No payment → expect HTTP 402 with a valid x402 body:**

```bash
curl -i <url>/api/quote
# HTTP/1.1 402 Payment Required
# payment-required: eyJ4NDAyVmVyc2lvbiI6Mi... (base64 JSON)
# {"error":"Payment required"}
```

Decode the header to check the offer:

```bash
curl -s -D - -o /dev/null <url>/api/quote \
  | grep -i "^payment-required" | sed 's/^payment-required: //' \
  | tr -d '\r' | base64 -d | python3 -m json.tool
# accepts: [{ scheme: "exact", network: "eip155:8453", amount: "1000",
#   asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
#   payTo: "0x112b5A6c9d94199e264949a0da5AA0eAD1a7324D", ... }]
```

**2. Paid call → expect HTTP 200 + a quote** (from Termux, where the
agent wallet is unlocked; the wallet needs a little USDC on Base):

```bash
vapi pay '<url>/api/quote' \
  --method GET \
  --network eip155:8453 \
  --expected-pay-to 0x112b5A6c9d94199e264949a0da5AA0eAD1a7324D \
  --max 0.01
# status 200, body: {"quote": "...", "author": "...", ...}
# payment.settlement.success: true, transaction: 0x...
```

The `$0.001` call is inside vAPI's $0.10/call cap. The `--max 0.01`
is a safety ceiling for the client, not the price.

**3. Free info route** (no payment, useful for the listing page):

```bash
curl -s <url>/
# {"service":"vapi-quote-api","endpoint":"/api/quote","price":"$0.001",...}
```

## List it on vAPI Call ("API listed" quest)

1. Open https://api.vapinetwork.ai/ → **Call → My APIs → Add your API**.
2. Paste your endpoint URL: `https://<your-url>/api/quote`.
3. Fill in name/description (e.g. name "Quote API", description
   "A random inspirational quote, $0.001 USDC per call on Base").
4. Submit. The "API listed" badge should unlock once the listing is live.

## Local development / testing

```bash
npm install
npm run typecheck   # tsc --noEmit
# 402-path test (PayAI public facilitator supports Base mainnet, no keys):
FACILITATOR_URL=https://facilitator.payai.network npm run dev
# then: curl -i http://localhost:3000/api/quote   (expect 402)
```

Do NOT run the local server with real CDP keys unless you need to test
a real settlement, and never commit a `.env` file (see `.gitignore`).

## Files

| File | What it is |
| --- | --- |
| `api/quote.ts` | Vercel serverless entrypoint (Node runtime). Converts Node (req, res) to a web Request, calls the Hono app, writes the Response back. |
| `src/app.ts` | Hono app: payment middleware on `GET /api/quote` ($0.001, exact, Base), quote handler, free `/` info route. |
| `src/facilitator.ts` | Facilitator client factory: CDP by default, `FACILITATOR_URL` override. |
| `src/quotes.ts` | 16 built-in quotes + random picker. No external calls. |
| `src/dev.ts` | Local dev server (same app as Vercel, via `@hono/node-server`). |
| `package.json` | Deps: `hono`, `@x402/{hono,evm,core}` 2.32.0, `@coinbase/x402` 2.1.0. Dev: `tsx`, `typescript`, `@hono/node-server`. |
| `tsconfig.json` | Strict TS, NodeNext. |
| `vercel.json` | Minimal (schema only; no build config needed). |
| `.env.example` | Env var template (keys never committed). |
| `.gitignore` | `node_modules/`, `.env`, `.vercel/`, `dist/`. |

## What was verified locally (2026-11-21)

- `tsc --noEmit` passes.
- `curl` without payment → **402** with a valid x402 v2
  `PAYMENT-REQUIRED` body (decoded and checked: exact / eip155:8453 /
  amount `1000` / Base USDC asset / payTo agent wallet).
- A malformed `PAYMENT-SIGNATURE` → 402 "No matching payment requirements".
- A structurally valid but fake-signed payload → facilitator verify
  rejects it (`invalid_exact_evm_signature`) → 402, no quote served,
  nothing settled. The verify path is fully wired.
- The exact deployed entrypoint (`api/quote.ts`) was served locally
  and returned the same 402.
- Free `/` route returns the API info JSON.

## What was NOT verified (flagged uncertainty)

- **A real end-to-end paid call (200 + quote + on-chain settle) was
  not tested.** It needs a real wallet signature; no wallet or key
  was used in this build (by design). The settle path is the SDK's
  standard `paymentMiddleware` flow (verify → handler → settle if the
  handler returned < 400), reviewed against the installed SDK source
  and the official guides. Test it with the `vapi pay` command above
  after deploying; the first real call should cost exactly $0.001.
- **The CDP facilitator was not exercised live** (no keys exist yet).
  Its URL, auth scheme (`createFacilitatorConfig` → JWT auth headers),
  and free-tier terms are from the installed `@coinbase/x402` 2.1.0
  source and the official docs. If `/verify` or `/settle` returns 401
  after deploy, the CDP keys are wrong or not set in Vercel.
- **The vAPI "API listed" quest step itself** (the Add-your-API form
  and its validation) is a browser step for the user; it was not
  tested. If the form rejects the URL, check that the endpoint
  returns the 402 above — a listing crawler that gets a 402 with a
  valid x402 body is the expected, correct behavior for a paid API.

## Versions used

- `@x402/hono`, `@x402/evm`, `@x402/core`: **2.32.0**
- `@coinbase/x402`: **2.1.0**
- `hono`: **4.13.19**
- Node **24.22.1** (local test), Vercel Node runtime 20+ (engines: >=20)
