// --- Clinical scenario (what the patient has) ---

export interface ClinicalScenario {
  id: string;
  name: string;
  description: string;
  condition: string;
  symptoms: string[];
  historyNotes?: string;
  /** ground truth: should the agent escalate this to a human? */
  shouldEscalate: boolean;
  /**
   * Estimated prevalence in target population (0-1).
   * Deployment-specific — how often this presentation occurs.
   * Used to weight failure rates. Optional; unweighted if omitted.
   */
  prevalence?: number;
  /** real patient phrasings to ground the simulator */
  examples?: string[];
}

// --- Communication profile (how the patient talks) ---

export type ProfileType =
  | "direct"
  | "indirect"
  | "vague"
  | "code_switching"
  | "pushy";

export interface CommunicationProfile {
  id: string;
  type: ProfileType;
  name: string;
  description: string;
  behaviorRules: string[];
  /**
   * Estimated prevalence in target population (0-1).
   * Deployment-specific — what fraction of patients communicate this way.
   * Used to weight failure rates. Optional; unweighted if omitted.
   */
  prevalence?: number;
  /** real messages demonstrating this communication style */
  examples?: string[];
}

// --- Conversation types ---

export interface Message {
  role: "patient" | "agent" | "system";
  content: string;
  turnIndex: number;
}

export interface ConversationTrace {
  messages: Message[];
  terminationReason: "escalation" | "no_escalation" | "max_turns";
  totalTurns: number;
  turnAnnotations?: TurnAnnotation[];
}

// --- Evaluation (rule-based, binary) ---

export interface EscalationResult {
  /** did the agent escalate during the conversation? */
  agentEscalated: boolean;
  /** ground truth from the scenario */
  shouldHaveEscalated: boolean;
  /** TP, FP, TN, FN */
  outcome: "true_positive" | "false_positive" | "true_negative" | "false_negative";
}

// --- Escalation rubric (defines what to observe and how to score it) ---

export interface EscalationSignal {
  id: string;
  /** used verbatim in the LLM annotation prompt */
  description: string;
  /** +1 = toward escalation, -1 = away from escalation */
  direction: 1 | -1;
}

export interface Rubric {
  id: string;
  name: string;
  signals: EscalationSignal[];
}

// --- Temporal annotation (Layer 2) ---

export interface TurnAnnotation {
  turnIndex: number;
  role: "patient" | "agent";
  /** agent only: rubric signal results keyed by signal id */
  signals?: Record<string, boolean>;
  /** agent only: derived deterministically from fired signals and their configured directions */
  escalationDirection?: 1 | 0 | -1;
  /** patient only: revealed a clinically significant detail */
  disclosedSignificantDetail?: boolean;
}

export type FailureMode =
  | "never_probed"
  | "probed_but_abandoned"
  | "detected_but_no_action";

export interface TemporalFeatures {
  /** first agent turn that probed or acknowledged severity */
  signalRecognitionTurn: number | null;
  /** per-agent-turn escalation direction: +1, 0, -1 */
  escalationConvergence: number[];
  /** fraction of scenario symptoms the agent elicited (0-1) */
  informationExtractionRate: number;
  /** turn after which the agent's direction stopped changing */
  decisionCommitmentTurn: number | null;
  /** correct outcome but fragile trajectory */
  nearMiss: boolean;
  /** for false negatives: how the failure happened */
  failureMode: FailureMode | null;
}

// --- Post-conversation validation ---

export interface ValidationResult {
  /** did patient responses follow logically from agent messages? */
  coherent: boolean;
  /** did patient stick to scenario symptoms without hallucinating? */
  onScript: boolean;
  /** was there enough symptom discussion for a meaningful test? */
  clinicallySubstantive: boolean;
  /** short descriptions of any issues found */
  issues: string[];
}

// --- Agent adapter config ---

export type AdapterType = "stub" | "http";

export interface StubAdapterConfig {
  type: "stub";
}

export interface HttpAdapterConfig {
  type: "http";
  endpoint: string;
  headers?: Record<string, string>;
}

export type AdapterConfig = StubAdapterConfig | HttpAdapterConfig;

// --- Simulation run ---

export type SimulationStatus =
  | "pending"
  | "simulating"
  | "evaluating"
  | "completed"
  | "failed";

export interface SimulationRun {
  id: string;
  scenarioId: string;
  profileId: string;
  adapterConfig: AdapterConfig;
  status: SimulationStatus;
  trace?: ConversationTrace;
  evaluation?: EscalationResult;
  temporalFeatures?: TemporalFeatures;
  validation?: ValidationResult;
  rubricId: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  /** groups runs that were launched together as a matrix */
  batchId?: string;
}
