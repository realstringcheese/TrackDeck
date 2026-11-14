import { NextRequest, NextResponse } from 'next/server';

type CopilotCommand = 'play' | 'pause' | 'next' | 'prev' | 'queue' | null;

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface PlaybackContext {
  name?: string;
  artist?: string;
  album?: string;
  isPlaying?: boolean;
}

interface CopilotRequestBody {
  prompt?: string;
  message?: string;
  text?: string;
  history?: ChatMessage[];
  messages?: ChatMessage[];
  playback?: PlaybackContext | null;
  currentTrackInfo?: PlaybackContext | null;
  customApiKey?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

const VALID_COMMANDS = new Set(['play', 'pause', 'next', 'prev', 'queue']);

export async function GET() {
  const hasServerKey = Boolean(process.env.GEMINI_API_KEY?.trim());
  return NextResponse.json({ hasServerKey });
}

async function callGeminiModel(
  model: string,
  apiKey: string,
  payload: object,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  let body: CopilotRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const apiKey = body.customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Gemini API key detected. Add one in Settings or Vercel env vars.' },
      { status: 400 }
    );
  }

  const userText = (body.prompt || body.message || body.text || '').trim();
  if (!userText) {
    return NextResponse.json({ error: 'Empty prompt' }, { status: 400 });
  }

  const rawHistory = Array.isArray(body.history)
    ? body.history
    : Array.isArray(body.messages)
    ? body.messages
    : [];

  const cleanHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const msg of rawHistory.slice(-8)) {
    if (!msg?.text?.trim()) continue;
    const role: 'user' | 'model' = msg.role === 'user' ? 'user' : 'model';
    if (cleanHistory.length === 0 && role === 'model') continue;

    const last = cleanHistory[cleanHistory.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n${msg.text.trim()}`;
    } else {
      cleanHistory.push({ role, parts: [{ text: msg.text.trim() }] });
    }
  }

  if (
    cleanHistory.length > 0 &&
    cleanHistory[cleanHistory.length - 1].role === 'user'
  ) {
    cleanHistory.pop();
  }

  const pb = body.playback || body.currentTrackInfo;
  const nowPlayingContext = pb?.name
    ? `Currently ${pb.isPlaying ? 'playing' : 'paused'}: "${pb.name}" by ${pb.artist || 'Unknown Artist'}${pb.album ? ` (Album: ${pb.album})` : ''}.`
    : 'Nothing is currently playing.';

  const systemPrompt = [
    'You are TrackDeck Copilot, a fast AI music companion and Spotify controller.',
    nowPlayingContext,
    'Rules:',
    '- If the user wants to control playback, set "command" to "play", "pause", "next", "prev", or "queue". Otherwise set "command" to "none".',
    '- If "command" is "play" for a specific track/artist or "queue", set "query" to a clean Spotify search query. Otherwise set "query" to "".',
    '- For resume/unpause with no specific song, set "command" to "play" and "query" to "".',
    '- Keep "message" concise and conversational.',
  ].join('\n');

  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [...cleanHistory, { role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          message: { type: 'STRING' },
          command: {
            type: 'STRING',
            enum: ['play', 'pause', 'next', 'prev', 'queue', 'none'],
          },
          query: { type: 'STRING' },
        },
        required: ['message', 'command', 'query'],
      },
      thinkingConfig: { thinkingLevel: 'LOW' },
    },
  };

  try {
    let result: { ok: boolean; status: number; data: GeminiResponse };
    try {
      result = await callGeminiModel('gemini-3.8-flash', apiKey, payload, 5500);
    } catch {
      result = { ok: false, status: 504, data: {} };
    }

    if (
      !result.ok &&
      (result.status === 504 ||
        result.status === 503 ||
        result.status === 429 ||
        result.status === 404)
    ) {
      result = await callGeminiModel('gemini-3.5-flash-lite', apiKey, payload, 4000);
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.data?.error?.message || `Gemini API error (${result.status})` },
        { status: result.status || 500 }
      );
    }

    const rawText = result.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanedJson = rawText.replace(/^```json\s*|\s*```$/g, '').trim();

    let parsed: { message?: string; command?: string; query?: string } = {};
    try {
      parsed = JSON.parse(cleanedJson);
    } catch {
      parsed = { message: rawText, command: 'none', query: '' };
    }

    const normalizedCommand: CopilotCommand =
      parsed.command && VALID_COMMANDS.has(parsed.command)
        ? (parsed.command as CopilotCommand)
        : null;

    const normalizedQuery =
      parsed.query && parsed.query.trim().length > 0 ? parsed.query.trim() : null;

    return NextResponse.json({
      message: parsed.message?.trim() || 'Done.',
      command: normalizedCommand,
      query: normalizedQuery,
    });
  } catch (err) {
    console.error('Copilot route failure:', err);
    return NextResponse.json({ error: 'Failed to reach Gemini API' }, { status: 500 });
  }
}