'use client';

import { useState, useEffect, useRef } from 'react';
import { CreateMLCEngine, MLCEngine } from '@mlc-ai/web-llm';
import { Bot, Send, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  intent?: {
    action: string;
    query?: string;
    value?: number;
  };
}

const SYSTEM_PROMPT = `You are TrackDeck Assistant.
Extract the music command from the user request and output strict JSON with this exact shape:
{"reply": "friendly natural response to user", "action": "play" | "pause" | "next" | "prev" | "volume" | "search_play", "query": "artist or song name or empty", "value": number or null}
Never output markdown backticks. Output valid raw JSON only.`;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hey! I am your TrackDeck AI test agent. Tell me to play an artist, skip a track, or change the vibe.',
    },
  ]);
  const [input, setInput] = useState('');
  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
  const [isModelReady, setIsModelReady] = useState(false);
  const [webGpuAvailable, setWebGpuAvailable] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Step 1: Detect WebGPU & Load SmolLM2
  useEffect(() => {
    async function initAI() {
      if (typeof window === 'undefined') return;

      // Fix for TypeScript: Cast navigator as any to allow reading WebGPU
      const nav = navigator as any;

      if (!nav.gpu) {
        setWebGpuAvailable(false);
        setLoadingProgress('WebGPU not supported on this device/browser. Using fast regex rules.');
        return;
      }

      try {
        const adapter = await nav.gpu.requestAdapter();
        if (!adapter) {
          setWebGpuAvailable(false);
          setLoadingProgress('WebGPU adapter unavailable. Using fast regex rules.');
          return;
        }

        setWebGpuAvailable(true);
        setLoadingProgress('Starting model download (~200MB)...');

        const aiEngine = await CreateMLCEngine('SmolLM2-360M-Instruct-q4f16_1-MLC', {
          initProgressCallback: (progress) => {
            setLoadingProgress(progress.text);
          },
        });

        setEngine(aiEngine);
        setIsModelReady(true);
      } catch (err) {
        console.error('AI loading error:', err);
        setWebGpuAvailable(false);
        setLoadingProgress('Model failed to load. Falling back to rule parser.');
      }
    }

    initAI();
  }, []);

  // Quick fallback intent parser if WebGPU is unavailable or loading
  function fallbackParse(text: string) {
    const lower = text.toLowerCase().trim();
    if (/(skip|next)/i.test(lower)) {
      return { reply: 'Skipping track!', action: 'next' };
    }
    if (/(pause|stop)/i.test(lower)) {
      return { reply: 'Paused playback.', action: 'pause' };
    }
    if (/(play|resume)/i.test(lower) && !lower.startsWith('play ')) {
      return { reply: 'Resuming playback.', action: 'play' };
    }
    const playMatch = lower.match(/^play\s+(.+)/i);
    if (playMatch) {
      return { reply: `Searching and queuing "${playMatch[1]}"`, action: 'search_play', query: playMatch[1] };
    }
    const volMatch = lower.match(/volume\s+(\d+)/i);
    if (volMatch) {
      return { reply: `Setting volume to ${volMatch[1]}%`, action: 'volume', value: parseInt(volMatch[1], 10) };
    }
    return {
      reply: `Got your request: "${text}". Ready to map this to Spotify!`,
      action: 'search_play',
      query: text,
    };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setIsProcessing(true);

    try {
      if (engine && isModelReady) {
        const response = await engine.chat.completions.create({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userText },
          ],
          temperature: 0.1,
        });

        const raw = response.choices[0]?.message?.content?.trim() || '{}';
        const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
          const parsed = JSON.parse(clean);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: parsed.reply || 'Understood!',
              intent: { action: parsed.action, query: parsed.query, value: parsed.value },
            },
          ]);
        } catch {
          const fallback = fallbackParse(userText);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: fallback.reply,
              intent: { action: fallback.action, query: fallback.query },
            },
          ]);
        }
      } else {
        const fallback = fallbackParse(userText);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: fallback.reply,
            intent: { action: fallback.action, query: fallback.query, value: fallback.value },
          },
        ]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong parsing that command.' },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="flex flex-col h-screen max-w-2xl mx-auto p-4 justify-between">
      {/* Header & Status Indicator */}
      <header className="border-b border-gray-800 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-green-400" />
          <h1 className="font-bold text-lg tracking-wide">TrackDeck v0.0</h1>
        </div>

        <div className="text-xs flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1 rounded-full">
          {isModelReady ? (
            <span className="flex items-center gap-1.5 text-green-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> WebLLM Active (SmolLM2)
            </span>
          ) : webGpuAvailable === false ? (
            <span className="flex items-center gap-1.5 text-yellow-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5" /> Instant Rules Engine
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-gray-400 animate-pulse">
              {loadingProgress || 'Initializing...'}
            </span>
          )}
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto my-4 space-y-4 pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`p-3 rounded-xl max-w-[85%] text-sm ${
                m.role === 'user'
                  ? 'bg-green-600 text-white rounded-br-none'
                  : 'bg-gray-800 border border-gray-700 text-gray-200 rounded-bl-none'
              }`}
            >
              {m.content}
            </div>

            {/* Action Tag Debugger */}
            {m.intent && (
              <div className="mt-1.5 text-[11px] font-mono bg-black/50 border border-gray-800 text-green-400 px-2 py-0.5 rounded">
                ⚡ Action: <strong>{m.intent.action}</strong>
                {m.intent.query && <span> | Query: "{m.intent.query}"</span>}
                {m.intent.value !== undefined && <span> | Value: {m.intent.value}</span>}
              </div>
            )}
          </div>
        ))}
        {isProcessing && (
          <div className="text-xs text-gray-500 animate-pulse flex items-center gap-2">
            <Bot className="w-3.5 h-3.5" /> Thinking...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-gray-800 pt-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Try: 'skip this song' or 'play some chill synthwave'..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-green-500 text-gray-100"
        />
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded-lg flex items-center justify-center transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </main>
  );
}