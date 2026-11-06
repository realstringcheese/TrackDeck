import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'TrackDeck Copilot API is live and ready!' });
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, history, apiKey, currentTrackInfo } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Gemini API key in Settings' }, { status: 400 });
    }

    const cleanKey = apiKey.trim();

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

    // Format clean conversation history
    const formattedMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemInstruction },
    ];

    const rawHistory = Array.isArray(history) ? history : [];
    for (const msg of rawHistory.slice(-6)) {
      if (msg.text?.includes('TrackDeck Copilot ready')) continue;
      if (!msg.text?.trim()) continue;
      formattedMessages.push({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.text,
      });
    }

    formattedMessages.push({
      role: 'user',
      content: prompt,
    });

    const modelsToTry = [
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ];

    let lastError = '';

    for (const model of modelsToTry) {
      // 10-second abort controller so Vercel never hangs on 504
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const res = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${cleanKey}`,
            },
            body: JSON.stringify({
              model,
              messages: formattedMessages,
              max_tokens: 300,
              temperature: 0.7,
            }),
          }
        );

        clearTimeout(timeoutId);

        if (!res.ok) {
          lastError = await res.text();
          continue;
        }

        const data = await res.json();
        const rawText = data.choices?.[0]?.message?.content || '';
        if (rawText) {
          return NextResponse.json({ rawText });
        }
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        lastError = err instanceof Error ? err.message : 'Request timeout';
      }
    }

    return NextResponse.json(
      { error: `Google API Error: ${lastError}` },
      { status: 500 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}