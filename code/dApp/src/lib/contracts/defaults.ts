import type { ConstrData } from "@/lib/types/contracts";
import { encodeWalletNameForDatum } from "@/lib/contracts/state-wallet-name";

export const DEFAULT_STATE_DATUM: ConstrData = {
  alternative: 0,
  fields: [
    {
      alternative: 0,
      fields: [[], { alternative: 1, fields: [] }, []]
    },
    {
      alternative: 0,
      fields: [{ alternative: 1, fields: [] }, { alternative: 1, fields: [] }]
    },
    [],
    encodeWalletNameForDatum("Smart wallet"),
    // intended_stake_credential: Option<Credential> = None (enterprise address).
    { alternative: 1, fields: [] },
    // last_permissionless_payout_at: Option<POSIXTime> = None (no crank yet; the
    // STT validator pins this to None at mint). See ADR-0009.
    { alternative: 1, fields: [] }
  ]
};
