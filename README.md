
# SENTINEL - Agentic Honey-Pot System

SENTINEL is an AI-driven security engine designed for the GUVI Hackathon. It intercepts fraudulent messages, engages scammers, and reports intelligence server-to-server.

## 🔴 IMPORTANT: FOR HACKATHON EVALUATION

The evaluation platform pings your API directly. **Browser-only solutions will fail** because of CORS and the need for persistent session tracking.

### 1. Setup Backend (Node.js)
1. Initialize project:
   ```bash
   npm init -y
   ```
2. Set `"type": "module"` in your `package.json`.
3. Install required dependencies:
   ```bash
   npm install express cors body-parser @google/genai dotenv
   ```
4. Configure environment: Create a `.env` file or export variables:
   ```bash
   API_KEY=your_gemini_api_key
   X_API_KEY=GUVI_SECRET_2025 # Key used by GUVI evaluator to ping you
   ```
5. Launch:
   ```bash
   node server.js
   ```

### 2. Expose Publicly
Use a tool like **ngrok** to provide a public endpoint to the GUVI platform:
```bash
ngrok http 3000
```
**Submit this URL to GUVI:** `https://<your-ngrok-id>.ngrok-free.app/api/engage`

## 🧩 Callback Logic
The backend (`server.js`) is programmed to **automatically** trigger the `updateHoneyPotFinalResult` callback once the AI agent determines:
1. `scamDetected = true`
2. `isEngagementComplete = true`

This ensures full compliance with the "Mandatory Final Result Callback" rule.
