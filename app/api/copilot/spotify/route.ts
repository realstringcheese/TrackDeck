import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('spotify_session')?.value;

  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  let session: { accessToken: string; refreshToken: string; expiresAt: number };
  try {
    session = JSON.parse(sessionCookie);
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // If token is expiring in less than 60s -> Silent Auto-Refresh on Server
  if (Date.now() > session.expiresAt - 60000 && session.refreshToken) {
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      }),
    });

    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      session.accessToken = refreshData.access_token;
      if (refreshData.refresh_token) session.refreshToken = refreshData.refresh_token;
      session.expiresAt = Date.now() + (refreshData.expires_in || 3600) * 1000;

      cookieStore.set('spotify_session', JSON.stringify(session), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    } else {
      cookieStore.delete('spotify_session');
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
  }

  const { endpoint, method = 'GET', payload } = await req.json();
  const spotifyUrl = `https://api.spotify.com/v1${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };
  if (payload && method !== 'GET' && method !== 'HEAD') {
    fetchOptions.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  }

  const spotifyRes = await fetch(spotifyUrl, fetchOptions);

  if (spotifyRes.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await spotifyRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: spotifyRes.status });
}