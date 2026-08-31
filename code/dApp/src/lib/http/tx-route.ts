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
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
import { logger, serializeError } from "@/lib/observability/logger";

// A build is far more expensive than a cache read: it costs two address fetches
// plus live script evaluation at the provider. These are the starting numbers
// for the /api/v1/tx/* tier; tuning them is the rate-limit task's job, and this
// is the one place to change them.
export const TX_RATE_LIMIT_REQUESTS = 10;
export const TX_RATE_LIMIT_WINDOW_MS = 60_000;

// Datums and asset lists make a build request larger than a lookup, but not
// unbounded.
export const TX_MAX_REQUEST_BYTES = 32 * 1024;

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
      const limit = await rateLimit(
        clientKey(request, `tx-${options.name}`),
        TX_RATE_LIMIT_REQUESTS,
        TX_RATE_LIMIT_WINDOW_MS
      );
      if (!limit.ok) {
        return NextResponse.json(
          { error: "Too many transaction builds. Try again shortly." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
        );
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
