import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'TrackDeck Copilot API is live!' });
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, history, apiKey, currentTrackInfo } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key in Settings' }, { status: 400 });
    }

    const cleanKey = apiKey.trim();

    const trackContext = currentTrackInfo
      ? `Now playing: "${currentTrackInfo.name}" by ${currentTrackInfo.artist} (${currentTrackInfo.album}). Status: ${currentTrackInfo.isPlaying ? 'Playing' : 'Paused'}.`
      : `No track is currently playing.`;

    const systemPrompt = `You are TrackDeck Copilot, an elite music assistant and hip-hop/production expert.
Context: ${trackContext}

You MUST reply with a raw JSON object matching this exact schema:
{
  "message": "Your short, knowledgeable 1-2 sentence conversational answer to the user.",
  "command": "play" | "pause" | "next" | "prev" | "queue" | null,
  "query": "clean song or artist name to search on Spotify, or null"
}

Command rules:
- If user wants to hear music (e.g. "play Silly Watch by Uzi", "play some Carti", "put on Drake"): set command="play" and query="Silly Watch Lil Uzi Vert" (or artist name).
- If user wants to queue: set command="queue" and query="song name".
- If user wants to skip: set command="next" and query=null.
- If user wants to pause: set command="pause" and query=null.
- If user wants to resume: set command="play" and query=null.
- If user is just chatting, asking trivia, or asking who produced a song: set command=null and query=null.

Reply with valid JSON only.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(history || []).slice(-4).map((m: { role: string; text: string }) => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.text,
      })),
      { role: 'user', content: prompt },
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}