
export interface Message {
  sender: 'scammer' | 'user';
  text: string;
  timestamp: number;
}

export interface Metadata {
  channel: string;
  language: string;
  locale: string;
}

export interface HoneyPotRequest {
  sessionId: string;
  message: Message;
  conversationHistory: Message[];
  metadata?: Metadata;
}

export interface ExtractedIntelligence {
  bankAccounts: string[];
  upiIds: string[];
  phishingLinks: string[];
  phoneNumbers: string[];
  suspiciousKeywords: string[];
}

export interface HoneyPotResponse {
  status: 'success' | 'error';
  reply?: string;
  message?: string;
  scamDetected?: boolean;
}

export interface SessionState {
  sessionId: string;
  messages: Message[];
  intel: ExtractedIntelligence;
  isScam: boolean;
  status: 'active' | 'completed' | 'ignored';
  agentNotes: string;
  lastUpdated: number;
}

export interface FinalCallbackPayload {
  sessionId: string;

  scamDetected: boolean;
  attackDetected: boolean;
  attackType: string;
  mitigation: string;
  confidence: "low" | "medium" | "high";

  totalMessagesExchanged: number;

  extractedIntelligence: {
    intent: string;
    technique: string;
    target: string;
    raw: ExtractedIntelligence;
  };

  agentNotes: string;
}


export interface GatewayConfig {
  apiKey: string;
  endpointUrl: string;
}
