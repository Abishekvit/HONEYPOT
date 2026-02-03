
import { GoogleGenAI, Type } from "@google/genai";
import { HoneyPotRequest, ExtractedIntelligence, Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are an advanced Agentic Honey-Pot designed to detect and engage scammers.
Objectives:
1. Detect if the message is a scam.
2. If yes, act as a believable persona (e.g., confused elderly person).
3. Extract: Bank accounts, UPI IDs, phishing links, phone numbers.
4. Determine if the engagement is "complete" (you've extracted enough or they stopped replying).
5. DO NOT reveal you are an AI.
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scamDetected: { type: Type.BOOLEAN },
    reply: { type: Type.STRING },
    isEngagementComplete: { type: Type.BOOLEAN, description: "Set to true if enough intelligence is gathered to stop." },
    extractedIntelligence: {
      type: Type.OBJECT,
      properties: {
        bankAccounts: { type: Type.ARRAY, items: { type: Type.STRING } },
        upiIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        phishingLinks: { type: Type.ARRAY, items: { type: Type.STRING } },
        phoneNumbers: { type: Type.ARRAY, items: { type: Type.STRING } },
        suspiciousKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["bankAccounts", "upiIds", "phishingLinks", "phoneNumbers", "suspiciousKeywords"]
    },
    agentNotes: { type: Type.STRING }
  },
  required: ["scamDetected", "reply", "isEngagementComplete", "extractedIntelligence", "agentNotes"]
};

export async function processHoneyPotMessage(req: HoneyPotRequest) {
  const historyStr = req.conversationHistory
    .map(m => `${m.sender.toUpperCase()}: ${m.text}`)
    .join('\n');
  
  const prompt = `
    Analyze conversation for Session: ${req.sessionId}
    HISTORY:
    ${historyStr || 'None'}
    LATEST: ${req.message.text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      scamDetected: false,
      reply: "I'm sorry, I don't understand. Could you explain more?",
      isEngagementComplete: false,
      extractedIntelligence: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
      agentNotes: "Simulation error."
    };
  }
}

/**
 * MANDATORY CALLBACK MOCK FOR FRONTEND
 */
export async function sendFinalCallback(payload: any) {
  if (!payload.scamDetected) {
    return { status: "error", message: "Scam must be detected to report intelligence." };
  }

  try {
    const response = await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      return { status: "success", message: "Intelligence successfully reported." };
    } else {
      return { status: "error", message: `GUVI Server Error: ${response.status}` };
    }
  } catch (error) {
    return { status: "error", message: "Network error (CORS restriction likely in browser)." };
  }
}
