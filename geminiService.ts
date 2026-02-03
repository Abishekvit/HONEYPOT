
import { GoogleGenAI, Type } from "@google/genai";
import { HoneyPotRequest, ExtractedIntelligence, Message } from "./types";

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

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}

/**
 * This function should ideally be called from a BACKEND environment (server.js)
 * to avoid CORS issues and satisfy the GUVI server-to-server requirement.
 */
export async function sendFinalCallback(payload: any) {
  // STRICT GUARD: No callback if scam is not detected
  if (!payload.scamDetected) {
    console.log("Callback Aborted: Scam not detected.");
    return { status: "aborted", reason: "Not a scam" };
  }

  try {
    const response = await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    // Treat HTTP 200-299 as success regardless of body
    if (response.ok) {
      return { status: "success", code: response.status };
    } else {
      throw new Error(`GUVI API Error: ${response.status}`);
    }
  } catch (error) {
    console.error("Callback Network Error:", error);
    return { status: "error", message: "Network failure" };
  }
}
