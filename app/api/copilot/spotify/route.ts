import { NextRequest, NextResponse } from 'next/server';

interface SpotifySession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function getIsHttps(req: NextRequest) {
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    req.nextUrl.protocol.replace(':', '');
  return proto === 'https';
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() || '';
  if (!clientId || !clientSecret || !refreshToken) return null;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Spotify refresh failed:', res.status, errText);
    return { errorStatus: res.status, errText };
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) || refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get('spotify_session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let session: SpotifySession;
  try {
    session = JSON.parse(sessionCookie);
  } catch {
    const res = NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    res.cookies.delete('spotify_session');
    return res;
  }

  let body: { endpoint?: string; method?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { endpoint, method = 'GET', payload } = body;
  if (!endpoint || typeof endpoint !== 'string') {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  const isHttps = getIsHttps(req);
  let refreshedSession: SpotifySession | null = null;

  // Proactive silent refresh if expiring within 60s
  if (Date.now() > session.expiresAt - 60000 && session.refreshToken) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    if (refreshed && 'accessToken' in refreshed) {
      session = refreshed;
      refreshedSession = refreshed;
    } else if (refreshed && refreshed.errorStatus === 400) {
      const res = NextResponse.json({ error: 'Session expired' }, { status: 401 });
      res.cookies.delete('spotify_session');
      return res;
    }
  }

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const spotifyUrl = `https://api.spotify.com/v1${normalizedEndpoint}`;

  const callUpstream = async (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const fetchOptions: RequestInit = { method, headers };

    if (payload !== undefined && method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    }

    return fetch(spotifyUrl, fetchOptions);
  };

  let spotifyRes = await callUpstream(session.accessToken);

  // Reactive retry once if Spotify rejected token with 401
  if (spotifyRes.status === 401 && session.refreshToken) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    if (refreshed && 'accessToken' in refreshed) {
      session = refreshed;
      refreshedSession = refreshed;
      spotifyRes = await callUpstream(session.accessToken);
    } else {
      const res = NextResponse.json({ error: 'Session expired' }, { status: 401 });
      res.cookies.delete('spotify_session');
      return res;
    }
  }

  let res: NextResponse;
  if (spotifyRes.status === 204) {
    res = new NextResponse(null, { status: 204 });
  } else {
    const data = await spotifyRes.json().catch(() => ({}));
    res = NextResponse.json(data, { status: spotifyRes.status });
  }

  if (refreshedSession) {
    res.cookies.set('spotify_session', JSON.stringify(refreshedSession), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return res;
}