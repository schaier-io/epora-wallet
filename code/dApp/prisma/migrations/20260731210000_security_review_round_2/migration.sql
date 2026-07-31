-- Global, PostgreSQL-backed API rate-limit buckets.
CREATE TABLE "ApiRateLimit" (
    "key" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "ApiRateLimit_expiresAt_idx" ON "ApiRateLimit"("expiresAt");

-- Single-use CIP-30 proposal-authentication challenges.
CREATE TABLE "ProposalAuthChallenge" (
    "id" TEXT NOT NULL,
    "addressHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalAuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposalAuthChallenge_expiresAt_idx" ON "ProposalAuthChallenge"("expiresAt");

-- Keep per-creator proposal quota checks index-backed as history grows.
CREATE INDEX "proposal_creator_wallet_status_idx"
ON "MultiSigProposal"("network", "walletUnit", "createdByKeyHash", "status");

CREATE INDEX "proposal_creator_wallet_created_at_idx"
ON "MultiSigProposal"("network", "walletUnit", "createdByKeyHash", "createdAt");
