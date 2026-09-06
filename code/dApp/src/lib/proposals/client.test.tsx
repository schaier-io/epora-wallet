import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelProposal,
  fetchProposal,
  markProposalSubmitted,
  signProposal
} from "@/lib/proposals/client";

// A .tsx file with no JSX in it: the two runners are split by extension and
// src/lib/proposals is not in the node:test globs (see vitest.config.ts).

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ proposal: { id: "ok" } })
  });
  vi.stubGlobal("fetch", fetchMock);
});

function requestedUrl() {
  return fetchMock.mock.calls[0]![0] as string;
}

/**
 * A proposal id arrives from a shared link as often as from the API, so it is
 * untrusted text by the time it is put in a path. Interpolated raw, these
 * characters changed the shape of the request, the answer was not a proposal,
 * and the panel sat on its spinner.
 */
const HOSTILE_ID = "abc/../../admin?x=1";

describe("proposal request paths", () => {
  it("encodes the id when reading one", async () => {
    await fetchProposal(HOSTILE_ID);

    expect(requestedUrl()).toBe("/api/proposals/abc%2F..%2F..%2Fadmin%3Fx%3D1");
  });

  it("encodes the id when signing", async () => {
    await signProposal(HOSTILE_ID, { witnessSetHex: "a0", txBodyHash: "bb" });

    expect(requestedUrl()).toBe("/api/proposals/abc%2F..%2F..%2Fadmin%3Fx%3D1/sign");
  });

  it("encodes the id when submitting", async () => {
    await markProposalSubmitted(HOSTILE_ID, "bb");

    expect(requestedUrl()).toBe("/api/proposals/abc%2F..%2F..%2Fadmin%3Fx%3D1/submit");
  });

  it("encodes the id when cancelling", async () => {
    await cancelProposal(HOSTILE_ID);

    expect(requestedUrl()).toBe("/api/proposals/abc%2F..%2F..%2Fadmin%3Fx%3D1");
  });

  it("leaves an ordinary id readable", async () => {
    await fetchProposal("clx0abc123");

    expect(requestedUrl()).toBe("/api/proposals/clx0abc123");
  });
});
