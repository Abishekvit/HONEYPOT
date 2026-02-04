/**
 * SENTINEL BACKEND – GUVI HACKATHON 2025 (COMPLIANT)
 * Run with: node server.js
 * package.json must include: "type": "module"
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ================= CONFIG =================
const GEMINI_API_KEY = process.env.API_KEY;
const X_API_KEY = process.env.X_API_KEY || "GUVI_SECRET_2025";

if (!GEMINI_API_KEY) {
  console.error("❌ FATAL: API_KEY not set");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ================= SESSION STORE =================
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

// ================= MAIN HANDLER =================
async function engageHandler(req, res) {
  console.log("🔥 GUVI HIT");
  console.log("Method:", req.method);
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  // ---- API KEY AUTH ----
  if (req.headers["x-api-key"] !== X_API_KEY) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized"
    });
  }

  // ---- HANDSHAKE (GUVI TESTER) ----
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.json({
      status: "success",
      message: "Honeypot endpoint reachable"
    });
  }

  const { sessionId, message, conversationHistory = [] } = req.body;

  if (!sessionId || !message?.text) {
    return res.status(400).json({
      status: "error",
      message: "Invalid request body"
    });
  }

  // ---- PROMPT BUILD ----
  const historyText =
    conversationHistory.length > 0
      ? conversationHistory
          .map(m => `${m.sender}: ${m.text}`)
          .join("\n")
      : "No prior conversation.";

  const prompt = `
SESSION ID: ${sessionId}

CONVERSATION HISTORY:
${historyText}

LATEST MESSAGE:
${message.text}

INSTRUCTIONS:
- Detect scam intent
- Respond like a real human
- Never reveal detection
- Extract scam intelligence
- Decide if engagement is complete
`;

  // ---- LLM CALL ----
  let aiData;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: prompt,
        config: {
          systemInstruction:
            "You are a human user talking to a scammer. Never reveal you are AI.",
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA
        }
      })
    );

    aiData = JSON.parse(response.text);
  } catch (err) {
    console.warn("⚠️ Gemini failed, fallback used");

    aiData = {
      scamDetected: true,
      reply: "Can you explain this more clearly?",
      isEngagementComplete: true,
      extractedIntelligence: {
        bankAccounts: [],
        upiIds: [],
        phishingLinks: [],
        phoneNumbers: [],
        suspiciousKeywords: ["urgent", "verify"]
      },
      agentNotes: "Fallback response due to LLM failure"
    };
  }

  // ---- SESSION MERGE ----
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
    bankAccounts: [...new Set([...prev.intel.bankAccounts, ...aiData.extractedIntelligence.bankAccounts])],
    upiIds: [...new Set([...prev.intel.upiIds, ...aiData.extractedIntelligence.upiIds])],
    phishingLinks: [...new Set([...prev.intel.phishingLinks, ...aiData.extractedIntelligence.phishingLinks])],
    phoneNumbers: [...new Set([...prev.intel.phoneNumbers, ...aiData.extractedIntelligence.phoneNumbers])],
    suspiciousKeywords: [...new Set([...prev.intel.suspiciousKeywords, ...aiData.extractedIntelligence.suspiciousKeywords])]
  };

  const totalMessages = conversationHistory.length + 2;

  sessionStore.set(sessionId, {
    intel: mergedIntel,
    totalMessages,
    callbackSent: prev.callbackSent
  });

  // ---- GUVI CALLBACK ----
  if (aiData.scamDetected && aiData.isEngagementComplete && !prev.callbackSent) {
    sessionStore.get(sessionId).callbackSent = true;
    await sendGuviCallback(sessionId, mergedIntel, totalMessages, aiData.agentNotes);
  }

  return res.json({
    status: "success",
    reply: aiData.reply
  });
}

// ================= ROUTES =================
app.post("/", engageHandler);          // GUVI calls this
app.post("/api/engage", engageHandler); // Optional explicit endpoint

app.get("/", (_, res) => {
  res.send("SENTINEL backend running");
});

// ================= CALLBACK =================
async function sendGuviCallback(sessionId, intel, totalMessages, notes) {
  const payload = {
    sessionId,
    scamDetected: true,
    totalMessagesExchanged: totalMessages,
    extractedIntelligence: intel,
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

    console.log("📤 GUVI callback status:", res.status);
  } catch (err) {
    console.error("❌ Callback failed:", err.message);
  }
}

// ================= START =================
app.listen(port, () => {
  console.log("------------------------------------------------");
  console.log(`🚀 SENTINEL running on port ${port}`);
  console.log(`🔑 API KEY: ${X_API_KEY}`);
  console.log("📡 POST /  (GUVI endpoint)");
  console.log("📡 POST /api/engage");
  console.log("------------------------------------------------");
});
