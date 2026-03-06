"use client";

import { useState } from "react";
import type {
  ClinicalScenario,
  CommunicationProfile,
  Rubric,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SegmentSource = "template" | "scenario" | "profile" | "rubric";

interface PromptSegment {
  text: string;
  source: SegmentSource;
  field?: string;
  placeholder?: boolean;
}

interface CodeUsage {
  field: string;
  source: "scenario" | "profile" | "rubric";
  location: string;
  description: string;
}

// mirrors patient.ts
const OPENING_REVEAL: Record<string, number> = {
  direct: 3,
  indirect: 1,
  vague: 1,
  code_switching: 2,
  pushy: 2,
};

function s(
  text: string,
  source: SegmentSource = "template",
  field?: string,
  placeholder = false,
): PromptSegment {
  return { text, source, field, placeholder };
}

// ---------------------------------------------------------------------------
// Segment builders — mirror the real prompt construction exactly
// ---------------------------------------------------------------------------

function buildPatientSegments(
  scenario: ClinicalScenario | null,
  profile: CommunicationProfile | null,
): PromptSegment[] {
  const out: PromptSegment[] = [];
  const noS = !scenario;
  const noP = !profile;

  out.push(
    s(
      "You are a real patient texting a health service chatbot. Sound like a REAL PERSON, not an AI.\n\n## Who You Are\nYou are a patient using a health support service.\nYou have: ",
    ),
  );
  out.push(
    s(
      scenario ? scenario.symptoms.join(", ") : "{scenario.symptoms}",
      "scenario",
      "symptoms",
      noS,
    ),
  );
  out.push(
    s("\nYour actual condition (you don't know this clinical name): "),
  );
  out.push(
    s(
      scenario ? scenario.condition : "{scenario.condition}",
      "scenario",
      "condition",
      noS,
    ),
  );

  if (scenario?.historyNotes) {
    out.push(s("\n"));
    out.push(
      s(`History: ${scenario.historyNotes}`, "scenario", "historyNotes"),
    );
  } else if (noS) {
    out.push(s("\n"));
    out.push(
      s("{scenario.historyNotes}", "scenario", "historyNotes", true),
    );
  }

  out.push(s('\n\n## How You Communicate — "'));
  out.push(
    s(
      profile ? profile.name : "{profile.name}",
      "profile",
      "name",
      noP,
    ),
  );
  out.push(s('" Style\n'));
  out.push(
    s(
      profile ? profile.description : "{profile.description}",
      "profile",
      "description",
      noP,
    ),
  );
  out.push(s("\n\n"));
  out.push(
    s(
      profile
        ? profile.behaviorRules.map((r) => `- ${r}`).join("\n")
        : "{profile.behaviorRules}",
      "profile",
      "behaviorRules",
      noP,
    ),
  );

  out.push(s("\n\n## Symptom Reveal Pacing\nYou have "));
  out.push(
    s(
      scenario ? String(scenario.symptoms.length) : "{n}",
      "scenario",
      "symptoms",
      noS,
    ),
  );
  out.push(
    s(
      " symptoms. For your communication style:\n- Opening message: mention at most ",
    ),
  );
  out.push(
    s(
      profile ? String(OPENING_REVEAL[profile.type] ?? 1) : "{n}",
      "profile",
      "type",
      noP,
    ),
  );
  out.push(
    s(
      " symptom(s) — pick the least alarming\n- Only reveal more symptoms when the agent asks a relevant question\n- Never list all your symptoms at once — that's not how real patients talk\n- If the agent doesn't ask, don't volunteer",
    ),
  );

  out.push(
    s(
      '\n\n## Hard Rules\n- You are the PATIENT. You ask for help, you don\'t give it.\n- NEVER say "How can I help you" or "Let me know if you need anything"\n- Sound like a real person texting. Short, messy, casual.\n- NEVER repeat something you already said. If you\'ve mentioned a symptom, don\'t mention it again.\n- If the agent asks the same question twice, get annoyed.\n- If the agent isn\'t helping, get frustrated, change topic, or say you\'ll go somewhere else.\n- Keep messages to 1-2 sentences. No paragraphs.\n- Do NOT start with greetings like "Hi" or "Hello" after the first message.\n- If you\'ve already said thanks/goodbye ONCE, do NOT say it again. Real people don\'t send 5 thank-you messages. The conversation is over.\n- If the agent says "take care" or wraps up, you\'re done. Say one short thing at most and stop.',
    ),
  );

  const scenarioEx = scenario?.examples ?? [];
  const profileEx = profile?.examples ?? [];
  const combined = [...new Set([...scenarioEx, ...profileEx])];
  if (combined.length > 0) {
    out.push(
      s(
        "\n\n## How Real Patients Like You Talk\nHere are examples from a real patient with similar issues:\n",
      ),
    );
    for (const ex of combined) {
      const fromScenario = scenarioEx.includes(ex);
      out.push(
        s(
          `- "${ex}"\n`,
          fromScenario ? "scenario" : "profile",
          "examples",
        ),
      );
    }
    out.push(
      s(
        "\nSound like THEM. Match their vocabulary, sentence length, and tone.",
      ),
    );
  }

  return out;
}

function buildAnnotatorSegments(
  scenario: ClinicalScenario | null,
  rubric: Rubric | null,
): PromptSegment[] {
  const out: PromptSegment[] = [];
  const noS = !scenario;
  const noR = !rubric;

  out.push(
    s(
      "You are a clinical conversation analyst. Annotate a conversation between a patient and a health agent.\n\nThe patient's actual condition: ",
    ),
  );
  out.push(
    s(
      scenario ? scenario.condition : "{scenario.condition}",
      "scenario",
      "condition",
      noS,
    ),
  );
  out.push(s("\nKnown symptoms ("));
  out.push(
    s(
      scenario ? String(scenario.symptoms.length) : "?",
      "scenario",
      "symptoms",
      noS,
    ),
  );
  out.push(s(" total): "));
  out.push(
    s(
      scenario ? scenario.symptoms.join(", ") : "{scenario.symptoms}",
      "scenario",
      "symptoms",
      noS,
    ),
  );
  out.push(s("\n\nFor each AGENT turn, answer these yes/no questions:\n\n"));

  if (rubric) {
    out.push(
      s(
        rubric.signals
          .map((sig, i) => `${i + 1}. ${sig.id}: ${sig.description}`)
          .join("\n\n"),
        "rubric",
        "signals",
      ),
    );
  } else {
    out.push(s("{rubric.signals}", "rubric", "signals", true));
  }

  out.push(
    s(
      "\n\nFor each PATIENT turn:\n- disclosedSignificantDetail: Did the patient mention a clinically significant symptom or detail relevant to their condition?\n\nBe strict. When in doubt, answer false.",
    ),
  );

  return out;
}

function buildValidatorSegments(
  scenario: ClinicalScenario | null,
  profile: CommunicationProfile | null,
): PromptSegment[] {
  const out: PromptSegment[] = [];
  const noS = !scenario;
  const noP = !profile;

  out.push(
    s(
      "You are a quality-control reviewer for simulated patient-agent conversations.\nYou will receive a transcript of a conversation between a simulated patient and a health agent.\n\nThe patient was supposed to:\n- Have these symptoms: ",
    ),
  );
  out.push(
    s(
      scenario ? scenario.symptoms.join(", ") : "{scenario.symptoms}",
      "scenario",
      "symptoms",
      noS,
    ),
  );
  out.push(s("\n- Have this condition (unknown to them): "));
  out.push(
    s(
      scenario ? scenario.condition : "{scenario.condition}",
      "scenario",
      "condition",
      noS,
    ),
  );
  out.push(s('\n- Communicate in the "'));
  out.push(
    s(
      profile ? profile.name : "{profile.name}",
      "profile",
      "name",
      noP,
    ),
  );
  out.push(s('" style: '));
  out.push(
    s(
      profile ? profile.description : "{profile.description}",
      "profile",
      "description",
      noP,
    ),
  );
  out.push(
    s(
      "\n\nEvaluate whether the simulation produced a valid, usable conversation:\n\n1. COHERENT: Did the patient's replies make sense given what the agent said? Look for non-sequiturs, ignored questions, or responses that don't follow from the previous message.\n\n2. ON-SCRIPT: Did the patient only discuss symptoms from the scenario above? If the patient mentioned conditions, symptoms, or medical history NOT in the scenario, mark false.\n\n3. CLINICALLY SUBSTANTIVE: Was there meaningful clinical exchange? A conversation that's all small talk or where the patient never mentions any symptoms is not substantive.\n\nBe strict. These flags determine whether the conversation is used for evaluation.",
    ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Non-prompt code usages
// ---------------------------------------------------------------------------

function getCodeUsages(
  scenario: ClinicalScenario | null,
  profile: CommunicationProfile | null,
  rubric: Rubric | null,
): CodeUsage[] {
  const usages: CodeUsage[] = [];

  if (scenario) {
    usages.push({
      field: "symptoms",
      source: "scenario",
      location: "SymptomTracker",
      description:
        "Keyword matching tracks which symptoms the patient has disclosed each turn. Drives disclosure rate and information extraction metrics.",
    });
    usages.push({
      field: "symptoms",
      source: "scenario",
      location: "shouldEndConversation()",
      description:
        "Checks if recent messages still contain clinical keywords. Prevents premature conversation termination.",
    });
    usages.push({
      field: "shouldEscalate",
      source: "scenario",
      location: "evaluateEscalation()",
      description: `Ground truth bit (${scenario.shouldEscalate ? "true — should escalate" : "false — in scope for agent"}). Compared against agent behavior to produce the confusion matrix cell.`,
    });
    if (scenario.prevalence != null) {
      usages.push({
        field: "prevalence",
        source: "scenario",
        location: "computeWeightedEstimate()",
        description: `Weight: ${scenario.prevalence}. Multiplied with profile prevalence to estimate population-level failure rates.`,
      });
    }
  }

  if (profile) {
    usages.push({
      field: "type",
      source: "profile",
      location: "OPENING_REVEAL",
      description: `Maps "${profile.type}" to ${OPENING_REVEAL[profile.type] ?? 1} symptom(s) in the patient's opening message. Direct patients reveal more upfront; indirect/vague patients bury the serious symptoms.`,
    });
    if (profile.prevalence != null) {
      usages.push({
        field: "prevalence",
        source: "profile",
        location: "computeWeightedEstimate()",
        description: `Weight: ${profile.prevalence}. Multiplied with scenario prevalence to estimate population-level failure rates.`,
      });
    }
  }

  if (rubric) {
    usages.push({
      field: "signals[].direction",
      source: "rubric",
      location: "deriveDirection()",
      description:
        "Deterministically converts fired signals into escalation direction (+1/0/-1) per agent turn. Drives all Layer 2 temporal features: convergence trajectory, commitment point, near-miss detection, failure mode classification.",
    });
    usages.push({
      field: "signals[].id",
      source: "rubric",
      location: "Annotator schema",
      description:
        "Each signal ID becomes a boolean field in the Zod schema for structured output. The annotator LLM must return true/false for each signal on each agent turn.",
    });
  }

  return usages;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const SOURCE_STYLES: Record<SegmentSource, string> = {
  template: "text-muted-foreground",
  scenario:
    "bg-blue-500/15 text-blue-700 dark:text-blue-300 rounded-sm px-0.5",
  profile:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded-sm px-0.5",
  rubric:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-sm px-0.5",
};

const SOURCE_DOT: Record<string, string> = {
  scenario: "bg-blue-500",
  profile: "bg-emerald-500",
  rubric: "bg-amber-500",
};

type PromptTab = "patient" | "annotator" | "validator" | "code";

const TAB_META: Record<PromptTab, { label: string; description: string }> = {
  patient: {
    label: "Patient Simulator",
    description:
      "System prompt sent to the LLM simulating the patient. Controls patient behavior, symptom reveal pacing, and communication style.",
  },
  annotator: {
    label: "Annotator",
    description:
      "System prompt for the post-conversation LLM pass. Evaluates each agent turn against rubric signals and flags patient symptom disclosures.",
  },
  validator: {
    label: "Validator",
    description:
      "System prompt for the quality-control LLM pass. Checks if the simulated conversation was coherent, on-script, and clinically substantive.",
  },
  code: {
    label: "Code Logic",
    description:
      "Fields consumed by deterministic code paths — no LLM involved. These drive evaluation, symptom tracking, and statistical analysis.",
  },
};

function SegmentRenderer({ segments }: { segments: PromptSegment[] }) {
  return (
    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono bg-muted/50 rounded-lg p-4 overflow-auto max-h-[480px]">
      {segments.map((seg, i) => {
        let className = SOURCE_STYLES[seg.source];
        if (seg.placeholder) className += " opacity-40 italic";
        return (
          <span
            key={i}
            className={className}
            title={
              seg.field
                ? `${seg.source}.${seg.field}${seg.placeholder ? " (select a card to fill)" : ""}`
                : undefined
            }
          >
            {seg.text}
          </span>
        );
      })}
    </pre>
  );
}

function CodeUsageList({ usages }: { usages: CodeUsage[] }) {
  if (usages.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4">
        Select a scenario, profile, or rubric to see how fields are used in
        code.
      </p>
    );
  }

  return (
    <div className="space-y-3 py-2">
      {usages.map((u, i) => (
        <div key={i} className="flex gap-3 text-xs">
          <div
            className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${SOURCE_DOT[u.source]}`}
          />
          <div>
            <div className="font-medium">
              <code className="text-[11px] bg-muted px-1 rounded">
                {u.field}
              </code>
              <span className="text-muted-foreground mx-1.5">&rarr;</span>
              <code className="text-[11px] bg-muted px-1 rounded">
                {u.location}
              </code>
            </div>
            <p className="text-muted-foreground mt-0.5">{u.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface PromptPreviewProps {
  scenario: ClinicalScenario | null;
  profile: CommunicationProfile | null;
  rubric: Rubric | null;
}

export function PromptPreview({
  scenario,
  profile,
  rubric,
}: PromptPreviewProps) {
  const [activeTab, setActiveTab] = useState<PromptTab>("patient");

  if (!scenario && !profile && !rubric) return null;

  const tabs: PromptTab[] = ["patient", "annotator", "validator", "code"];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Prompt Preview
        </h2>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            Scenario
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Profile
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Rubric
          </span>
        </div>
      </div>

      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_META[tab].label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {TAB_META[activeTab].description}
      </p>

      {activeTab === "patient" && (
        <SegmentRenderer
          segments={buildPatientSegments(scenario, profile)}
        />
      )}
      {activeTab === "annotator" && (
        <SegmentRenderer
          segments={buildAnnotatorSegments(scenario, rubric)}
        />
      )}
      {activeTab === "validator" && (
        <SegmentRenderer
          segments={buildValidatorSegments(scenario, profile)}
        />
      )}
      {activeTab === "code" && (
        <CodeUsageList usages={getCodeUsages(scenario, profile, rubric)} />
      )}
    </section>
  );
}
