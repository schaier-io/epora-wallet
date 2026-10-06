// The wallet settings page shows one list of people. On chain they are two lists:
// `users[]` (owners, co-signers, spenders, check-in keepers) and `beneficiaries[]`
// (recovery contacts). This module is the seam between the two shapes. It groups a
// user and a recovery contact who sign with the same wallet into one person, and
// turns a permission switched on one row into the records the contract expects.
// The contract allows a user and a recovery contact to share a key
// (`smart-contract/lib/state/configuration.ak:14-15`); only two recovery contacts
// may not share one, so a contact can match at most one user here.
import {
  applyUserPreset,
  createDefaultBeneficiaryFormState,
  createDefaultUserFormState,
  nextGeneratedId,
  type BeneficiaryFormState,
  type StateFormState,
  type UserFormState
} from "@/lib/contracts/state-form";
import {
  approvalPowerForUser,
  parseApprovalPowerInput,
  reachableApprovalPower,
  withBeneficiaryPayoutAndSigningAddress,
  withMultisigDerivedFromCoSigners,
  withSafetyTimerDefaults
} from "./form-state";

/** One row of the people list: a user, a recovery contact, or both. */
export type PersonEntry = {
  /** Stable while the user record exists, so an open row stays open. */
  key: string;
  userIndex: number | null;
  beneficiaryIndex: number | null;
};

const normalizeKey = (wallet: string) => wallet.trim().toLowerCase();

/**
 * Users first, in their on-chain order, each with the first recovery contact that
 * signs with one of its wallets. Contacts no user claimed follow as their own rows.
 */
export function groupPeople(form: StateFormState): PersonEntry[] {
  const claimed = new Set<number>();
  const people: PersonEntry[] = form.users.map((user, userIndex) => {
    const keys = new Set(user.wallets.map(normalizeKey).filter(Boolean));
    const beneficiaryIndex = form.beneficiaries.findIndex(
      (beneficiary, index) =>
        !claimed.has(index) &&
        beneficiary.wallets.some((wallet) => keys.has(normalizeKey(wallet)))
    );
    if (beneficiaryIndex >= 0) {
      claimed.add(beneficiaryIndex);
    }
    return {
      key: `user-${user.id}`,
      userIndex,
      beneficiaryIndex: beneficiaryIndex >= 0 ? beneficiaryIndex : null
    };
  });
  form.beneficiaries.forEach((beneficiary, beneficiaryIndex) => {
    if (!claimed.has(beneficiaryIndex)) {
      people.push({
        key: `contact-${beneficiary.id}`,
        userIndex: null,
        beneficiaryIndex
      });
    }
  });
  return people;
}

export type PersonPermissions = {
  owner: boolean;
  coSigner: boolean;
  spender: boolean;
  checkIn: boolean;
  recoveryContact: boolean;
};

export function personPermissions(
  form: StateFormState,
  person: PersonEntry
): PersonPermissions {
  const user = person.userIndex === null ? null : form.users[person.userIndex];
  return {
    owner: Boolean(user?.isAdmin),
    coSigner: user?.multiSigPowerMode === "some",
    spender: (user?.perDayAllowance.length ?? 0) > 0,
    // The contract ignores the check-in right on an owner (`is_renewal_eligible` in
    // `stt/user_handlers.ak`): an owner keeps the wallet alive by acting.
    checkIn: Boolean(user && !user.isAdmin && user.canRenewProofOfLife),
    recoveryContact: person.beneficiaryIndex !== null
  };
}

/** The wallets a person signs with, from whichever record they have. */
export function personWallets(form: StateFormState, person: PersonEntry): string[] {
  if (person.userIndex !== null) {
    return form.users[person.userIndex].wallets;
  }
  return person.beneficiaryIndex === null
    ? []
    : form.beneficiaries[person.beneficiaryIndex].wallets;
}

