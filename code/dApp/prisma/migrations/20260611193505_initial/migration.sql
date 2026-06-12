-- CreateTable
CREATE TABLE "SttWallet" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "assetNameHex" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sttScriptAddress" TEXT NOT NULL,
    "walletScriptAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentTxHash" TEXT,
    "currentOutputIndex" INTEGER,
    "currentDatumJson" TEXT,
    "lastSeenBlockHeight" INTEGER,
    "lastSeenBlockTime" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SttWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttChainTransaction" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "blockHeight" INTEGER,
    "blockTime" INTEGER,
    "fees" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "deposit" TEXT NOT NULL,
    "invalidBefore" TEXT NOT NULL,
    "invalidAfter" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SttChainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttWalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "chainTransactionId" TEXT NOT NULL,
    "transitionKind" TEXT NOT NULL,
    "txIndex" INTEGER NOT NULL,
    "blockHeight" INTEGER,
    "blockTime" INTEGER,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SttWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttParticipant" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "participantKey" TEXT NOT NULL,
    "onChainId" INTEGER,
    "paymentKeyHash" TEXT,
    "sourceAddress" TEXT,
    "stakeKeyHash" TEXT,
    "scriptHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SttParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SttSyncCursor" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "cursorKey" TEXT NOT NULL,
    "cursorValue" TEXT,
    "stateJson" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SttSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiSigProposal" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "walletUnit" TEXT NOT NULL,
    "walletPolicyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actionKind" TEXT NOT NULL,
    "authorityPath" TEXT NOT NULL,
    "builder" TEXT NOT NULL,
    "buildContextJson" TEXT NOT NULL,
    "unsignedTxHex" TEXT NOT NULL,
    "txBodyHash" TEXT NOT NULL,
    "summaryJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "submittedTxHash" TEXT,
    "createdByKeyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MultiSigProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalSignature" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "signerKeyHash" TEXT NOT NULL,
    "witnessSetHex" TEXT NOT NULL,
    "txBodyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SttWallet_network_policyId_idx" ON "SttWallet"("network", "policyId");

-- CreateIndex
CREATE INDEX "SttWallet_network_status_idx" ON "SttWallet"("network", "status");

-- CreateIndex
CREATE INDEX "SttWallet_network_walletScriptAddress_idx" ON "SttWallet"("network", "walletScriptAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SttWallet_network_unit_key" ON "SttWallet"("network", "unit");

-- CreateIndex
CREATE INDEX "SttChainTransaction_network_blockHeight_idx" ON "SttChainTransaction"("network", "blockHeight");

-- CreateIndex
CREATE INDEX "SttChainTransaction_network_blockTime_idx" ON "SttChainTransaction"("network", "blockTime");

-- CreateIndex
CREATE UNIQUE INDEX "SttChainTransaction_network_txHash_key" ON "SttChainTransaction"("network", "txHash");

-- CreateIndex
CREATE INDEX "SttWalletTransaction_walletId_blockHeight_txIndex_idx" ON "SttWalletTransaction"("walletId", "blockHeight", "txIndex");

-- CreateIndex
CREATE INDEX "SttWalletTransaction_chainTransactionId_idx" ON "SttWalletTransaction"("chainTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SttWalletTransaction_walletId_chainTransactionId_key" ON "SttWalletTransaction"("walletId", "chainTransactionId");

-- CreateIndex
CREATE INDEX "SttParticipant_walletId_role_idx" ON "SttParticipant"("walletId", "role");

-- CreateIndex
CREATE INDEX "SttParticipant_paymentKeyHash_idx" ON "SttParticipant"("paymentKeyHash");

-- CreateIndex
CREATE INDEX "SttParticipant_sourceAddress_idx" ON "SttParticipant"("sourceAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SttParticipant_walletId_participantKey_key" ON "SttParticipant"("walletId", "participantKey");

-- CreateIndex
CREATE UNIQUE INDEX "SttSyncCursor_network_cursorKey_key" ON "SttSyncCursor"("network", "cursorKey");

-- CreateIndex
CREATE INDEX "MultiSigProposal_network_walletUnit_status_idx" ON "MultiSigProposal"("network", "walletUnit", "status");

-- CreateIndex
CREATE INDEX "MultiSigProposal_network_status_idx" ON "MultiSigProposal"("network", "status");

-- CreateIndex
CREATE INDEX "MultiSigProposal_createdByKeyHash_idx" ON "MultiSigProposal"("createdByKeyHash");

-- CreateIndex
CREATE INDEX "ProposalSignature_proposalId_idx" ON "ProposalSignature"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalSignature_proposalId_signerKeyHash_key" ON "ProposalSignature"("proposalId", "signerKeyHash");

-- AddForeignKey
ALTER TABLE "SttWalletTransaction" ADD CONSTRAINT "SttWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "SttWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SttWalletTransaction" ADD CONSTRAINT "SttWalletTransaction_chainTransactionId_fkey" FOREIGN KEY ("chainTransactionId") REFERENCES "SttChainTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SttParticipant" ADD CONSTRAINT "SttParticipant_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "SttWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalSignature" ADD CONSTRAINT "ProposalSignature_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MultiSigProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
