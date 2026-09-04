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
  maxAbsorbedChangeLovelace?: bigint;
};

const DEFAULT_MAX_ABSORBED_CHANGE_LOVELACE = 5_000_000n;

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

function isInsufficientSelection(error: unknown) {
  return (
    error instanceof Error &&
    error.message === "Not enough UTxOs to cover the required value."
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
        (utxo) => isPureLovelaceUtxo(utxo) && !excludedRefs.has(inputRef(utxo))
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
        ...candidates.slice(1).map((_, index) => candidates.slice(0, index + 2))
      ];
      let selection: Selection | undefined;
      let selectedChangeLovelace: bigint | undefined;
      let insufficientError: unknown;
      let excessiveChangeFound = false;
      const maxAbsorbedChangeLovelace =
        options.maxAbsorbedChangeLovelace ??
        DEFAULT_MAX_ABSORBED_CHANGE_LOVELACE;

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
          if (candidateChangeLovelace > maxAbsorbedChangeLovelace) {
            excessiveChangeFound = true;
            continue;
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

      if (!selection) {
        if (excessiveChangeFound) {
          throw new Error(
            "ADA payout funding would add more than 5 ADA of avoidable change to the tagged payout. Use a smaller funding UTxO or consolidate funds before retrying."
          );
        }
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