/**
 * Owner on: the person may do everything alone, so approval power and daily limits
 * stop meaning anything. They are cleared rather than hidden, because a hidden power
 * would still count toward the co-signer total. Owner off also drops the check-in
 * the owner preset grants, so the person is left with no permission they did not pick.
 */
export function withOwnerToggled(user: UserFormState, owner: boolean): UserFormState {
  return owner
    ? applyUserPreset(user, "admin")
    : { ...user, isAdmin: false, canRenewProofOfLife: false, preset: "custom" };
}

/** Whether a user record grants anything. A record that grants nothing is only a placeholder. */
export function userHasPermissions(user: UserFormState): boolean {
  return (
    user.isAdmin ||
    user.multiSigPowerMode === "some" ||
    user.perDayAllowance.length > 0 ||
    user.canRenewProofOfLife
  );
}

/**
 * Makes this user a recovery contact too: a new contact record that signs with the
 * user's wallet. The payout address is the one thing the user record cannot supply
 * (a key hash alone has no stake part), so it comes from the caller when known and
 * stays blank for the person to fill in otherwise. Turning recovery on also turns on
 * the proof of life, which the contract requires alongside any contact.
 *
 * A user who grants nothing (someone just added) is replaced by the contact rather
 * than kept beside it: an empty user record costs one of the shared access slots and
 * does nothing on chain.
 */
export function withRecoveryContactForUser(
  form: StateFormState,
  userIndex: number,
  nowMs: number,
  payoutAddress = ""
): StateFormState {
  const user = form.users[userIndex];
  const blank: BeneficiaryFormState = {
    ...createDefaultBeneficiaryFormState(nextGeneratedId(form.beneficiaries)),
    // The first wallet that is filled in: a blank row names nobody.
    wallets: user.wallets.filter((wallet) => normalizeKey(wallet)).slice(0, 1)
  };
  const beneficiary = payoutAddress
    ? withBeneficiaryPayoutAndSigningAddress(blank, payoutAddress)
    : blank;
  return withSafetyTimerDefaults(
    {
      ...form,
      // Dropped only when the contact takes over its one wallet, so no wallet is lost.
      users: userHasPermissions(user) || user.wallets.length > 1
        ? form.users
        : form.users.filter((_, index) => index !== userIndex),
      beneficiaries: [...form.beneficiaries, beneficiary]
    },
    nowMs
  );
}

/**
 * Applies an edit to one person's user record. When the edit leaves a person who is
 * also a recovery contact with no user permission at all, the empty user record goes,
 * and the person stays on the list as a recovery contact.
 */
export function withPersonUserEdited(
  form: StateFormState,
  person: PersonEntry,
  edit: (user: UserFormState) => UserFormState
): StateFormState {
  if (person.userIndex === null) {
    return person.beneficiaryIndex === null
      ? form
      : withUserForContact(form, person.beneficiaryIndex, edit);
  }
  const next = edit(form.users[person.userIndex]);
  // Dropped only when the contact holds every wallet the record had, so nothing is lost
  // and turning a permission back on rebuilds the same record from the contact.
  const contactWallets =
    person.beneficiaryIndex === null
      ? []
      : form.beneficiaries[person.beneficiaryIndex].wallets.map((wallet) => wallet.toLowerCase());
  const drop =
    person.beneficiaryIndex !== null &&
    !userHasPermissions(next) &&
    next.wallets.every((wallet) => contactWallets.includes(wallet.toLowerCase()));
  // A contact with no payout key yet signs with the person's first filled-in wallet. It
  // follows that wallet when it changes, so editing the wallets does not split the
  // person. While every row is blank it goes blank too, and `groupPeople` keeps the
  // two together until a wallet is typed again.
  const linked = person.beneficiaryIndex === null ? null : form.beneficiaries[person.beneficiaryIndex];
  const followsUser =
    linked !== null &&
    next.wallets.length > 0 &&
    withBeneficiaryPayoutAndSigningAddress(linked, linked.payoutAddress).wallets.length === 0;
  return withMultisigDerivedFromCoSigners({
    ...form,
    beneficiaries: followsUser
      ? form.beneficiaries.map((entry, index) =>
          index === person.beneficiaryIndex
            ? { ...entry, wallets: [next.wallets.find((wallet) => wallet.trim()) ?? ""] }
            : entry
        )
      : form.beneficiaries,
    users: drop
      ? form.users.filter((_, index) => index !== person.userIndex)
      : form.users.map((user, index) => (index === person.userIndex ? next : user))
  });
}

