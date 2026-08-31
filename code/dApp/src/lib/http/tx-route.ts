import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { BuildResultDto } from "@/lib/api/tx-result";
import { classifyBuildFailure, describeZodIssue } from "@/lib/http/tx-route-errors";
import {
  ServerWalletAddressError,
  createAddressWalletSource,
  createServerTxFetcher
} from "@/lib/mesh/server-wallet";
import type { TxFetcher, WalletSource } from "@/lib/mesh/tx-context";
import { clientKey, rateLimit } from "@/lib/http/rate-limit";
import {
  TX_GLOBAL_RATE_LIMIT_KEY,
  TX_MAX_REQUEST_BYTES,
  readTxRateLimits
} from "@/lib/http/tx-rate-limit";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { logger, serializeError } from "@/lib/observability/logger";

export { TX_MAX_REQUEST_BYTES };

// One bucket for the whole tier, not one per route. Keying by route would give
// a caller the full allowance ten times over, once per build path, and every
// build costs tens of provider requests. The caps and the arithmetic behind
// them live in ./tx-rate-limit.ts.
const TX_RATE_LIMIT_SCOPE = "tx-build";

const TOO_MANY_BUILDS = "Too many transaction builds. Try again shortly.";
const SERVICE_BUSY =
  "The service is building too many transactions right now. Try again shortly.";

function tooManyRequests(message: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

type TxRouteOptions<Schema extends z.ZodType> = {
  /** Rate-limit bucket and log key. Use the path's last segment. */
  name: string;
  schema: Schema;
  build: (
    input: z.output<Schema>,
    wallet: WalletSource,
    fetcher: TxFetcher
  ) => Promise<BuildResultDto>;
};

/**
 * The shared body of every `/api/v1/tx/*` route: rate-limit, read a bounded
 * body, validate it, build a wallet source from the caller's address, run the
 * existing builder, and map failures onto documented status codes.
 *
 * Routes hold no transaction logic. They name a schema and call one builder.
 */
export function createTxRoute<Schema extends z.ZodType>(options: TxRouteOptions<Schema>) {
  return async function POST(request: Request) {
    try {
      const limits = readTxRateLimits();
      const callerLimit = await rateLimit(
        clientKey(request, TX_RATE_LIMIT_SCOPE),
        limits.perClientRequests,
        limits.perClientWindowMs
      );
      if (!callerLimit.ok) {
        return tooManyRequests(TOO_MANY_BUILDS, callerLimit.retryAfterSeconds);
      }
      // Blockfrost rate limits by source IP, and the deployment is one IP to
      // it, so a flood spread over many callers would pass the check above and
      // still spend the shared quota. This bucket is the backstop.
      const deploymentLimit = await rateLimit(
        TX_GLOBAL_RATE_LIMIT_KEY,
        limits.globalRequests,
        limits.globalWindowMs
      );
      if (!deploymentLimit.ok) {
        return tooManyRequests(SERVICE_BUSY, deploymentLimit.retryAfterSeconds);
      }

      const bodyUnknown: unknown = await readBoundedJson(request, TX_MAX_REQUEST_BYTES);
      const body = options.schema.parse(bodyUnknown) as z.output<Schema> & { address: string };

      // Validates the address offline and throws before any provider call.
      const wallet = createAddressWalletSource(body.address);

      // Everything the builder throws is a build failure, so it is classified
      // here rather than falling through to the 500 below. Builders raise both
      // wrapped MeshBuildErrors and plain Errors ("Wallet script parameters are
      // missing.", "Add at least one asset..."), and both are the caller's.
      let result: BuildResultDto;
      try {
        result = await options.build(body, wallet, createServerTxFetcher());
      } catch (error) {
        const failure = classifyBuildFailure(error);
        if (failure.severity === "error") {
          logger.error(`api.tx_${options.name}_build_failed`, { err: serializeError(error) });
        } else {
          logger.info(`api.tx_${options.name}_rejected`, {
            stage: failure.stage,
            message: failure.message
          });
        }

        return NextResponse.json({ error: failure.message }, { status: failure.status });
      }

      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: error.message }, { status: 413 });
      }

      if (error instanceof z.ZodError) {
        return NextResponse.json({ error: describeZodIssue(error) }, { status: 400 });
      }

      if (error instanceof ServerWalletAddressError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      logger.error(`api.tx_${options.name}_failed`, { err: serializeError(error) });
      return NextResponse.json({ error: "Transaction build failed." }, { status: 500 });
    }
  };
}
