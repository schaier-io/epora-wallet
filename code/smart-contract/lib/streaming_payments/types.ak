use aiken/crypto.{Blake2b_256, Hash}
use cardano/address.{Address}
use cardano/transaction.{InlineDatum, Output, Transaction}
use time/types.{POSIXTime}

pub type StreamingPayment {
  id: Int,
  payout_address: Address,
  paid_out_amount: Int,
  policy_id: ByteArray,
  asset_name: ByteArray,
  amount_per_day: Int,
  start_date: POSIXTime,
  end_date: POSIXTime,
}

/// The inline-datum tag a payout output must carry to be bound to one specific
/// streaming payment of one specific STT spend. `transaction_id` + `output_index`
/// pin it to the consuming STT input, so a tag cannot be replayed across spends.
pub type OutputId {
  id: Int,
  transaction_id: Hash<Blake2b_256, Transaction>,
  output_index: Int,
}

// THE single place every always-immutable `StreamingPayment` field is
// enumerated. `id` is excluded (it is the match key, compared by callers) and so
// are the two fields whose mutability differs BY PATH:
//   - `paid_out_amount` — may change on the payout path, fixed when forwarding.
//   - `end_date`        — may change when forwarding/rescheduling, fixed on payout.
// Both `payout.streaming_payment_immutable_fields_match` (payout) and
// `forwarding.preserved_except_end_date` (forward) build on this, so
// adding a new ALWAYS-immutable field means editing only this helper; only a
// field that is mutable in one path needs touching its thin wrapper too.
pub fn core_fields_match(
  input: StreamingPayment,
  output: StreamingPayment,
) -> Bool {
  and {
    output.payout_address == input.payout_address,
    output.policy_id == input.policy_id,
    output.asset_name == input.asset_name,
    output.amount_per_day == input.amount_per_day,
    output.start_date == input.start_date,
  }
}

/// Read an output's payout tag, if it carries one: `Some(OutputId)` when the
/// output has an inline datum that decodes to an `OutputId`, else `None`.
/// Centralises the two-step `InlineDatum → OutputId` narrowing that both the
/// wallet-side leak check and the STT-side payout matcher need, so neither has
/// to re-spell the nested `when … is InlineDatum` / `if … is OutputId` ladder.
pub fn output_payout_tag(output: Output) -> Option<OutputId> {
  when output.datum is {
    InlineDatum(datum) ->
      if datum is tag: OutputId {
        Some(tag)
      } else {
        None
      }
    _ -> None
  }
}
