import "zod-openapi";
import { createDocument, type ZodOpenApiOperationObject } from "zod-openapi";
import { z } from "zod";
import { ApiErrorSchema } from "./errors";
import { HealthResponseSchema } from "./health";
import { PoolsQuerySchema, PoolsResponseSchema } from "./pools";
import { SttLookupRequestSchema, SttLookupResponseSchema } from "./stt-lookup";
import { BuildResultSchema } from "./tx-result";
import {
  ConsolidateTxRequestSchema,
  DeployReferenceTxRequestSchema,
  LockFundsTxRequestSchema,
  MintTxRequestSchema,
  PublishTxRequestSchema,
  SetStakeCredentialTxRequestSchema,
  VoteTxRequestSchema,
  WalletWithdrawTxRequestSchema
} from "./tx-requests";
import { SttSpendTxRequestSchema } from "./tx-stt-spend";
import { TX_RATE_LIMIT_DEFAULTS } from "@/lib/http/tx-rate-limit";

// The spec is generated from the same zod schemas the routes validate with, so
// it cannot describe a shape the routes do not accept. `pnpm openapi:check`
// fails when the committed document no longer matches the schemas.

export const OPENAPI_VERSION = "3.1.0";
export const API_VERSION = "1.0.0";

// The build tier's numbers come from the limiter's own defaults, so the served
// document cannot claim a cap the routes do not enforce. Defaults, not the
// environment: a deployment override must not change the committed document.
const RATE_LIMITS = {
  pools: { requests: 300, windowSeconds: 60 },
  sttLookup: { requests: 600, windowSeconds: 60 },
  tx: {
    requests: TX_RATE_LIMIT_DEFAULTS.perClientRequests,
    windowSeconds: TX_RATE_LIMIT_DEFAULTS.perClientWindowMs / 1000
  },
  txGlobal: {
    requests: TX_RATE_LIMIT_DEFAULTS.globalRequests,
    windowSeconds: TX_RATE_LIMIT_DEFAULTS.globalWindowMs / 1000
  }
} as const;

const jsonError = (description: string) => ({
  description,
  content: { "application/json": { schema: ApiErrorSchema } }
});

const tooManyRequests = (
  limit: { requests: number; windowSeconds: number },
  extra = "",
  // The build tier reads its caps from the environment, so the numbers this
  // document publishes are that tier's defaults. The read tiers pass literals
  // to the limiter and have no override, so theirs are the actual limits.
  configurable = false
) => ({
  description:
    `Rate limit exceeded. The ${configurable ? "default " : ""}limit is ${limit.requests} requests per ${limit.windowSeconds} seconds, per client address.` +
    extra,
  headers: z.object({
    "Retry-After": z.string().meta({
      description: "Seconds to wait before retrying.",
      example: "42"
    })
  }),
  content: { "application/json": { schema: ApiErrorSchema } }
});

/** Every build route answers the same set of failures. */
const txResponses = {
  "200": {
    description: "An unsigned transaction, ready for the caller to sign and submit.",
    content: { "application/json": { schema: BuildResultSchema } }
  },
  "400": jsonError(
    "The request is invalid, or the action is not allowed by the wallet's current on-chain state. The message names what to fix."
  ),
  "413": jsonError("The request body is larger than 32 KB."),
  "429": tooManyRequests(
    RATE_LIMITS.tx,
    ` The whole tier shares one bucket, so builds on different routes count together. A second, deployment-wide default cap of ${RATE_LIMITS.txGlobal.requests} builds per ${RATE_LIMITS.txGlobal.windowSeconds} seconds also applies, and answers with a different message. Both caps are configurable per deployment, so read these two numbers as defaults and treat \`Retry-After\` as the authority.`,
    true
  ),
  "500": jsonError("Unexpected server error."),
  "502": jsonError("The chain data provider is unavailable.")
};

