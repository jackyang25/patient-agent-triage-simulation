import type { ClinicalScenario, CommunicationProfile } from "../types";

export interface SeedMessage {
  role: "patient" | "agent";
  content: string;
}

export interface SeedConversation {
  id: string;
  messages: SeedMessage[];
  metadata?: {
    source?: string;
    deidentified?: boolean;
  };
}

export interface ExtractionResult {
  scenario: ClinicalScenario;
  profile: CommunicationProfile;
}
