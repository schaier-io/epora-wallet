// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";

const mocks = vi.hoisted(() => ({ session: vi.fn(), participant: vi.fn(), signers: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/proposals/api-helpers", () => ({
  requireSession: mocks.session,
  jsonError: (error: string, status: number) => Response.json({ error }, { status })
}));
vi.mock("@/lib/proposals/store", () => ({ isWalletParticipant: mocks.participant }));
vi.mock("@/lib/proposals/signer-registration-store", () => ({ listRegisteredWalletSigners: mocks.signers }));
vi.mock("@/lib/http/rate-limit", () => ({ rateLimit: async () => ({ ok: true }) }));
vi.mock("@/lib/observability/logger", () => ({ logger: { error: mocks.error }, serializeError: (error: unknown) => error }));

import { GET } from "./route";

const context = () => ({ params: Promise.resolve({ unit: "a".repeat(56) }) });
const request = () => new Request("http://localhost/api/proposals/wallets/unit/signers");

beforeEach(() => {
  mocks.session.mockReset().mockResolvedValue({ session: { paymentKeyHash: "b".repeat(56) } });
  mocks.participant.mockReset().mockResolvedValue(true);
  mocks.signers.mockReset().mockResolvedValue(["c".repeat(56)]);
  mocks.error.mockReset();
});

it("returns registered signers to a wallet participant", async () => {
  const response = await GET(request(), context());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ registered: ["c".repeat(56)] });
});

it("returns unavailable for a missing table without inventing registration state", async () => {
  mocks.signers.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Missing public.SignerRegistration", {
    code: "P2021", clientVersion: "test"
  }));
  const response = await GET(request(), context());
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("1");
  const body: unknown = await response.json();
  expect(body).toHaveProperty("error");
  expect(body).not.toHaveProperty("registered");
  expect(JSON.stringify(body)).not.toContain("SignerRegistration");
  expect(mocks.error).toHaveBeenCalledTimes(1);
});

it("returns a safe server failure for other database errors", async () => {
  mocks.signers.mockRejectedValue(new Error("private database endpoint"));
  const response = await GET(request(), context());
  expect(response.status).toBe(500);
  expect(JSON.stringify(await response.json())).not.toContain("private database endpoint");
  expect(mocks.error).toHaveBeenCalledTimes(1);
});

it("keeps registration private when authentication or membership fails", async () => {
  mocks.session.mockResolvedValueOnce({ response: Response.json({ error: "Sign in" }, { status: 401 }) });
  expect((await GET(request(), context())).status).toBe(401);
  expect(mocks.participant).not.toHaveBeenCalled();
  mocks.participant.mockResolvedValueOnce(false);
  expect((await GET(request(), context())).status).toBe(403);
  expect(mocks.signers).not.toHaveBeenCalled();
});