function txOperation(
  operationId: string,
  summary: string,
  description: string,
  schema: z.ZodType
): ZodOpenApiOperationObject {
  return {
    operationId,
    summary,
    description,
    tags: ["Transactions"],
    requestBody: { content: { "application/json": { schema } } },
    responses: txResponses
  };
}

const TX_PATHS: Array<[string, string, string, string, z.ZodType]> = [
  [
    "/api/v1/tx/mint",
    "buildMintTx",
    "Mint a state token",
    "Create a wallet by minting its state-thread token and locking starter funds with it.",
    MintTxRequestSchema
  ],
  [
    "/api/v1/tx/lock-funds",
    "buildLockFundsTx",
    "Deposit funds",
    "Deposit value to a wallet. Receiving needs no datum and no signature from the wallet itself.",
    LockFundsTxRequestSchema
  ],
  [
    "/api/v1/tx/stt-spend",
    "buildSttSpendTx",
    "Spend the state token",
    "Run one of the nine State transitions: `use`, `renew-proof-of-life`, `update-state`, `manage-streaming-payments`, `use-allowance`, `use-beneficiary`, `payout-streaming-payment`, `cancel-streaming-payment` and `remove-access-index`. `action` selects which.",
    SttSpendTxRequestSchema
  ],
  [
    "/api/v1/tx/wallet-withdraw",
    "buildWalletWithdrawTx",
    "Withdraw staking rewards",
    "Withdraw the wallet's accumulated staking rewards.",
    WalletWithdrawTxRequestSchema
  ],
  [
    "/api/v1/tx/consolidate",
    "buildConsolidateTx",
    "Consolidate wallet UTxOs",
    "Merge wallet-script UTxOs, and migrate them to the wallet's current base address after a stake-credential change.",
    ConsolidateTxRequestSchema
  ],
  [
    "/api/v1/tx/set-stake-credential",
    "buildSetStakeCredentialTx",
    "Set the stake credential",
    "Set the stake credential every continuing wallet output must use. Moves no funds; existing UTxOs are migrated by a follow-up consolidate.",
    SetStakeCredentialTxRequestSchema
  ],
  [
    "/api/v1/tx/vote",
    "buildVoteTx",
    "Cast a governance vote",
    "Cast a governance vote as the wallet.",
    VoteTxRequestSchema
  ],
  [
    "/api/v1/tx/publish",
    "buildPublishTx",
    "Publish a certificate",
    "Publish a certificate as the wallet, such as a stake delegation.",
    PublishTxRequestSchema
  ],
  [
    "/api/v1/tx/deploy-reference",
    "buildDeployReferenceTx",
    "Deploy the shared reference script",
    "Deploy the shared STT spend script as a reference script, so later transactions need not carry it inline.",
    DeployReferenceTxRequestSchema
  ]
];

const DESCRIPTION = `HTTP access to the Epora permission wallet: read its indexed on-chain state, and
build transactions against its smart contracts.

**The server never holds a key and never signs.** Every active transaction build route takes an
address, returns an unsigned transaction as CBOR hex, and leaves signing and submission
to the caller.

**Network.** Preprod only. Addresses must be \`addr_test1...\`.

**Versioning.** \`v1\` describes the current shape of the API. The compatibility promise
starts at the mainnet beta: until then a \`v1\` route may change without a version bump,
and this document is the record of what it does today. After the beta, breaking changes
get a new version prefix.

**Errors.** Every failure returns the same body, \`{ "error": "..." }\`. A \`400\` carries a
message naming what to fix. A \`502\` means the chain data provider is unreachable, and
never carries the provider's own text.

**Rate limits.** Per client address: ${RATE_LIMITS.tx.requests} requests per
${RATE_LIMITS.tx.windowSeconds}s across all transaction builds together,
${RATE_LIMITS.sttLookup.requests} per ${RATE_LIMITS.sttLookup.windowSeconds}s for wallet lookups,
${RATE_LIMITS.pools.requests} per ${RATE_LIMITS.pools.windowSeconds}s for pool lookups. Builds also
share a deployment-wide cap of ${RATE_LIMITS.txGlobal.requests} per
${RATE_LIMITS.txGlobal.windowSeconds}s, because one build costs the chain provider tens of
requests. Every \`429\` carries \`Retry-After\`. Deployments may set their own caps.

See [the developer guide](https://github.com/schaier-io/epora-wallet/blob/main/docs/api/README.md).`;

