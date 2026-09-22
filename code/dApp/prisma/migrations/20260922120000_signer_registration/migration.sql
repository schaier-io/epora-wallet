-- Durable record that a wallet key completed the CIP-30 sign-in at least once.
-- The session cookie is stateless, so this table is the only place the app can
-- learn that a co-signer finished registering.
CREATE TABLE "SignerRegistration" (
    "paymentKeyHash" TEXT NOT NULL,
    "firstSignInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSignInAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignerRegistration_pkey" PRIMARY KEY ("paymentKeyHash")
);
