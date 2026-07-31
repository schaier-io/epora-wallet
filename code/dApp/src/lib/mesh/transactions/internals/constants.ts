export const NETWORK = "preprod";


export const MIN_COLLATERAL_LOVELACE = 5_000_000;


export const CARDANO_MAX_TX_SIZE_BYTES = 16_384;


// Validity-window offsets (ms) for built transactions, asymmetric by design and
// short relative to the on-chain cooldown cap (see stt-spend): the small past
// offset tolerates clock skew; the larger future offset gives the user time to
// sign and submit before the tx expires.
export const VALIDITY_WINDOW_PAST_MS = 120_000;


export const VALIDITY_WINDOW_FUTURE_MS = 240_000;


// Per-output byte overhead in the Cardano ledger min-UTxO sizing formula, used
// to compute the minimum lovelace an output must carry to clear the threshold.
export const UTXO_SIZE_OVERHEAD_BYTES = 160;


export const STT_MINT_VALIDATOR = "stt.stt.mint";


export const STT_SPEND_VALIDATOR = "stt.stt.spend";


export const WALLET_SPEND_VALIDATOR = "wallet.wallet.spend";


export const WALLET_WITHDRAW_VALIDATOR = "wallet.wallet.withdraw";


