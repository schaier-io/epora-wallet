import { z } from "zod";

// Mirrors the body of GET /api/health: 200 when the database answers, 503 when
// it does not.
export const HealthResponseSchema = z
  .object({
    status: z.enum(["ok", "degraded"]).meta({
      description: "`ok` when every dependency answers, `degraded` otherwise."
    }),
    checks: z.object({
      database: z.enum(["up", "down"]).meta({
        description: "Result of a `SELECT 1` probe with a 2 second timeout."
      })
    }),
    ts: z.string().meta({
      description: "ISO-8601 timestamp of the probe.",
      example: "2026-08-31T09:15:00.000Z"
    })
  })
  .meta({
    id: "HealthResponse",
    description: "Liveness and dependency readiness."
  });

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
