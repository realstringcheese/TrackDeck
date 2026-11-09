import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ----------------------------------------------------
    // ACTION A: REFRESH EXPIRED SPOTIFY TOKEN VIA CLOUD
    // (Bypasses school firewall blocking accounts.spotify.com)
    // ----------------------------------------------------
    if (body.type === 'token_refresh') {
      const { clientId, refreshToken } = body;
      if (!clientId || !refreshToken) {
        return NextResponse.json({ error: 'Missing refresh credentials' }, { status: 400 });
      }

      const payload = new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return NextResponse.json({ error: err }, { status: tokenRes.status });
      }

      const tokenData = await tokenRes.json();
      return NextResponse.json(tokenData);
    }

    // ----------------------------------------------------
    // ACTION B: PROXY SPOTIFY WEB API CALL
    // (Bypasses school firewall blocking api.spotify.com)
    // ----------------------------------------------------
    const { endpoint, method = 'GET', payload, token } = body;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const spotifyUrl = `https://api.spotify.com/v1${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (payload && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    }

    const spotifyRes = await fetch(spotifyUrl, fetchOptions);

    if (spotifyRes.status === 204) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (!spotifyRes.ok) {
      const errText = await spotifyRes.text();
      return NextResponse.json({ error: errText }, { status: spotifyRes.status });
    }

    const data = await spotifyRes.json().catch(() => ({}));
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Spotify proxy error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}