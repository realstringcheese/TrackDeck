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
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: GeminiPart[];
    };
  }[];
  error?: {
    message?: string;
  };
}

const VALID_COMMANDS = new Set(['play', 'pause', 'next', 'prev', 'queue']);

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  let body: CopilotRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
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

  // Gemini requires multi-turn history to start with a 'user' role and alternate cleanly
  const cleanHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const msg of rawHistory.slice(-10)) {
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

  // Avoid duplicating the current prompt if the client already appended it to messages
  const lastTurn = cleanHistory[cleanHistory.length - 1];
  if (lastTurn && lastTurn.role === 'user' && lastTurn.parts[0].text === userText) {
    cleanHistory.pop();
  }

  // Ensure the final turn before appending the new user message isn't also 'user'
  if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
    cleanHistory.pop();
  }

  const contents = [
    ...cleanHistory,
    { role: 'user' as const, parts: [{ text: userText }] },
  ];

  const pb = body.playback || body.currentTrackInfo;
  const nowPlayingContext = pb?.name
    ? `Currently ${pb.isPlaying ? 'playing' : 'paused'}: "${pb.name}" by ${pb.artist || 'Unknown Artist'}${pb.album ? ` (Album: ${pb.album})` : ''}.`
    : 'Nothing is currently playing.';

  const systemPrompt = [
    'You are TrackDeck Copilot, a fast, knowledgeable AI music companion and Spotify controller.',
    nowPlayingContext,
    'Rules:',
    '- If the user wants to control playback, set "command" to one of: "play", "pause", "next", "prev", "queue". Otherwise set "command" to "none".',
    '- If "command" is "play" for a specific song/artist or "queue", set "query" to a clean Spotify search query (e.g. "Silly Watch Lil Uzi Vert"). Otherwise set "query" to "".',
    '- For resume/unpause with no specific song requested, set "command" to "play" and "query" to "".',
    '- Keep "message" concise, helpful, and conversational (music trivia, producer/sample facts, recommendations, or quick confirmation).',
  ].join('\n');

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
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
            thinkingConfig: {
              thinkingLevel: 'LOW',
            },
          },
        }),
      }
    );

    const data = (await geminiRes.json()) as GeminiResponse;

    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiRes.status, data);
      return NextResponse.json(
        { error: data?.error?.message || `Gemini API error (${geminiRes.status})` },
        { status: geminiRes.status }
      );
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
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