/** The row key a beneficiary ends up under, for keeping an edited row open. */
export function personKeyForContact(form: StateFormState, beneficiaryId: string): string | null {
  const index = form.beneficiaries.findIndex((beneficiary) => beneficiary.id === beneficiaryId);
  return groupPeople(form).find((person) => person.beneficiaryIndex === index)?.key ?? null;
}

export function withoutRecoveryContact(
  form: StateFormState,
  beneficiaryIndex: number
): StateFormState {
  return {
    ...form,
    beneficiaries: form.beneficiaries.filter((_, index) => index !== beneficiaryIndex)
  };
}

/**
 * A recovery contact who gets a user permission (owner, co-signer, spender) needs a
 * user record. It signs with the contact's wallets, so the two stay one person.
 */
export function withUserForContact(
  form: StateFormState,
  beneficiaryIndex: number,
  edit: (user: UserFormState) => UserFormState
): StateFormState {
  const user: UserFormState = {
    ...createDefaultUserFormState(nextGeneratedId(form.users)),
    wallets: [...form.beneficiaries[beneficiaryIndex].wallets],
    preset: "custom"
  };
  return withMultisigDerivedFromCoSigners({ ...form, users: [...form.users, edit(user)] });
}

/** Removes both records behind one row. */
export function withPersonRemoved(
  form: StateFormState,
  person: PersonEntry
): StateFormState {
  return withMultisigDerivedFromCoSigners({
    ...form,
    users: form.users.filter((_, index) => index !== person.userIndex),
    beneficiaries: form.beneficiaries.filter((_, index) => index !== person.beneficiaryIndex)
  });
}

/** One bar segment per co-signer whose power counts, sized by that power. */
export type CoSignerSegment = { userIndex: number; userId: string; power: number };

export function coSignerSegments(form: StateFormState): CoSignerSegment[] {
  return form.users.flatMap((user, userIndex) => {
    const power = approvalPowerForUser(user);
    // `reachableApprovalPower` only counts people who have a wallet to sign with,
    // so the bar does the same: its total is the number the threshold is held to.
    return power > 0 && user.wallets.length > 0
      ? [{ userIndex, userId: user.id, power }]
      : [];
  });
}

/** The saved threshold, or null when the approval rule is off or not a number yet. */
export function approvalThreshold(form: StateFormState): number | null {
  if (form.multiSigThresholdMode !== "some") {
    return null;
  }
  const parsed = parseApprovalPowerInput(form.multiSigThreshold);
  if (parsed === null || parsed <= 0n) {
    return null;
  }
  return parsed > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(parsed);
}

/**
 * A threshold above the power the co-signers hold between them is valid on chain
 * (`configuration.ak:16-24` keeps owners able to act), but no group of co-signers
 * can ever meet it. The page allows it only after an explicit confirmation.
 */
export function thresholdIsUnreachable(form: StateFormState): boolean {
  const threshold = approvalThreshold(form);
  return threshold !== null && threshold > reachableApprovalPower(form.users);
}

/**
 * A short name for a person where a full heading does not fit, such as a bar label:
 * the start of the first wallet they sign with, or their record number before they
 * have one.
 */
export function personTag(entry: { id: string; wallets: string[] }): string {
  const wallet = entry.wallets.find((candidate) => candidate.trim().length > 0);
  return wallet ? wallet.trim().slice(0, 6) : `#${entry.id}`;
}
