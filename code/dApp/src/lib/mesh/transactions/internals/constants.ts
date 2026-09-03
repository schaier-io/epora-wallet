export const NETWORK = "preprod";


export const MIN_COLLATERAL_LOVELACE = 5_000_000;


export const CARDANO_MAX_TX_SIZE_BYTES = 16_384;


// Validity-window offsets (ms) for built transactions, asymmetric by design:
// the small past offset tolerates clock skew. The future offset is the signing
// budget for every built tx — including proposal transactions, which a
// co-signer may only see after building, possibly after switching wallet
// accounts — so it is generous (30 minutes) rather than the few minutes a
// single signature needs.
export const VALIDITY_WINDOW_PAST_MS = 120_000;


export const VALIDITY_WINDOW_FUTURE_MS = 1_800_000;


// Per-output byte overhead in the Cardano ledger min-UTxO sizing formula, used
// to compute the minimum lovelace an output must carry to clear the threshold.
export const UTXO_SIZE_OVERHEAD_BYTES = 160;


export const STT_MINT_VALIDATOR = "stt.stt.mint";


export const STT_SPEND_VALIDATOR = "stt.stt.spend";


export const WALLET_SPEND_VALIDATOR = "wallet.wallet.spend";


export const WALLET_WITHDRAW_VALIDATOR = "wallet.wallet.withdraw";


