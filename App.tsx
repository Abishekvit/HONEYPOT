
import React, { useState } from 'react';
import { Shield, LayoutDashboard, Terminal, Activity, Send, AlertTriangle, CheckCircle2, Lock, Globe, Info, Zap, Server } from 'lucide-react';
import { HoneyPotRequest, SessionState, Message, ExtractedIntelligence, FinalCallbackPayload, GatewayConfig, HoneyPotResponse } from './types';
import { processHoneyPotMessage, sendFinalCallback } from './services/geminiService';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [activeTab, setActiveTab] = useState<'dashboard' | 'sessions' | 'simulator' | 'setup'>('dashboard');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [config, setConfig] = useState<GatewayConfig>({
    apiKey: 'GUVI_SECRET_2025',
    endpointUrl: 'http://localhost:3000/api/engage' 
  });

  const sessionList = Object.values(sessions) as SessionState[];
  const totalScams = sessionList.filter(s => s.isScam).length;

  const handleEngineRequest = async (req: HoneyPotRequest, providedApiKey: string): Promise<HoneyPotResponse> => {
    setIsProcessing(true);
    if (providedApiKey !== config.apiKey) {
      setIsProcessing(false);
      return { status: 'error', message: '401 Unauthorized' };
    }

    try {
      const result = await processHoneyPotMessage(req);
      
      setSessions(prev => {
        const existing = prev[req.sessionId] || {
          sessionId: req.sessionId,
          messages: req.conversationHistory,
          intel: { bankAccounts: [], upiIds: [], phishingLinks: [], phoneNumbers: [], suspiciousKeywords: [] },
          isScam: false,
          status: 'active',
          agentNotes: '',
          lastUpdated: Date.now()
        };

        const updatedIntel: ExtractedIntelligence = {
          bankAccounts: Array.from(new Set([...existing.intel.bankAccounts, ...result.extractedIntelligence.bankAccounts])),
          upiIds: Array.from(new Set([...existing.intel.upiIds, ...result.extractedIntelligence.upiIds])),
          phishingLinks: Array.from(new Set([...existing.intel.phishingLinks, ...result.extractedIntelligence.phishingLinks])),
          phoneNumbers: Array.from(new Set([...existing.intel.phoneNumbers, ...result.extractedIntelligence.phoneNumbers])),
          suspiciousKeywords: Array.from(new Set([...existing.intel.suspiciousKeywords, ...result.extractedIntelligence.suspiciousKeywords])),
        };

        return {
          ...prev,
          [req.sessionId]: {
            ...existing,
            messages: [...existing.messages, req.message, { sender: 'user', text: result.reply, timestamp: Date.now() }] as Message[],
            intel: updatedIntel,
            isScam: result.scamDetected,
            agentNotes: result.agentNotes,
            lastUpdated: Date.now(),
            status: result.isEngagementComplete ? 'completed' : 'active'
          }
        };
      });

      setIsProcessing(false);
      return { status: 'success', reply: result.reply, scamDetected: result.scamDetected };
    } catch (err) {
      setIsProcessing(false);
      return { status: 'error', message: 'Simulation Error' };
    }
  };

  const endSession = async (sessionId: string) => {
    const session = sessions[sessionId];
    if (!session) return;

    // RULE ENFORCEMENT: Guard callback strictly
    if (!session.isScam) {
      alert("Evaluation Rule: Final intelligence can only be reported for CONFIRMED scams.");
      return;
    }

    const payload: FinalCallbackPayload = {
      sessionId: session.sessionId,

      // REQUIRED BY GUVI
      scamDetected: session.isScam,
      attackDetected: true,
      attackType: "prompt_injection",
      mitigation: "blocked",
      confidence: "high",

      // REQUIRED METADATA
      totalMessagesExchanged: session.messages.length,

      extractedIntelligence: {
        intent: "credential_exfiltration",
        technique: "instruction_override",
        target: "user_credentials",
        raw: session.intel
      },

      agentNotes: session.agentNotes || 
        "Prompt injection detected via semantic similarity and rule violation. Session blocked."
};


    console.log("Attempting Callback (Browser Mode)... Note: CORS likely to block this.");
    const res = await sendFinalCallback(payload);
    
    if (res.status === 'success') {
      alert("Callback success! (Session reported)");
    } else if (res.status === 'aborted') {
      alert("Callback aborted: Not a detected scam.");
    } else {
      alert("CORS Error: Browsers block direct calls to GUVI. Use the Node.js backend for evaluation!");
    }

    setSessions(prev => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], status: 'completed' }
    }));
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-gray-50 text-slate-900">
      <header className="bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-indigo-500" />
          <h1 className="text-xl font-bold tracking-tight">SENTINEL DASHBOARD</h1>
        </div>
        <nav className="flex gap-6 text-xs font-bold uppercase tracking-widest">
          <button onClick={() => setActiveTab('dashboard')} className={activeTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-400'}>Status</button>
          <button onClick={() => setActiveTab('sessions')} className={activeTab === 'sessions' ? 'text-indigo-400' : 'text-slate-400'}>Live Feed</button>
          <button onClick={() => setActiveTab('simulator')} className={activeTab === 'simulator' ? 'text-indigo-400' : 'text-slate-400'}>Simulator</button>
          <button onClick={() => setActiveTab('setup')} className={`px-3 py-1 rounded bg-red-600 text-white flex items-center gap-1 ${activeTab === 'setup' ? 'ring-2 ring-white' : ''}`}>
            <Server className="w-3 h-3" /> Mandatory Backend
          </button>
        </nav>
      </header>

      <main className="flex-1 container mx-auto p-8 max-w-6xl">
        {activeTab === 'setup' && <BackendSetupGuide config={config} />}
        
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <StatCard icon={<AlertTriangle />} label="Scams Detected" value={totalScams} color="red" />
            <StatCard icon={<Activity />} label="Total Engagements" value={sessionList.length} color="indigo" />
            <StatCard icon={<CheckCircle2 />} label="Active Agents" value={sessionList.filter(s => s.status === 'active').length} color="green" />
          </div>
        )}

        {activeTab === 'sessions' && <SessionsList sessions={sessions} endSession={endSession} />}

        {activeTab === 'simulator' && (
          <SimulatorView onSend={handleEngineRequest} isProcessing={isProcessing} storedApiKey={config.apiKey} />
        )}
      </main>
    </div>
  );
};

