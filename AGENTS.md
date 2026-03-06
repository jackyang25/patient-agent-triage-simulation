
Patient-Agent Triage Simulation (PATS)

## High-Level Design Document

### Table of Contents

[1. Purpose](https://www.notion.so/1-Purpose-319f42d22c1780d4a7bdffa98987ea2e?pvs=21) 

[2. Related Work and Positioning](https://www.notion.so/2-Related-Work-and-Positioning-319f42d22c1780ee9676f3ee449264ed?pvs=21) 

[3. The Core Problem](https://www.notion.so/3-The-Core-Problem-319f42d22c178022817ad2a91ecb2539?pvs=21) 

[4. Architecture](https://www.notion.so/4-Architecture-319f42d22c1780779190f7f2cfd68157?pvs=21) 

[5. What the System Produces](https://www.notion.so/5-What-the-System-Produces-319f42d22c178046b892f9e58733b9f0?pvs=21) 

[6. What This Defers](https://www.notion.so/6-What-This-Defers-319f42d22c1780d68004ce2de2d3639c?pvs=21) 

[7. How to Start](https://www.notion.so/7-How-to-Start-319f42d22c17806093cbfd4f15038ecc?pvs=21) 

---

## 1. Purpose

Patient-facing health agents are increasingly deployed in constrained settings, including low- and middle-income country (LMIC) environments, where they serve as a first point of contact for patients navigating care. In these contexts, the consequences of a missed escalation are amplified: limited provider capacity means a patient who should have been flagged may not get another chance.

This framework characterizes how these agents make escalation decisions. Not just whether they get the right answer, but how the decision unfolds across multi-turn conversations with realistic patient communication styles.

The approach draws from an established pattern in prediction markets, where agents are scored not just on their final prediction but on how their probability estimates evolve as new information arrives. We apply the same lens to patient-facing agents: tracking how the escalation decision evolves as a patient reveals symptoms across turns. An agent that converges early and decisively toward the correct outcome is fundamentally different from one that oscillates and arrives at the right answer by chance.

It produces three layers of output:

1. A **confusion matrix** — binary, verifiable escalation accuracy.
2. **Temporal features** per conversation — when the agent recognized severity signals, whether it converged toward or away from the correct decision, and whether correct outcomes were clean decisions or near-misses.
3. A **statistical harness** — survival analysis, change-point detection, and mixed-effects models that quantify how communication style distorts escalation dynamics across a population of conversations.

> The confusion matrix tells you where the agent fails. The temporal layer tells you how and why. The statistical harness tells you how much it matters.
> 

This does not replace benchmarks or rubric scoring. It adds what those methods cannot provide: a temporal, mechanistic view of escalation behavior across varied patient communication styles at scale.

---

## 2. Related Work and Positioning

Several adjacent efforts exist. None address the specific problem this framework targets.

**3-Bot Evaluation System (JMIR Nursing, 2025)** Uses patient bots, provider bots, and an evaluator bot to validate healthcare chatbots. Architecturally similar, but focused on general chatbot validation with LLM-as-judge scoring. Does not target escalation accuracy specifically, and does not vary communication profiles as an independent variable.

**MedPI (medRxiv, 2026)** A 105-dimension benchmark for LLMs in patient-clinician conversations with affect-modeled AI patients. Academically rigorous but massively over-scoped for deployment evaluation. Clinician-facing, not patient-facing.

**ERNIE Bot Simulated Patient Study (Nature Digital Medicine, 2025)** Used simulated patients to evaluate an AI chatbot across 384 trials in a developing-country context. Closest to our constrained-setting focus, but measures diagnostic accuracy and prescription safety, not escalation behavior.

**MedAgentBench (Stanford/NEJM AI, 2025)** A virtual EHR environment benchmarking medical LLM agents on clinical tasks against a FHIR server. Provider-facing, structured-data, not conversational.

**HAICEF (PMC, 2025)** A 271-question rubric framework for healthcare chatbot evaluation covering safety, trustworthiness, and design. Comprehensive but static — a rubric, not a simulation system.

**Time-to-Inconsistency (2025)** Applies survival analysis to dialogue turns to predict when LLM conversations fail. Closest methodological analog to our statistical harness, but measures conversational coherence, not clinical escalation behavior.

**OIP-SCE (2025)** Shifts dialogue evaluation from turn-level scoring to phase-level compliance audits. Structural and sequential, but not temporal in the dynamic sense. Checks whether phases were completed, not how the agent's behavior evolved.

**MedConsultBench (2025)** Tracks clinical information acquisition at sub-turn granularity. Closest existing work to our information extraction rate metric, but measures diagnostic completeness, not escalation trajectory.

**What none of these do:**

- Model escalation as a temporal trajectory, not just a final outcome
- Apply survival analysis and mixed-effects models to escalation decisions
- Distinguish escalation failure modes: never probed, probed but abandoned, detected but didn't act
- Detect near-misses — correct outcomes with fragile trajectories
- Use communication style variation as the independent variable
- Target deployment readiness rather than academic benchmarking

---

## 3. The Core Problem

Current evaluation methods test whether an agent gives correct answers to clear questions. They do not test whether the agent makes the right escalation decision when a patient is indirect, vague, minimizing, or confusing. And when they do test escalation, they evaluate only the final outcome, not the trajectory that produced it.

The critical failure is simple: a patient needs human help, and the agent doesn't get them there. Or conversely, the agent escalates everything and overwhelms limited human capacity.

**A concrete example:** In a recent study on patient-LLM communication, a patient who said "I have a very bad headache" was told to rest in a dark room. A patient who said "I had the worst headache" was told to go to the emergency room. The second recommendation was correct — the patient had a hemorrhage. The phrasing is semantically almost identical, but the outcomes diverged dramatically. Same condition, different words, different escalation decision.

### The Near-Miss Problem

Binary evaluation treats all correct outcomes the same. But an agent that recognizes severity at turn 2 and escalates at turn 4 is fundamentally different from one that nearly closes the case, catches a red flag at turn 8, and escalates at turn 9.

Both score as true positives. One is a clean decision. The other is a near-miss that would have failed with slightly different phrasing.

> Near-misses are leading indicators. They tell you where the agent will break next.
> 

### Three Failure Modes

When an agent misses an escalation, the failure isn't always the same:

1. **Never probed.** The agent responds to surface-level statements for the entire conversation. It never asks a follow-up question that would reveal severity. Signal detection is broken.
2. **Probed but abandoned.** The agent asks good questions early. The patient deflects. The agent drops the line of inquiry. Signal detection works; persistence doesn't.
3. **Detected but didn't act.** The agent asks the right questions, gets concerning answers, acknowledges them, and still doesn't escalate. Information extraction works; the decision threshold is miscalibrated.

These require completely different engineering fixes. A confusion matrix collapses them into one number.

### Why This Matters Beyond Current Evaluation

Current evaluation methods answer: does the agent get it right? This framework answers three additional questions that current methods cannot:

1. **When** does the agent recognize severity? An agent that recognizes a critical signal at turn 2 vs. turn 12 is behaving very differently, even if both ultimately escalate.
2. **How** does the agent arrive at its decision? Steady convergence toward escalation is reliable. Oscillation followed by a last-moment course correction is fragile.
3. **Why** does the agent fail? Not just that it missed an escalation, but whether it never probed, abandoned a line of inquiry, or detected severity but didn't act.

Current methods give you a score. This framework gives you a diagnostic.

---

## 4. Architecture

The system has two layers. Full detail is in the architecture documentation.

### Integration Surface

`what goes in`

The boundary where external inputs connect. All domain-specific inputs are human-authored. The system does not generate clinical knowledge.

| Input | Required | Provided by |
| --- | --- | --- |
| Agent HTTP endpoint | Yes | Engineering team |
| Escalation rubric | Yes | Clinical advisors |
| Clinical scenarios | Yes | Clinicians |
| Communication profiles | Yes | Deployment team + clinical advisors |
| Prevalence weights | No | Deployment team + clinical advisors |

The rubric is the deployment team's clinical escalation protocol and the single most important input. It defines ground truth. Scenarios are labeled by applying the rubric. The rubric is always deployment-specific.

Validated scenarios and profiles are saved to a shared library that grows across deployments.

> 
> 
> 
> [Integration Surface](https://www.notion.so/Integration-Surface-319f42d22c17804abb31d59ff08f4ceb?pvs=21)
> 

### Execution Layer

`what happens`

What the system does once inputs are in place:

1. **Simulation loop** runs turn-by-turn conversations between an LLM patient simulator and the agent under test.
2. **Evaluation pipeline** processes each conversation through binary evaluation (rule-based), post-conversation analysis (single LLM pass for validation and temporal annotation), and statistical analysis (pure computation).
3. **Data model** defines the quantitative profile recorded per run: binary outcome, temporal features, per-turn annotations, validation result, and conversation trace.

> The system uses two LLM instances: the patient simulator and the post-conversation analyzer. Binary evaluation and statistical analysis are rule-based. No LLM is involved in scoring outcomes.
> 

> 
> 
> 
> [Execution Layer](https://www.notion.so/Execution-Layer-319f42d22c1780229c43e259992340fa?pvs=21)
> 

---

## 5. What the System Produces

Three layers. Each is independently useful.

> Teams can stop at Layer 1 and still get value.
> 

### Layer 1 — Confusion Matrix

`binary · rule-based · no LLM`

Binary escalation accuracy. Verifiable and trustworthy.

**Per conversation:**

- Escalation outcome: correct, missed, or unnecessary
- Full transcript for human review on failures

**Across all runs:**

- Escalation accuracy by communication profile — the key insight
- Escalation accuracy by scenario
- Over-escalation rate
- Failure transcripts grouped by profile and scenario

> This is a risk profile, not a safety certification. It tells you where the agent's blind spots are before real patients find them.
> 

### Layer 2 — Temporal Features

`per-conversation · derived from annotations`

Metrics that capture how the escalation decision unfolded:

- **Signal recognition turn** — when the agent first recognized severity
- **Escalation convergence trajectory** — whether the agent trended toward or away from escalation over time
- **Information extraction rate** — fraction of symptoms disclosed, split into elicited (agent asked) and volunteered (patient offered)
- **Decision commitment turn** — when the agent's direction became deterministic
- **Near-miss flag** — correct outcome but fragile trajectory
- **Failure mode** — for false negatives: never probed, probed but abandoned, or detected but didn't act

> These turn "the agent missed this escalation" into "the agent missed this escalation because it asked about bleeding but abandoned the line of inquiry when the patient deflected."
> 

### Layer 3 — Statistical Harness

`population-level · computational`

Analysis across all runs:

- **Survival curves** — Kaplan-Meier for time-to-escalation by profile
- **Hazard models** — Cox proportional hazards estimating communication style's effect on escalation timing
- **Change-point detection** — when agent behavior meaningfully shifted direction
- **Mixed-effects models** — separating scenario difficulty from communication style effect
- **Weighted failure rates** — if prevalence data is provided

> Produces interpretable findings such as: "indirect communicators experience 2.3x longer time-to-escalation compared to direct communicators, controlling for clinical presentation."
> 

---

## 6. What This Defers

These are real concerns, addressed later once the core works:

- **Scope creep detection** — requires keyword-based heuristics or a flagging layer with human review.
- **Action correctness** — requires an environment layer modeling available services.
- **Environment simulation** — modeling service capacity, eligibility rules, system failures.
- **Adversarial perturbation testing** — targeted search for the exact phrasing that breaks the agent. The temporal layer provides observational data but does not generate adversarial inputs.
- **Causal analysis** — the temporal and statistical layers characterize associations, not causal mechanisms. Causal claims require controlled experiments or instrumented agent internals.

---

## 7. How to Start

> A minimal viable deployment targets one agent, one rubric, and a small set of scenarios.
> 
1. Clinicians write 10 to 15 scenarios with severity labels derived from the rubric.
2. Deployment team writes or approves communication profiles, using framework templates as reference.
3. Engineering team connects the agent via HTTP.
4. Run the scenario x profile matrix.
5. Review Layer 1 results (confusion matrix) first.
6. If failures are found, Layer 2 temporal analysis explains why.
7. If prevalence data is available, Layer 3 estimates deployment risk.

Start narrow. Prove value on escalation accuracy. Expand from there.