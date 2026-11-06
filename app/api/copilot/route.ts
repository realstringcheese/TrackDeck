import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'TrackDeck Copilot API is live and ready!' });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  try {
    const { prompt, history, apiKey, currentTrackInfo } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Gemini API key in Settings' }, { status: 400 });
    }

    const trackContext = currentTrackInfo
      ? `Current playing track: "${currentTrackInfo.name}" by ${currentTrackInfo.artist} (Album: ${currentTrackInfo.album}). Status: ${currentTrackInfo.isPlaying ? 'Playing' : 'Paused'}.`
      : `No track is currently playing.`;

    const systemInstruction = `You are TrackDeck's AI Music Companion. You are an expert music nerd, encyclopedic crate-digger, and friendly co-listener.
You have two jobs:
1. Converse naturally, enthusiastically, and insightfully about music, artists, genres, album histories, production styles, and recommendations.
2. If the user explicitly asks to control playback (e.g. skip, pause, play something, search a song), append a special JSON action tag at the very end of your response formatted exactly like this:
<<<ACTION:{"type":"next"|"pause"|"play"|"search_play","query":"song or artist or empty"}>>>

Context:
${trackContext}

Rules:
- Keep conversational replies concise, stylish, and engaging (1-3 sentences max).
- Never output markdown backticks around the <<<ACTION>>> tag.
- Only include <<<ACTION>>> if the user gave an explicit command to change playback.`;

    // Ensure conversation strictly starts with 'user' and alternates roles
    const conversation: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];

    const rawHistory = Array.isArray(history) ? history : [];
    for (const msg of rawHistory) {
      if (msg.text?.includes('TrackDeck Copilot ready')) continue;
      if (!msg.text?.trim()) continue;

      const role = msg.role === 'model' ? 'model' : 'user';

      if (conversation.length === 0 && role !== 'user') continue;

      if (conversation.length > 0 && conversation[conversation.length - 1].role === role) {
        conversation[conversation.length - 1].parts[0].text += `\n${msg.text}`;
      } else {
        conversation.push({ role, parts: [{ text: msg.text }] });
      }
    }

    if (conversation.length > 0 && conversation[conversation.length - 1].role === 'user') {
      conversation[conversation.length - 1].parts[0].text += `\n${prompt}`;
    } else {
      conversation.push({ role: 'user', parts: [{ text: prompt }] });
    }

    // Models ordered by speed and capacity pool
    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash',
      'gemini-flash-latest',
    ];

    let lastError = '';

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      // Try each model, retrying once if Google reports 503 overload
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey.trim(),
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: conversation,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500,
              },
            }),
          });

          // If model doesn't exist, skip to next model
          if (res.status === 404) break;

          // If Google reports 503 (Overloaded), wait 1 second and retry
          if (res.status === 503) {
            lastError = 'Google model is overloaded. Retrying...';
            await sleep(1000);
            continue;
          }

          if (!res.ok) {
            lastError = await res.text();
            break;
          }

          const data = await res.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawText) {
            return NextResponse.json({ rawText });
          }
        } catch (e: unknown) {
          lastError = e instanceof Error ? e.message : 'Fetch error';
        }
      }
    }

    return NextResponse.json(
      { error: lastError || 'Google servers are currently congested. Please try again in a moment.' },
      { status: 503 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}