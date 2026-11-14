import { NextRequest, NextResponse } from 'next/server';

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

  return { origin: `${proto}://${safeHost}`, isHttps: proto === 'https' };
}

export async function GET(req: NextRequest) {
  const { origin, isHttps } = getSafeOrigin(req);
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim() || '';

  const spotifyError = req.nextUrl.searchParams.get('error');
  if (spotifyError) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(spotifyError)}`);
  }

  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`);
  }

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?error=missing_server_credentials`);
  }

  const redirectUri = `${origin}/api/auth/callback`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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
    const errText = await tokenRes.text();
    console.error('Spotify token exchange failed:', errText);
    return NextResponse.redirect(
      `${origin}/?error=token_failed&detail=${encodeURIComponent(errText.slice(0, 120))}`
    );
  }

  const data = await tokenRes.json();
  const session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  const res = NextResponse.redirect(`${origin}/`);
  res.cookies.set('spotify_session', JSON.stringify(session), {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}