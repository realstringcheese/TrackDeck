import { NextRequest, NextResponse } from 'next/server';

function isAllowedHost(hostname: string) {
  return (
    hostname === 'scdn.co' ||
    hostname.endsWith('.scdn.co') ||
    hostname.endsWith('.spotifycdn.com') ||
    hostname === 'images.unsplash.com'
  );
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url');
  if (!rawUrl) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (parsed.protocol !== 'https:' || !isAllowedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const upstream = await fetch(parsed.toString());
    if (!upstream.ok) {
      return new NextResponse(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}