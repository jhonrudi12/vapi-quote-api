/**
 * Facilitator client factory.
 *
 * The x402 facilitator is the service that verifies a payer's EIP-3009
 * signature and settles the USDC transfer on-chain. The resource server
 * (this API) never touches a private key and never signs anything.
 *
 * MAINNET (default): the Coinbase CDP facilitator.
 *   - URL: https://api.cdp.coinbase.com/platform/v2/x402
 *   - Auth: CDP API key id + secret (env vars CDP_API_KEY_ID and
 *     CDP_API_KEY_SECRET). First 1,000 settlements per month are free,
 *     then $0.001 per settlement.
 *   - Create free keys at https://portal.cdp.coinbase.com/ (sign up,
 *     then API Keys -> Create API Key). No card is needed for the free tier.
 *
 * OVERRIDE: set FACILITATOR_URL to point at any other facilitator, e.g.
 *   - https://x402.org/facilitator  (Coinbase public facilitator, no keys)
 *     BUT it only supports testnets (Base Sepolia eip155:84532, Solana
 *     devnet, ...). It does NOT support Base mainnet eip155:8453, so it
 *     cannot settle payments for this API's mainnet route.
 *   - https://facilitator.payai.network (PayAI public facilitator, no keys;
 *     supports Base mainnet eip155:8453, but charges the seller a
 *     per-settlement fee in credits — see its /supported pricing).
 *
 * If neither FACILITATOR_URL nor CDP keys are set, this throws a clear
 * error at startup instead of failing later with a confusing 500.
 */
import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { FacilitatorClient } from "@x402/core/server";

export function getFacilitatorClient(): FacilitatorClient {
  const overrideUrl = process.env.FACILITATOR_URL?.trim();
  if (overrideUrl) {
    return new HTTPFacilitatorClient({ url: overrideUrl });
  }

  const keyId = process.env.CDP_API_KEY_ID?.trim();
  const keySecret = process.env.CDP_API_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error(
      "Missing facilitator credentials: set CDP_API_KEY_ID and " +
        "CDP_API_KEY_SECRET (free keys from https://portal.cdp.coinbase.com/) " +
        "or set FACILITATOR_URL to a public facilitator that supports Base " +
        "mainnet (eip155:8453). Note: https://x402.org/facilitator does NOT " +
        "support Base mainnet — it is testnets only.",
    );
  }

  return new HTTPFacilitatorClient(createFacilitatorConfig(keyId, keySecret));
}
