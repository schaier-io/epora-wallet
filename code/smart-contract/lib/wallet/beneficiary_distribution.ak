//// Exact per-input distribution with one distinct tagged output per beneficiary.
//// Configuration establishes unique beneficiary ids and valid payout addresses.

use aiken/collection/list
use cardano/address.{Address}
use cardano/assets
use cardano/transaction.{InlineDatum}
use state/types.{Beneficiary}
use streaming_payments/types.{expected_payout_tag} as streaming_payment_types
use wallet/payout_routing.{OutputContext}

pub fn all_shares_are_paid(
  beneficiaries: List<Beneficiary>,
  input_value: assets.Value,
  context: OutputContext,
) -> Bool {
  let total_weight = list.foldl(
    beneficiaries,
    0,
    fn(beneficiary, sum) { sum + beneficiary.weight },
  )
  let input_assets = assets.flatten(input_value)
  list.all(
    beneficiaries,
    fn(beneficiary) {
      // Configuration ingress validates this opaque Address. Preservation-only
      // actions retain it unchanged; routing must cast it before use.
      expect payout_address: Address = beneficiary.payout_address
      let payout_tag = InlineDatum(
        expected_payout_tag(beneficiary.id, context.stt_input_reference),
      )
      // Unique ids make tags disjoint. Exactly one output may satisfy each tag,
      // even when several beneficiaries share a full payout address.
      expect [payout] = list.filter(
        context.outputs,
        fn(output) { output.datum == payout_tag },
      )
      expect payout.address == payout_address
      let exact_share = list.foldl(
        input_assets,
        assets.zero,
        fn(asset, value) {
          let (policy_id, asset_name, quantity) = asset
          let numerator = quantity * beneficiary.weight
          expect numerator % total_weight == 0
          assets.add(value, policy_id, asset_name, numerator / total_weight)
        },
      )
      assets.match(payout.value, exact_share, >=)
    },
  )
}
