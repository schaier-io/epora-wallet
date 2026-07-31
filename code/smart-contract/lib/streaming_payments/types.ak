//// Streaming-payment core types, the shared per-list helpers (id uniqueness,
//// by-id lookup), and the payout-tag encoder/decoder pair used by both
//// validators. The per-path transition rules live in the sibling modules:
//// `shape.ak` (what may enter the chain), `forwarding.ak` (no-payout rewrites),
//// `payout.ak` (settlement), `funding.ak` (accrual math + reserve).

use aiken/collection/list
use aiken/crypto.{Blake2b_256, Hash}
use cardano/address.{Address}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}
use collections
use time/types.{POSIXTime}

/// One scheduled payment stream: `amount_per_day` of (`policy_id`, `asset_name`)
/// accrues linearly from `start_date` to `end_date` toward `payout_address`;
/// `paid_out_amount` tracks how much of the accrual has already been settled.
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

/// True when every streaming-payment id occurs at most once in the list. THE
/// single id-uniqueness gate for streaming payments (the quantifier itself is
/// `collections.all_unique`): all by-id matching (`find_by_id`) is unambiguous
/// only under it, so every path that accepts or rewrites the list must hold it
/// (`shape.is_valid` at mint/add, `payout.payout_is_valid` on settlement
/// rewrites).
pub fn ids_are_unique(streaming_payments: List<StreamingPayment>) -> Bool {
  let streaming_payment_ids = list.map(
    streaming_payments,
    fn(streaming_payment) { streaming_payment.id },
  )
  collections.all_unique(streaming_payment_ids)
}

/// The streaming payment carrying `id`, if any. THE single by-id lookup shared
/// by the payout/forwarding matchers and the cancel-target resolution; its
/// result is unambiguous only under `ids_are_unique`.
pub fn find_by_id(
  streaming_payments: List<StreamingPayment>,
  id: Int,
) -> Option<StreamingPayment> {
  list.find(
    streaming_payments,
    fn(streaming_payment) { streaming_payment.id == id },
  )
}

/// The inline-datum tag a payout output must carry to be bound to one specific
/// streaming payment of one specific STT spend. `transaction_id` + `output_index`
/// pin it to the consuming STT input, so a tag cannot be replayed across spends.
pub type OutputId {
  id: Int,
  transaction_id: Hash<Blake2b_256, Transaction>,
  output_index: Int,
}

/// THE single place every always-immutable `StreamingPayment` field is
/// enumerated. `id` is excluded (it is the match key, compared by callers) and so
/// are the two fields whose mutability differs BY PATH:
///   - `paid_out_amount` — may change on the payout path, fixed when forwarding.
///   - `end_date`        — may change when forwarding/rescheduling, fixed on payout.
/// Both `payout.streaming_payment_immutable_fields_match` (payout) and
/// `forwarding.preserved_with_path_fields` (forward) build on this, so
/// adding a new ALWAYS-immutable field means editing only this helper; only a
/// field that is mutable in one path needs touching its thin wrapper too.
pub fn core_fields_match(
  input: StreamingPayment,
  output: StreamingPayment,
) -> Bool {
  and {
    (output.payout_address == input.payout_address)?,
    (output.policy_id == input.policy_id)?,
    (output.asset_name == input.asset_name)?,
    (output.amount_per_day == input.amount_per_day)?,
    (output.start_date == input.start_date)?,
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

/// Build the payout tag a settlement output must carry for `payment_id` of the
/// STT spend consuming `stt_input_reference` — the single ENCODER paired with
/// the `output_payout_tag` decoder above. Both validators compare against this
/// value (the STT-side payout matcher REQUIRES the tagged output, the
/// wallet-side leak check ACCEPTS it as a legal destination), so the two must
/// agree byte-for-byte; neither may re-spell the construction.
pub fn expected_payout_tag(
  payment_id: Int,
  stt_input_reference: OutputReference,
) -> OutputId {
  OutputId {
    id: payment_id,
    transaction_id: stt_input_reference.transaction_id,
    output_index: stt_input_reference.output_index,
  }
}
