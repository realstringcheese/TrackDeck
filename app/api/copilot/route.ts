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
    // ENGINE A: GROQ (Active Free Tier Models)
    // ----------------------------------------------------
    if (cleanKey.startsWith('gsk_')) {
      const messages = [
        { role: 'system', content: systemInstruction },
        ...(history || []).slice(-6).map((m: { role: string; text: string }) => ({
          role: m.role === 'model' ? 'assistant' : 'user',
          content: m.text,
        })),
        { role: 'user', content: prompt },
      ];

      // Groq's high-speed free tier models
      const groqModels = [
        'llama-3.1-8b-instant',
        'openai/gpt-oss-20b',
        'llama3-8b-8192',
      ];

      let lastGroqErr = '';

      for (const model of groqModels) {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 300,
          }),
        });

        if (!groqRes.ok) {
          lastGroqErr = await groqRes.text();
          continue;
        }

        const groqData = await groqRes.json();
        const rawText = groqData.choices?.[0]?.message?.content || '';
        if (rawText) {
          return NextResponse.json({ rawText });
        }
      }

      return NextResponse.json({ error: `Groq error: ${lastGroqErr}` }, { status: 500 });
    }

    // ----------------------------------------------------
    // ENGINE B: GOOGLE GEMINI FALLBACK
    // ----------------------------------------------------
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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${cleanKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: conversation,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return NextResponse.json({ error: `Google API Error: ${errText}` }, { status: geminiRes.status });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return NextResponse.json({ rawText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}