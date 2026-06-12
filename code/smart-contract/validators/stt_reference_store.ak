use cardano/transaction.{OutputReference, Transaction, placeholder}

validator stt_reference_store {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: OutputReference,
    _self: Transaction,
  ) {
    fail
  }

  else(_) {
    fail
  }
}

test stt_reference_store_rejects_every_spend_attempt() fail {
  expect
    stt_reference_store.spend(
      None,
      0,
      OutputReference {
        transaction_id: #"1230000000000000000000000000000000000000000000000000000000000000",
        output_index: 0,
      },
      Transaction {
        ..placeholder,
        id: #"1240000000000000000000000000000000000000000000000000000000000000",
      },
    )
}
