"use client";
import { useState } from "react";

/**
 * Holds back a field error while the box has focus, and reports it on blur.
 *
 * Every field that derives its error from the live value flags the prefixes of a
 * value the app accepts, because a prefix of a valid string is rarely valid
 * itself. Measured on the payout address field, typing one real preprod address
 * (108 characters) showed "That is not a valid Cardano address" on 99 of those
 * keystrokes: `looksLikeCardanoAddress` opens the gate at "addr_test", and
 * nothing parses until the last character lands.
 *
 * The error itself is still computed on every render. Only the moment it is
 * shown moves, so a value left in the box is judged the instant focus leaves.
 */
export function useBlurReportedError(error: string | null | undefined) {
  const [focused, setFocused] = useState(false);
  return {
    reportedError: focused ? null : (error ?? null),
    focusHandlers: {
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false)
    }
  };
}
