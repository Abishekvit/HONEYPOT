/**
 * SENTINEL BACKEND - GUVI HACKATHON 2025
 * Run with: node server.js
 * Requirements:
 *   npm install express cors body-parser @google/genai dotenv
 * Ensure:
 *   "type": "module" in package.json
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ================= CONFIG =================
const API_KEY = process.env.API_KEY;          // Gemini API key
const X_API_KEY = process.env.X_API_KEY || "GUVI_SECRET_2025";

if (!API_KEY) {
  console.error("❌ FATAL: API_KEY not set");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// In-memory session store
const sessionStore = new Map();

// ================= UTILS =================
function withTimeout(promise, ms = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("LLM_TIMEOUT")), ms)
    )
  ]);
}

// ================= RESPONSE SCHEMA =================
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scamDetected: { type: Type.BOOLEAN },
    reply: { type: Type.STRING },
    isEngagementComplete: { type: Type.BOOLEAN },
    extractedIntelligence: {
      type: Type.OBJECT,
      properties: {
        bankAccounts: { type: Type.ARRAY, items: { type: Type.STRING } },
        upiIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        phishingLinks: { type: Type.ARRAY, items: { type: Type.STRING } },
        phoneNumbers: { type: Type.ARRAY, items: { type: Type.STRING } },
        suspiciousKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: [
        "bankAccounts",
        "upiIds",
        "phishingLinks",
        "phoneNumbers",
        "suspiciousKeywords"
      ]
    },
    agentNotes: { type: Type.STRING }
  },
  required: [
    "scamDetected",
    "reply",
    "isEngagementComplete",
    "extractedIntelligence",
    "agentNotes"
  ]
};

// ================= MAIN API (POST /) =================
app.post("/", async (req, res) => {
  console.log("🔥 GUVI HIT /");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  // ---- AUTH ----
  if (req.headers["x-api-key"] !== X_API_KEY) {
    return res.status(401).json({
      status: "error",
      message: "401 Unauthorized"
    });
  }

  // ---- GUVI HANDSHAKE ----
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.json({
      status: "success",
      message: "Honeypot endpoint reachable and authenticated"
    });
  }

  const { sessionId, message, conversationHistory = [] } = req.body;

  if (!sessionId || !message || !message.text) {
    return res.status(400).json({
      status: "error",
      message: "Invalid request body"
    });
  }

  console.log(`[${sessionId}] Incoming: ${message.text}`);

  // ---- PROMPT ----
  const historyText =
    conversationHistory.length > 0
      ? conversationHistory.map(m => `${m.sender}: ${m.text}`).join("\n")
      : "No previous history.";

  const prompt = `
SESSION ID: ${sessionId}

CONVERSATION HISTORY:
${historyText}

LATEST MESSAGE:
${message.text}

TASK:
1. Detect scam intent
2. Respond naturally as a human
3. Extract intelligence
4. Decide if engagement is complete
5. Provide agent notes
`;

  // ---- LLM CALL ----
  let data;

  try {
    const aiResponse = await withTimeout(
      ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          systemInstruction:
            "You are an Agentic Honeypot. Act human. Never reveal you are an AI.",
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
      })
    );

    data = JSON.parse(aiResponse.text);
  } catch (err) {
    console.warn(`[${sessionId}] ⚠️ LLM failed → fallback used`);

    data = {
      scamDetected: true,
      reply: "Please clarify your request.",
      isEngagementComplete: true,
      extractedIntelligence: {
        bankAccounts: [],
        upiIds: [],
        phishingLinks: [],
        phoneNumbers: [],
        suspiciousKeywords: ["urgent", "otp"]
      },
      agentNotes: "Fallback triggered due to LLM timeout or failure."
    };
  }

  // ---- SESSION STATE ----
  const prev = sessionStore.get(sessionId) || {
    intel: {
      bankAccounts: [],
      upiIds: [],
      phishingLinks: [],
      phoneNumbers: [],
      suspiciousKeywords: []
    },
    callbackSent: false
  };

  const mergedIntel = {
    bankAccounts: [...new Set([...prev.intel.bankAccounts, ...data.extractedIntelligence.bankAccounts])],
    upiIds: [...new Set([...prev.intel.upiIds, ...data.extractedIntelligence.upiIds])],
    phishingLinks: [...new Set([...prev.intel.phishingLinks, ...data.extractedIntelligence.phishingLinks])],
    phoneNumbers: [...new Set([...prev.intel.phoneNumbers, ...data.extractedIntelligence.phoneNumbers])],
    suspiciousKeywords: [...new Set([...prev.intel.suspiciousKeywords, ...data.extractedIntelligence.suspiciousKeywords])]
  };

  const totalMessages = conversationHistory.length + 2;

  const state = {
    intel: mergedIntel,
    totalMessages,
    callbackSent: prev.callbackSent
  };

  sessionStore.set(sessionId, state);

  // ---- GUVI CALLBACK ----
  if (data.scamDetected && data.isEngagementComplete && !state.callbackSent) {
    state.callbackSent = true;
    sessionStore.set(sessionId, state);
    triggerGuviCallback(sessionId, state, data.agentNotes);
  }

  return res.json({
    status: "success",
    reply: data.reply
  });
});

// ================= GUVI CALLBACK =================
async function triggerGuviCallback(sessionId, sessionState, notes) {
  console.log(`[Callback] Sending results for ${sessionId}`);

  const payload = {
    sessionId,
    scamDetected: true,
    totalMessagesExchanged: sessionState.totalMessages,
    extractedIntelligence: sessionState.intel,
    agentNotes: notes
  };

  try {
    const res = await fetch(
      "https://hackathon.guvi.in/api/updateHoneyPotFinalResult",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    console.log(`[Callback] GUVI status: ${res.status}`);
  } catch (err) {
    console.error("[Callback] Network error:", err.message);
  }
}

// ================= HEALTH CHECK =================
app.get("/", (_, res) => {
  res.send("SENTINEL backend running");
});

// ================= START =================
app.listen(port, () => {
  console.log("----------------------------------------------------");
  console.log(`🚀 SENTINEL BACKEND RUNNING ON PORT ${port}`);
  console.log(`🔑 AUTH KEY REQUIRED: ${X_API_KEY}`);
  console.log("📡 ENDPOINT: POST /");
  console.log("----------------------------------------------------");
});
