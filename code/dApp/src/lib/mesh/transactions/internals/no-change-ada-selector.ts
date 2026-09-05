import { getLovelaceQuantity, setLovelaceQuantity } from "./value";
import {
  LargestFirstInputSelector,
  type MeshTxBuilderOptions,
  type UTxO
} from "@meshsdk/core";

type InputSelector = NonNullable<MeshTxBuilderOptions["selector"]>;
type SelectArguments = Parameters<InputSelector["select"]>;
type Selection = Awaited<ReturnType<InputSelector["select"]>>;
type SelectionSkeleton = Parameters<SelectArguments[5]["computeMinimumCost"]>[0];

type NoChangeAdaSelectorOptions = {
  delegate?: InputSelector;
  resolveSinkOutputIndex: (outputs: SelectArguments[1]) => number;
  excludedInputRefs?: () => ReadonlySet<string>;
};

// Pair search only improves the surplus of an already valid selection. Stopping
// after this many attempts cannot make a fundable transaction fail.
const PAIR_IMPROVEMENT_ATTEMPTS = 8;

function inputRef(utxo: UTxO) {
  return `${utxo.input.txHash}#${utxo.input.outputIndex}`;
}

function isPureLovelaceUtxo(utxo: UTxO) {
  return (
    utxo.output.amount.length === 1 &&
    utxo.output.amount[0]?.unit === "lovelace"
  );
}

function totalPureLovelaceChange(change: SelectionSkeleton["change"]) {
  return change.reduce((total, output) => {
    const hasForeignAsset = output.amount.some(
      (asset) => asset.unit !== "lovelace" && BigInt(asset.quantity) !== 0n
    );
    if (hasForeignAsset) {
      throw new Error(
        "ADA payout coin selection produced native-asset change; only pure-lovelace funding inputs are allowed."
      );
    }

    return total + getLovelaceQuantity(output.amount);
  }, 0n);
}

function comparePureLovelaceUtxos(left: UTxO, right: UTxO) {
  const leftLovelace = getLovelaceQuantity(left.output.amount);
  const rightLovelace = getLovelaceQuantity(right.output.amount);
  if (leftLovelace !== rightLovelace) {
    return leftLovelace < rightLovelace ? -1 : 1;
  }
  return inputRef(left).localeCompare(inputRef(right));
}

function totalSelectedLovelace(selection: Selection) {
  return [...selection.newInputs].reduce(
    (total, utxo) => total + getLovelaceQuantity(utxo.output.amount),
    0n
  );
}

type PairFrontierRow = {
  leftIndex: number;
  rightIndex: number;
  totalLovelace: bigint;
};

function comparePairFrontierRows(left: PairFrontierRow, right: PairFrontierRow) {
  if (left.totalLovelace !== right.totalLovelace) {
    return left.totalLovelace < right.totalLovelace ? -1 : 1;
  }
  if (left.leftIndex !== right.leftIndex) {
    return left.leftIndex - right.leftIndex;
  }
  return left.rightIndex - right.rightIndex;
}

function pushPairFrontierRow(
  frontier: PairFrontierRow[],
  row: PairFrontierRow
) {
  frontier.push(row);
  let index = frontier.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = frontier[parentIndex]!;
    if (comparePairFrontierRows(parent, row) <= 0) break;
    frontier[index] = parent;
    index = parentIndex;
  }

  frontier[index] = row;
}

function popPairFrontierRow(frontier: PairFrontierRow[]) {
  const first = frontier[0];
  const last = frontier.pop();
  if (!first || !last) return undefined;
  if (frontier.length === 0) return first;

  let index = 0;
  frontier[0] = last;
  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    let nextIndex = index;

    if (
      leftIndex < frontier.length &&
      comparePairFrontierRows(frontier[leftIndex]!, frontier[nextIndex]!) < 0
    ) {
      nextIndex = leftIndex;
    }
    if (
      rightIndex < frontier.length &&
      comparePairFrontierRows(frontier[rightIndex]!, frontier[nextIndex]!) < 0
    ) {
      nextIndex = rightIndex;
    }
    if (nextIndex === index) break;

    const next = frontier[nextIndex]!;
    frontier[nextIndex] = frontier[index]!;
    frontier[index] = next;
    index = nextIndex;
  }

  return first;
}

function* pairsAtOrAbove(candidates: UTxO[], lowerBound: bigint) {
  const lovelaceByIndex = candidates.map((candidate) =>
    getLovelaceQuantity(candidate.output.amount)
  );
  const frontier: PairFrontierRow[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length - 1; leftIndex += 1) {
    let low = leftIndex + 1;
    let high = candidates.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (lovelaceByIndex[leftIndex]! + lovelaceByIndex[middle]! >= lowerBound) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }
    if (low < candidates.length) {
      pushPairFrontierRow(frontier, {
        leftIndex,
        rightIndex: low,
        totalLovelace:
          lovelaceByIndex[leftIndex]! + lovelaceByIndex[low]!
      });
    }
  }

  while (frontier.length > 0) {
    const row = popPairFrontierRow(frontier)!;
    yield [candidates[row.leftIndex]!, candidates[row.rightIndex]!] as const;

    const nextRightIndex = row.rightIndex + 1;
    if (nextRightIndex < candidates.length) {
      pushPairFrontierRow(frontier, {
        leftIndex: row.leftIndex,
        rightIndex: nextRightIndex,
        totalLovelace:
          lovelaceByIndex[row.leftIndex]! + lovelaceByIndex[nextRightIndex]!
      });
    }
  }
}

