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

    // ----------------------------------------------------
    // ENGINE A: GROQ (Dynamic Live Model Discovery)
    // ----------------------------------------------------
    if (cleanKey.startsWith('gsk_')) {
      // 1. Fetch currently active models from Groq for this key
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
                !id.includes('8192') // Exclude decommissioned legacy models
            );

          if (validModels.length > 0) {
            // Prioritize Qwen / GPT-OSS / Llama models
            chosenModel =
              validModels.find(
                (id: string) =>
                  id.includes('qwen') || id.includes('gpt-oss') || id.includes('instant')
              ) || validModels[0];
          }
        }
      } catch (e) {
        console.warn('Groq model lookup failed, using safe fallback', e);
      }

      // 2. Clean conversation history (no empty messages, no broken roles)
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

    // ----------------------------------------------------
    // ENGINE B: GOOGLE GEMINI FALLBACK
    // ----------------------------------------------------
    return NextResponse.json(
      { error: 'Please enter a valid Groq API key starting with gsk_' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}