export function buildOpenApiDocument() {
  return createDocument({
    openapi: OPENAPI_VERSION,
    info: {
      title: "Epora permission wallet API",
      version: API_VERSION,
      description: DESCRIPTION,
      license: { name: "Apache-2.0", identifier: "Apache-2.0" }
    },
    servers: [{ url: "/", description: "The deployment serving this document." }],
    // No authentication today: every route is public and rate-limited by client
    // address. An empty requirement says that explicitly rather than leaving it
    // unstated. Wallet-signature login is a separate, later piece of work.
    security: [],
    tags: [
      { name: "Transactions", description: "Build unsigned transactions. The caller signs them." },
      { name: "Wallets", description: "Read indexed wallet state." },
      { name: "Chain", description: "Read chain data." },
      { name: "Service", description: "Operational endpoints." }
    ],
    paths: {
      "/api/health": {
        get: {
          operationId: "getHealth",
          summary: "Liveness and readiness",
          description:
            "Returns 200 when the app can reach its database, and 503 when it cannot, so an uptime monitor can alert on the difference. Deliberately unversioned: a health probe is operational, not part of the public contract.",
          tags: ["Service"],
          responses: {
            "200": {
              description: "The service is healthy.",
              content: { "application/json": { schema: HealthResponseSchema } }
            },
            "503": {
              description: "The service is up but a dependency is down.",
              content: { "application/json": { schema: HealthResponseSchema } }
            }
          }
        }
      },
      "/api/v1/pools": {
        get: {
          operationId: "getStakePool",
          summary: "Look up a stake pool",
          description: "Fetch one stake pool's details and metadata by id.",
          tags: ["Chain"],
          requestParams: { query: PoolsQuerySchema },
          responses: {
            "200": {
              description: "The pool's details.",
              content: { "application/json": { schema: PoolsResponseSchema } }
            },
            "400": jsonError("The pool id is missing or malformed."),
            "404": jsonError("No pool exists with that id."),
            "429": tooManyRequests(RATE_LIMITS.pools),
            "500": jsonError("Unexpected server error.")
          }
        }
      },
      "/api/v1/stt/lookup": {
        post: {
          operationId: "lookupWallets",
          summary: "Find wallets for an address",
          description:
            "List the wallets an address or payment key hash participates in, with each wallet's current state summary and recent transactions. Reads the indexer's cache, so it costs no chain provider request.",
          tags: ["Wallets"],
          requestBody: { content: { "application/json": { schema: SttLookupRequestSchema } } },
          responses: {
            "200": {
              description: "The wallets this participant appears in.",
              content: { "application/json": { schema: SttLookupResponseSchema } }
            },
            "400": jsonError("The request body is invalid, or the address cannot be parsed."),
            "413": jsonError("The request body is larger than 4 KB."),
            "429": tooManyRequests(RATE_LIMITS.sttLookup),
            "500": jsonError("Unexpected server error.")
          }
        }
      },
      "/api/v1/tx/wallet-spend": {
        post: {
          operationId: "buildWalletSpendTx",
          summary: "Retired wallet spend route",
          description:
            "This route is retired because a valid wallet spend must also forward the State Thread Token. Use `/api/v1/tx/stt-spend` with action `use`.",
          deprecated: true,
          tags: ["Transactions"],
          responses: {
            "410": jsonError(
              "This endpoint is retired. Use `/api/v1/tx/stt-spend` with action `use`."
            )
          }
        }
      },
      ...Object.fromEntries(
        TX_PATHS.map(([path, operationId, summary, description, schema]) => [
          path,
          { post: txOperation(operationId, summary, description, schema) }
        ])
      )
    }
  });
}
