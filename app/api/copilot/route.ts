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
- RESUMING/UNPAUSING: If user says 'play', 'unpause', 'resume', 'keep playing', set command="play" and query=null. NEVER search for the word 'play' or 'unpause'!
- PLAYING SPECIFIC MUSIC: If user asks for music (e.g. 'play Silly Watch by Uzi', 'play some Carti', 'put on Drake'), set command="play" and query="Silly Watch Lil Uzi Vert".
- QUEUING: set command="queue" and query="song name".
- SKIPPING: set command="next" and query=null.
- PAUSING: set command="pause" and query=null.
- CHATTING/TRIVIA: set command=null and query=null.

Reply with valid JSON only.`;

    let targetModel = 'openai/gpt-oss-120b';

    try {
      const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
      });

      if (modelsRes.ok) {
        const list = await modelsRes.json();
        const available = (list.data || [])
          .map((m: { id: string }) => m.id)
          .filter(
            (id: string) =>
              !id.includes('whisper') &&
              !id.includes('guard') &&
              !id.includes('tts')
          );

        if (available.length > 0) {
          targetModel =
            available.find((id: string) => id.includes('120b')) ||
            available.find((id: string) => id.includes('20b')) ||
            available.find((id: string) => id.includes('qwen')) ||
            available[0];
        }
      }
    } catch {
      targetModel = 'openai/gpt-oss-120b';
    }

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
        model: targetModel,
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