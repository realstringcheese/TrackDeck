import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'TrackDeck Copilot API is live and ready!' });
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, history, apiKey, currentTrackInfo } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key in Settings' }, { status: 400 });
    }

    const cleanKey = apiKey.trim();

    const trackContext = currentTrackInfo
      ? `Current playing track: "${currentTrackInfo.name}" by ${currentTrackInfo.artist} (Album: ${currentTrackInfo.album}). Status: ${currentTrackInfo.isPlaying ? 'Playing' : 'Paused'}.`
      : `No track is currently playing.`;

    const systemInstruction = `You are TrackDeck's AI Music Companion: an elite music nerd and audio production connoisseur with deep knowledge of hip-hop, trap, underground rap (Opium, Rage, Pluggnb), classic vinyl, and electronic music.

You have two jobs:
1. Converse insightfully and concisely about music, beats, sound design, sample origins, and producer credits (e.g. Madlib, Metro Boomin, Pierre Bourne, BNYX, F1LTHY, Brandon Finessin, Star Boy).
2. PLAYBACK CONTROL:
- When the user asks to play music (e.g. 'play some Uzi', 'put on Carti', 'play Drake', 'play One Beer', 'skip this'), ALWAYS immediately append the <<<ACTION>>> tag. 
- DO NOT ask follow-up questions or ask for confirmation—execute immediately!
Format: <<<ACTION:{"type":"next"|"pause"|"play"|"search_play","query":"artist, song, or album name"}>>>

Context:
${trackContext}

Rules:
- Keep answers punchy and knowledgeable (1-2 sentences).
- Never output markdown backticks around the <<<ACTION>>> tag.`;

    if (cleanKey.startsWith('gsk_')) {
      let chosenModel = 'qwen/qwen3.8-27b';

      try {
        const modelsRes = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${cleanKey}` },
        });

        if (modelsRes.ok) {
          const list = await modelsRes.json();
          const validModels = (list.data || [])
            .map((m: { id: string }) => m.id)
            .filter(
              (id: string) =>
                !id.includes('whisper') &&
                !id.includes('tts') &&
                !id.includes('guard') &&
                !id.includes('8192')
            );

          if (validModels.length > 0) {
            chosenModel =
              validModels.find((id: string) => id.includes('120b')) ||
              validModels.find((id: string) => id.includes('qwen3.8')) ||
              validModels.find((id: string) => id.includes('70b')) ||
              validModels[0];
          }
        }
      } catch (e) {
        console.warn('Groq model lookup failed, using fallback', e);
      }

      const cleanMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
        { role: 'system', content: systemInstruction },
      ];

      for (const m of (history || []).slice(-6)) {
        if (!m.text || m.text.includes('TrackDeck Copilot ready')) continue;
        const role = m.role === 'model' ? 'assistant' : 'user';
        if (cleanMessages.length === 1 && role !== 'user') continue;
        cleanMessages.push({ role, content: m.text });
      }

      cleanMessages.push({ role: 'user', content: prompt });

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: cleanMessages,
          temperature: 0.7,
          max_tokens: 300,
        }),
      });

      if (!groqRes.ok) {
        const errText = await groqRes.text();
        return NextResponse.json({ error: `Groq error: ${errText}` }, { status: 500 });
      }

      const groqData = await groqRes.json();
      const rawText = groqData.choices?.[0]?.message?.content || '';
      return NextResponse.json({ rawText });
    }

    return NextResponse.json(
      { error: 'Please enter a valid Groq API key starting with gsk_' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}