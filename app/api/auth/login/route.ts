import { NextRequest, NextResponse } from 'next/server';

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-top-read',
  'user-read-recently-played',
  'user-read-private',
].join(' ');

function getSafeOrigin(req: NextRequest) {
  const rawHost = (
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    '127.0.0.1:3000'
  )
    .split(',')[0]
    .trim();

  const safeHost = rawHost.replace(/^localhost(:|$)/, '127.0.0.1$1');
  const isLocal = safeHost.startsWith('127.0.0.1');
  const proto = (
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    (isLocal ? 'http' : 'https')
  );

  return `${proto}://${safeHost}`;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const origin = getSafeOrigin(req);

  if (!clientId) {
    return NextResponse.redirect(`${origin}/?error=missing_client_id`);
  }

  const redirectUri = `${origin}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    show_dialog: 'true',
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}