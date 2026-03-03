import type { EscalationResult, FailureMode } from "./types";

export const OUTCOME_VARIANT: Record<
  EscalationResult["outcome"],
  "default" | "destructive" | "secondary" | "outline"
> = {
  true_positive: "default",
  true_negative: "default",
  false_negative: "destructive",
  false_positive: "secondary",
};

export const OUTCOME_SHORT: Record<EscalationResult["outcome"], string> = {
  true_positive: "TP",
  false_positive: "FP",
  true_negative: "TN",
  false_negative: "FN",
};

export const FAILURE_MODES: Record<
  FailureMode,
  { label: string; description: string }
> = {
  never_probed: {
    label: "Never Probed",
    description:
      "Agent never asked a clinically relevant follow-up question.",
  },
  probed_but_abandoned: {
    label: "Probed but Abandoned",
    description:
      "Agent asked relevant questions but dropped the line of inquiry when the patient deflected.",
  },
  detected_but_no_action: {
    label: "Detected but No Action",
    description:
      "Agent elicited concerning information but did not escalate.",
  },
};
