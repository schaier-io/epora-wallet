import { z } from "zod";

// Every public route already answers failures with this one shape, on 400, 404,
// 413, 429 and 500. Describing it here does not change any handler; it gives the
// generated OpenAPI document a single error component to point every failure
// response at.
export const ApiErrorSchema = z
  .object({
    error: z.string().meta({
      description: "Human-readable failure message. Safe to show to a user.",
      example: "Too many wallet lookups. Try again shortly."
    })
  })
  .meta({
    id: "ApiError",
    description: "Standard error body for every public endpoint."
  });

export type ApiError = z.infer<typeof ApiErrorSchema>;
