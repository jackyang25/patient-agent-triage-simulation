import type {
  TurnAnnotation,
  TemporalFeatures,
  FailureMode,
  EscalationResult,
} from "../types";

export function deriveTemporalFeatures(
  annotations: TurnAnnotation[],
  escalationResult: EscalationResult,
  informationExtractionRate: number,
): TemporalFeatures {
  const agentTurns = annotations.filter((a) => a.role === "agent");

  // signal recognition: first turn where any positive signal fired (direction +1)
  const firstPositive = agentTurns.find((a) => a.escalationDirection === 1);
  const signalRecognitionTurn = firstPositive?.turnIndex ?? null;

  const escalationConvergence = agentTurns.map(
    (a) => a.escalationDirection ?? 0,
  );

  let decisionCommitmentTurn: number | null = null;
  if (agentTurns.length >= 2) {
    const dirs = escalationConvergence;
    const finalDir = dirs[dirs.length - 1];
    let commitIdx = 0;
    for (let i = dirs.length - 2; i >= 0; i--) {
      if (dirs[i] !== finalDir) {
        commitIdx = i + 1;
        break;
      }
    }
    decisionCommitmentTurn = agentTurns[commitIdx]?.turnIndex ?? null;
  } else if (agentTurns.length === 1) {
    decisionCommitmentTurn = agentTurns[0].turnIndex;
  }

  const isCorrect =
    escalationResult.outcome === "true_positive" ||
    escalationResult.outcome === "true_negative";

  const hasOscillation = escalationConvergence.some(
    (d, i) =>
      i > 0 &&
      d !== 0 &&
      escalationConvergence[i - 1] !== 0 &&
      d !== escalationConvergence[i - 1],
  );

  const maxTurnIdx =
    annotations.length > 0
      ? Math.max(...annotations.map((a) => a.turnIndex))
      : 0;
  const lateCommit =
    decisionCommitmentTurn !== null &&
    maxTurnIdx > 0 &&
    decisionCommitmentTurn > maxTurnIdx * 0.66;

  const nearMiss = isCorrect && (lateCommit || hasOscillation);

  // failure mode classification uses direction only -- rubric-agnostic
  let failureMode: FailureMode | null = null;
  if (escalationResult.outcome === "false_negative") {
    const everPositive = agentTurns.some((a) => a.escalationDirection === 1);
    const everNeutralOrNegAfterPositive = everPositive && agentTurns.some(
      (a, i) =>
        a.escalationDirection !== 1 &&
        agentTurns.slice(0, i).some((prev) => prev.escalationDirection === 1),
    );

    if (!everPositive) {
      failureMode = "never_probed";
    } else if (everNeutralOrNegAfterPositive) {
      failureMode = "probed_but_abandoned";
    } else {
      failureMode = "detected_but_no_action";
    }
  }

  return {
    signalRecognitionTurn,
    escalationConvergence,
    informationExtractionRate,
    decisionCommitmentTurn,
    nearMiss,
    failureMode,
  };
}
