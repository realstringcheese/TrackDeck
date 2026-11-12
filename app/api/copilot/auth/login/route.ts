import { NextResponse } from 'next/server';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

export async function GET(req: Request) {
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    show_dialog: 'true', // Forces the Spotify sign-in dialog so it never skips silently
  });

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
}