function isInsufficientSelection(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "Not enough UTxOs to cover the required value."
  );
}

function isTransactionSizeExceeded(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "Transaction size exceeds the maximum allowed size."
  );
}

export function createNoChangeAdaSelector(
  options: NoChangeAdaSelectorOptions
): InputSelector {
  const delegate = options.delegate ?? new LargestFirstInputSelector();

  return {
    async select(...args: SelectArguments): Promise<Selection> {
      const [preselectedInputs, outputs, implicitValue, utxos, changeAddress, constraints] =
        args;
      const excludedRefs = options.excludedInputRefs?.() ?? new Set<string>();
      const candidates = utxos.filter(
        (utxo) =>
          isPureLovelaceUtxo(utxo) &&
          getLovelaceQuantity(utxo.output.amount) > 0n &&
          !excludedRefs.has(inputRef(utxo))
      ).sort(comparePureLovelaceUtxos);

      const withAbsorbedChange = async <T>(
        skeleton: SelectionSkeleton,
        callback: (adjusted: SelectionSkeleton) => Promise<T>
      ) => {
        const sinkIndex = options.resolveSinkOutputIndex(outputs);
        const sink = outputs[sinkIndex];
        if (!sink) {
          throw new Error("ADA payout change sink is missing from the prepared outputs.");
        }

        const originalLovelace = getLovelaceQuantity(sink.amount);
        const changeLovelace = totalPureLovelaceChange(skeleton.change);
        setLovelaceQuantity(sink.amount, originalLovelace + changeLovelace);

        try {
          return await callback({ ...skeleton, change: [] });
        } finally {
          setLovelaceQuantity(sink.amount, originalLovelace);
        }
      };

      const wrappedConstraints = {
        ...constraints,
        computeMinimumCost: (skeleton: SelectionSkeleton) =>
          withAbsorbedChange(skeleton, constraints.computeMinimumCost),
        maxSizeExceed: (skeleton: SelectionSkeleton) =>
          withAbsorbedChange(skeleton, constraints.maxSizeExceed)
      };
      const candidateGroups = [
        ...candidates.map((candidate) => [candidate]),
        ...(candidates.length > 1 ? [candidates] : [])
      ];
      let selection: Selection | undefined;
      let selectedChangeLovelace: bigint | undefined;
      let insufficientError: unknown;
      let feeFreeAddedLovelace: bigint | undefined;

      for (const candidateGroup of candidateGroups) {
        try {
          const candidateSelection = await delegate.select(
            preselectedInputs,
            outputs,
            implicitValue,
            candidateGroup,
            changeAddress,
            wrappedConstraints
          );
          const candidateChangeLovelace = totalPureLovelaceChange(
            candidateSelection.change
          );
          const candidateFeeFreeAddedLovelace =
            totalSelectedLovelace(candidateSelection) -
            candidateChangeLovelace -
            candidateSelection.fee;
          if (
            feeFreeAddedLovelace === undefined ||
            candidateFeeFreeAddedLovelace < feeFreeAddedLovelace
          ) {
            feeFreeAddedLovelace = candidateFeeFreeAddedLovelace;
          }
          if (
            selectedChangeLovelace === undefined ||
            candidateChangeLovelace < selectedChangeLovelace
          ) {
            selection = candidateSelection;
            selectedChangeLovelace = candidateChangeLovelace;
          }
        } catch (error) {
          if (!isInsufficientSelection(error)) {
            throw error;
          }
          insufficientError = error;
        }
      }

      if (selectedChangeLovelace !== 0n && feeFreeAddedLovelace !== undefined) {
        let pairAttempts = 0;
        for (const pair of pairsAtOrAbove(candidates, feeFreeAddedLovelace)) {
          if (pairAttempts >= PAIR_IMPROVEMENT_ATTEMPTS) break;
          pairAttempts += 1;
          try {
            const pairSelection = await delegate.select(
              preselectedInputs,
              outputs,
              implicitValue,
              [...pair],
              changeAddress,
              wrappedConstraints
            );
            const pairChangeLovelace = totalPureLovelaceChange(
              pairSelection.change
            );
            if (
              selectedChangeLovelace === undefined ||
              pairChangeLovelace < selectedChangeLovelace
            ) {
              selection = pairSelection;
              selectedChangeLovelace = pairChangeLovelace;
              if (pairChangeLovelace === 0n) break;
            }
          } catch (error) {
            if (
              !isInsufficientSelection(error) &&
              !isTransactionSizeExceeded(error)
            ) {
              throw error;
            }
            if (isInsufficientSelection(error)) {
              insufficientError = error;
            }
          }
        }
      }

      if (!selection) {
        throw insufficientError ?? new Error("Not enough UTxOs to cover the required value.");
      }
      const sink = outputs[options.resolveSinkOutputIndex(outputs)];
      if (!sink) {
        throw new Error("ADA payout change sink is missing from the prepared outputs.");
      }

      setLovelaceQuantity(
        sink.amount,
        getLovelaceQuantity(sink.amount) + totalPureLovelaceChange(selection.change)
      );

      return { ...selection, change: [] };
    }
  };
}
