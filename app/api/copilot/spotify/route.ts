import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. EXCHANGE AUTH CODE FOR TOKENS (Bypasses School Firewall)
    if (body.type === 'token_exchange') {
      const { code, verifier, clientId, redirectUri } = body;
      if (!code || !verifier || !clientId || !redirectUri) {
        return NextResponse.json({ error: 'Missing exchange parameters' }, { status: 400 });
      }

      const payload = new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
      });

      const tokenData = await tokenRes.json();
      return NextResponse.json(tokenData, { status: tokenRes.status });
    }

    // 2. REFRESH EXPIRED TOKEN (Bypasses School Firewall)
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

      const tokenData = await tokenRes.json();
      return NextResponse.json(tokenData, { status: tokenRes.status });
    }

    // 3. PROXY SPOTIFY WEB API CALL
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
      return new NextResponse(null, { status: 204 });
    }

    const data = await spotifyRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: spotifyRes.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Spotify proxy error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}