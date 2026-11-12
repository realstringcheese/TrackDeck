import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/auth/callback`;

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', req.url));
  }

  // Server-to-server exchange using your private Client Secret
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Spotify token exchange failed:', err);
    return NextResponse.redirect(new URL('/?error=token_failed', req.url));
  }

  const data = await tokenRes.json();
  const session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  // Save in an encrypted HTTP-Only cookie (Never accessible to browser scripts / school filters)
  const cookieStore = cookies();
  cookieStore.set('spotify_session', JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 Days
  });

  return NextResponse.redirect(new URL('/', req.url));
}