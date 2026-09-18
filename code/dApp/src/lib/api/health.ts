import { z } from "zod";
import {
  STT_HEALTH_RECENT_HEAD_STALE_MS,
  STT_HEALTH_WALLET_RECONCILE_STALE_MS,
  type IndexingFreshness
} from "@/lib/stt-cache/indexing-freshness";

// Mirrors the body of GET /api/health: 200 when the database answers and the
// indexer's sync cursors are fresh, 503 otherwise.

export const IndexerHealthSchema = z
  .object({
    available: z.boolean().meta({
      description:
        "False when reading the sync cursors failed; every other field then carries its empty value."
    }),
    recentHeadLastSyncedAt: z.iso.datetime().nullable().meta({
      description:
        "When a sync run last reached the chain (indexer.ts syncRecentHead). Attests the indexer is alive, not that every wallet is current."
    }),
    recentHeadAgeMs: z.number().int().nullable().meta({
      description: "Milliseconds since that stamp, clamped at 0 to absorb clock skew."
    }),
    recentHeadFresh: z.boolean().meta({
      description: `False when no sync was ever stamped, or the stamp is older than ${STT_HEALTH_RECENT_HEAD_STALE_MS} ms.`
    }),
    walletReconcileLastSyncedAt: z.iso.datetime().nullable().meta({
      description:
        "When the last completed full pass over the wallet collection finished (indexer.ts reconcileCurrentWallets). A deadline-stopped partial pass keeps the previous stamp."
    }),
    walletReconcileAgeMs: z.number().int().nullable().meta({
      description: "Milliseconds since that stamp, clamped at 0 to absorb clock skew."
    }),
    walletReconcileFresh: z.boolean().meta({
      description: `False when no pass was ever completed, or the stamp is older than ${STT_HEALTH_WALLET_RECONCILE_STALE_MS} ms.`
    }),
    historyBackfillCompleted: z.boolean().meta({
      description:
        "Whether the one-time history backfill walked to the chain's end. Its stamp freezes once complete, so only this flag is reported; an incomplete backfill does not gate health."
    }),
    degradedReasons: z.array(z.string()).meta({
      description: "Empty when every gated cursor passes; one reason per failing cursor otherwise."
    })
  })
  .meta({
    id: "IndexerHealth",
    description: "Sync-cursor freshness of the STT indexer for the configured network."
  });

export type IndexerHealth = z.infer<typeof IndexerHealthSchema>;

// Stable reason string for the one failure the cursor data cannot describe:
// the read of that data itself.
export const INDEXER_READ_FAILED_REASON = "indexer: sync-cursor read failed";

export function indexerHealthFromFreshness(freshness: IndexingFreshness): IndexerHealth {
  return {
    available: true,
    recentHeadLastSyncedAt: freshness.recentHead.lastSyncedAt?.toISOString() ?? null,
    recentHeadAgeMs: freshness.recentHead.ageMs,
    recentHeadFresh: freshness.recentHead.fresh,
    walletReconcileLastSyncedAt: freshness.walletReconcile.lastSyncedAt?.toISOString() ?? null,
    walletReconcileAgeMs: freshness.walletReconcile.ageMs,
    walletReconcileFresh: freshness.walletReconcile.fresh,
    historyBackfillCompleted: freshness.historyBackfillCompleted,
    degradedReasons: freshness.degradedReasons
  };
}

export function indexerHealthUnavailable(reason: string): IndexerHealth {
  return {
    available: false,
    recentHeadLastSyncedAt: null,
    recentHeadAgeMs: null,
    recentHeadFresh: false,
    walletReconcileLastSyncedAt: null,
    walletReconcileAgeMs: null,
    walletReconcileFresh: false,
    historyBackfillCompleted: false,
    degradedReasons: [reason]
  };
}

export const HealthResponseSchema = z
  .object({
    status: z.enum(["ok", "degraded"]).meta({
      description: "`ok` when every dependency answers, `degraded` otherwise."
    }),
    checks: z.object({
      database: z.enum(["up", "down"]).meta({
        description: "Result of a `SELECT 1` probe with a 2 second timeout."
      }),
      indexer: z.enum(["up", "down", "unknown"]).meta({
        description:
          "`up` when every gated sync cursor is fresh, `down` when one is stale, never stamped, or its read failed, `unknown` when the database probe failed so cursors were not read."
      })
    }),
    indexer: IndexerHealthSchema.nullable().meta({
      description:
        "Sync-cursor freshness detail. Null when the database probe failed, because the cursors were not read."
    }),
    ts: z.iso.datetime().meta({
      description: "ISO-8601 timestamp of the probe.",
      example: "2026-08-31T09:15:00.000Z"
    })
  })
  .meta({
    id: "HealthResponse",
    description: "Liveness and dependency readiness."
  });

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
