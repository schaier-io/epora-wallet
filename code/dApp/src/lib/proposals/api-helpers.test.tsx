import { expect, it, vi } from "vitest";

// The schemas never touch the database; the store is mocked so the module loads
// without Prisma.
vi.mock("./store", () => ({ getProposalAccess: vi.fn(), isWalletParticipant: vi.fn() }));

import { txBodyHashSchema } from "./api-helpers";

// Stored hashes are lower-case and the store compares them with `!==`. An
// upper-case hash from a client passed the schema and then answered 409
// "rebuilt" for a body that never changed.
it("normalises a body hash to the lower case the store compares against", () => {
  expect(txBodyHashSchema.parse("AB".repeat(32))).toBe("ab".repeat(32));
  expect(txBodyHashSchema.parse(` ${"cd".repeat(32)} `)).toBe("cd".repeat(32));
});
