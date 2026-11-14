import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const rawHost = (
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    '127.0.0.1:3000'
  )
    .split(',')[0]
    .trim();

  const safeHost = rawHost.replace(/^localhost(:|$)/, '127.0.0.1$1');
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    (safeHost.startsWith('127.0.0.1') ? 'http' : 'https');

  const res = NextResponse.redirect(`${proto}://${safeHost}/`);
  res.cookies.delete('spotify_session');
  return res;
}