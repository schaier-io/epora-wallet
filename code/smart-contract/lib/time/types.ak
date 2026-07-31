//// Time units shared across the contracts.

/// POSIX time in MILLISECONDS since the Unix epoch — the Plutus/ledger
/// convention delivered in the tx validity interval, NOT Unix seconds.
/// Day-scale arithmetic uses `constants.milliseconds_per_day`.
pub type POSIXTime =
  Int
