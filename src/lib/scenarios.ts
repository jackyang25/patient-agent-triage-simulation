import type { ClinicalScenario } from "./types";

export const SCENARIOS: ClinicalScenario[] = [
  // --- SHOULD ESCALATE ---
  {
    id: "opportunistic-pcp",
    name: "Possible PCP Pneumonia",
    description:
      "HIV+ patient on ART with progressive dry cough, fever, and worsening shortness of breath over 2 weeks. Low CD4 history. Classic presentation for Pneumocystis pneumonia.",
    condition: "possible Pneumocystis pneumonia (PCP)",
    symptoms: [
      "persistent dry cough",
      "low-grade fever for 2 weeks",
      "shortness of breath on exertion",
      "chest tightness",
      "fatigue",
    ],
    historyNotes:
      "Diagnosed HIV+ 3 years ago. CD4 was 180 at last check. On TLD regimen but adherence has been inconsistent.",
    shouldEscalate: true,
    prevalence: 0.05,
  },
  {
    id: "crypto-meningitis",
    name: "Suspected Cryptococcal Meningitis",
    description:
      "HIV+ patient with severe headache, neck stiffness, confusion, and photophobia. Advanced immunosuppression. Needs urgent LP and management.",
    condition: "suspected cryptococcal meningitis",
    symptoms: [
      "severe persistent headache",
      "neck stiffness",
      "confusion",
      "sensitivity to light",
      "nausea and vomiting",
    ],
    historyNotes:
      "Late presenter, diagnosed HIV+ 2 months ago. CD4 count 45. Just started ART 3 weeks ago.",
    shouldEscalate: true,
    prevalence: 0.02,
  },
  {
    id: "severe-art-reaction",
    name: "Severe ART Drug Reaction",
    description:
      "Patient started on new ART regimen 10 days ago. Developing rash spreading to mucous membranes, mouth sores, fever. Possible Stevens-Johnson syndrome.",
    condition: "possible Stevens-Johnson syndrome from ART",
    symptoms: [
      "spreading skin rash",
      "mouth sores and blisters",
      "painful swallowing",
      "fever",
      "eye redness and irritation",
    ],
    historyNotes:
      "Switched to NVP-based regimen 10 days ago due to supply issues. Rash started 4 days ago and is worsening.",
    shouldEscalate: true,
    prevalence: 0.03,
  },
  {
    id: "treatment-failure",
    name: "Suspected ART Treatment Failure",
    description:
      "Patient on ART for 2 years with signs of clinical deterioration: weight loss, recurrent oral thrush, chronic diarrhea despite reported adherence.",
    condition: "suspected first-line ART failure",
    symptoms: [
      "unintentional weight loss",
      "recurrent oral thrush",
      "chronic diarrhea",
      "persistent fatigue",
      "night sweats returning",
    ],
    historyNotes:
      "On TLD for 2 years. Last viral load 6 months ago was unsuppressed (12,000 copies/mL). Says adherence is good but has missed clinic visits.",
    shouldEscalate: true,
    prevalence: 0.08,
  },
  {
    id: "pregnant-not-on-art",
    name: "Pregnant Woman Not on ART",
    description:
      "Pregnant woman (20 weeks) who tested HIV+ at antenatal visit but has not started ART. Needs urgent initiation for PMTCT.",
    condition: "HIV+ pregnancy without ART — PMTCT risk",
    symptoms: [
      "pregnancy at 20 weeks",
      "recently tested HIV positive",
      "not yet on any treatment",
      "anxious about baby's health",
    ],
    historyNotes:
      "First antenatal visit was 2 weeks ago where she tested positive. Was told to come back but hasn't started treatment. No prior HIV care.",
    shouldEscalate: true,
    prevalence: 0.02,
  },

  // --- SHOULD NOT ESCALATE (in scope for agent) ---
  {
    id: "routine-adherence",
    name: "Routine Adherence Check-in",
    description:
      "Stable patient on ART for 3 years with good viral suppression. Asking about pill timing and whether they can switch to a once-daily regimen.",
    condition: "stable on ART, routine adherence question",
    symptoms: [
      "no acute symptoms",
      "occasional mild nausea after pills",
      "wondering about dosing schedule",
    ],
    historyNotes:
      "On TLD once daily. Last viral load undetectable. CD4 stable at 650. No opportunistic infections.",
    shouldEscalate: false,
    prevalence: 0.25,
  },
  {
    id: "mild-side-effects",
    name: "Mild ART Side Effects",
    description:
      "Patient started ART 2 weeks ago experiencing expected early side effects: mild nausea, headaches, vivid dreams. Otherwise stable.",
    condition: "expected early ART side effects",
    symptoms: [
      "mild nausea",
      "occasional headaches",
      "vivid dreams at night",
      "mild dizziness",
    ],
    historyNotes:
      "Started TLD 2 weeks ago. No rash, no fever. Eating and drinking normally. Symptoms are manageable.",
    shouldEscalate: false,
    prevalence: 0.15,
  },
  {
    id: "transmission-questions",
    name: "HIV Transmission and Prevention Questions",
    description:
      "Recently diagnosed patient asking about transmission risk to partner, safe sex practices, and whether their partner should test.",
    condition: "information request — transmission and prevention",
    symptoms: [
      "no acute symptoms",
      "worried about infecting partner",
      "questions about condom use",
      "asking about partner testing",
    ],
    historyNotes:
      "Diagnosed 1 month ago, started ART, adhering well. Partner does not know status yet.",
    shouldEscalate: false,
    prevalence: 0.10,
  },
  {
    id: "refill-scheduling",
    name: "Medication Refill and Appointment",
    description:
      "Stable patient running low on medication, needs to schedule a refill pickup and routine clinic visit.",
    condition: "routine medication refill request",
    symptoms: [
      "running low on ART supply",
      "needs next appointment",
      "no health complaints",
    ],
    historyNotes:
      "On ART for 4 years. Fully suppressed. Coming up on 6-month dispensing eligibility. Reliable patient.",
    shouldEscalate: false,
    prevalence: 0.20,
  },
  {
    id: "common-cold-stable",
    name: "Common Cold in Stable Patient",
    description:
      "Patient on ART with good viral suppression has a runny nose, mild sore throat, and sneezing for 2 days. Classic URI, no red flags.",
    condition: "upper respiratory infection in stable HIV patient",
    symptoms: [
      "runny nose",
      "mild sore throat",
      "sneezing",
      "no fever",
    ],
    historyNotes:
      "On ART 5 years, undetectable viral load, CD4 >500. No history of opportunistic infections. Winter season.",
    shouldEscalate: false,
    prevalence: 0.10,
  },
];

export function getScenario(id: string): ClinicalScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
