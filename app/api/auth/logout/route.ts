import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  const cookieStore = cookies();
  cookieStore.delete('spotify_session');
  return NextResponse.redirect(new URL('/', req.url));
}