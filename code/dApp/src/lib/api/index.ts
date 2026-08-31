// Single import site for every public request and response schema. The OpenAPI
// generator reads this module, so a route that is documented is a route whose
// schemas are exported here.
export { ApiErrorSchema, type ApiError } from "./errors";
export { HealthResponseSchema, type HealthResponse } from "./health";
export {
  PoolIdSchema,
  PoolsQuerySchema,
  PoolsResponseSchema,
  POOL_ID_INVALID_MESSAGE,
  POOL_ID_MISSING_MESSAGE,
  type PoolsResponseDto
} from "./pools";
export {
  SttLookupRequestSchema,
  SttLookupResponseSchema,
  type SttLookupRequestDto,
  type SttLookupResponseDto
} from "./stt-lookup";