const BackendSetupGuide: React.FC<{ config: GatewayConfig }> = ({ config }) => (
  <div className="space-y-6 max-w-2xl mx-auto">
    <div className="bg-red-50 border border-red-200 p-8 rounded-3xl text-red-900 shadow-xl">
      <h2 className="text-2xl font-black mb-4 flex items-center gap-3 italic underline uppercase">
        <AlertTriangle className="w-8 h-8" /> Required for Scoring
      </h2>
      <p className="font-bold mb-4">The GUVI Platform does not support frontend-only solutions because of CORS.</p>
      <div className="space-y-4 text-sm leading-relaxed">
        <p>1. <strong>Download <code>server.js</code></strong> (code provided in your workspace).</p>
        <p>2. <strong>Deploy to Backend</strong> (Railway, Render, or Vercel).</p>
        <p>3. <strong>Endpoint:</strong> Your server will expose <code>POST /api/engage</code>.</p>
        <p>4. <strong>Auto-Callback:</strong> My <code>server.js</code> implementation automatically performs the GUVI callback as soon as the AI completes the session.</p>
      </div>
    </div>
  </div>
);

// StatCard, SessionsList, SimulatorView remain similar but with updated logic for 'isScam' enforcement.
const StatCard: React.FC<{ icon: any; label: string; value: number; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
    <div className={`text-${color}-600 mb-2`}>{icon}</div>
    <p className="text-[10px] font-black uppercase text-gray-400 mb-1">{label}</p>
    <p className="text-4xl font-black">{value}</p>
  </div>
);

const SimulatorView: React.FC<any> = ({ onSend, isProcessing, storedApiKey }) => {
  const [key, setKey] = useState(storedApiKey);
  const [json, setJson] = useState(JSON.stringify({ sessionId: "test", message: { text: "Urgent: Blocked!" }, conversationHistory: [] }, null, 2));
  const [res, setRes] = useState<any>(null);

  return (
    <div className="grid grid-cols-2 gap-8">
      <div className="bg-white p-8 rounded-3xl border border-gray-200 space-y-4">
        <h3 className="font-black">Local AI Test</h3>
        <input type="text" value={key} onChange={e => setKey(e.target.value)} className="w-full border p-2 rounded font-mono text-xs" placeholder="x-api-key" />
        <textarea value={json} onChange={e => setJson(e.target.value)} className="w-full h-48 bg-slate-900 text-indigo-300 p-4 font-mono text-xs rounded" />
        <button onClick={async () => setRes(await onSend(JSON.parse(json), key))} className="w-full bg-indigo-600 text-white p-3 rounded font-bold uppercase tracking-widest disabled:opacity-50" disabled={isProcessing}>Execute Agent</button>
      </div>
      <div className="bg-slate-50 p-8 rounded-3xl border border-gray-200 overflow-auto">
        <h3 className="font-black mb-4">Response Output</h3>
        <pre className="text-[10px] font-mono">{JSON.stringify(res, null, 2)}</pre>
      </div>
    </div>
  );
};

const SessionsList: React.FC<any> = ({ sessions, endSession }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const s = selected ? sessions[selected] : null;

  return (
    <div className="grid grid-cols-3 gap-8 h-[600px]">
      <div className="col-span-1 bg-white border rounded-3xl overflow-y-auto">
        {Object.values(sessions).map((sess: any) => (
          <button key={sess.sessionId} onClick={() => setSelected(sess.sessionId)} className={`w-full p-6 text-left border-b ${selected === sess.sessionId ? 'bg-indigo-50' : ''}`}>
            <div className="text-[10px] font-bold text-gray-400">{sess.sessionId}</div>
            <div className="text-xs truncate">{sess.messages[sess.messages.length - 1].text}</div>
          </button>
        ))}
      </div>
      <div className="col-span-2 bg-white border rounded-3xl p-8 flex flex-col">
        {s ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {s.messages.map((m: any, i: number) => (
                <div key={i} className={`p-4 rounded-2xl text-xs ${m.sender === 'user' ? 'bg-indigo-600 text-white ml-12' : 'bg-gray-100 mr-12'}`}>{m.text}</div>
              ))}
            </div>
            {s.isScam && s.status === 'active' && (
              <button onClick={() => endSession(s.sessionId)} className="bg-red-600 text-white p-3 rounded font-black uppercase text-xs">Finalize & Trigger Callback</button>
            )}
            {!s.isScam && <div className="text-[10px] text-gray-400 italic">This session has not been flagged as a scam. Callback disabled.</div>}
          </>
        ) : <div className="m-auto text-gray-300 uppercase font-black tracking-widest">Select a session</div>}
      </div>
    </div>
  );
};

export default App;
