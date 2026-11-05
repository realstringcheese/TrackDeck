// Spotify PKCE & Player Client (100% in-browser)

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

// Generate PKCE code verifier & challenge
export async function redirectToSpotifyAuth(customClientId?: string) {
  const clientId = customClientId || CLIENT_ID || localStorage.getItem('spotify_client_id') || '';
  if (!clientId) {
    throw new Error('Missing Spotify Client ID');
  }
  localStorage.setItem('spotify_client_id', clientId);

  const verifier = generateRandomString(64);
  localStorage.setItem('pkce_verifier', verifier);

  // Spotify PKCE & Player Client (100% in-browser)

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
].join(' ');

// Generate PKCE code verifier & challenge
export async function redirectToSpotifyAuth(customClientId?: string) {
  const clientId = customClientId || CLIENT_ID || localStorage.getItem('spotify_client_id') || '';
  if (!clientId) {
    throw new Error('Missing Spotify Client ID');
  }
  localStorage.setItem('spotify_client_id', clientId);

  const verifier = generateRandomString(64);
  localStorage.setItem('pkce_verifier', verifier);

  const hashed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(hashed);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const challenge = btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const redirectUri = `${window.location.origin}/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleAuthCallback(code: string): Promise<boolean> {
  const verifier = localStorage.getItem('pkce_verifier') || '';
  const clientId = localStorage.getItem('spotify_client_id') || CLIENT_ID;
  const redirectUri = `${window.location.origin}/callback`;

  const payload = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });

  if (!res.ok) return false;
  const data = await res.json();

  localStorage.setItem('spotify_access_token', data.access_token);
  localStorage.setItem('spotify_refresh_token', data.refresh_token);
  localStorage.setItem('spotify_token_expires', (Date.now() + data.expires_in * 1000).toString());
  localStorage.removeItem('pkce_verifier');
  return true;
}

export async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('spotify_access_token');
  const expires = Number(localStorage.getItem('spotify_token_expires') || '0');
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  const clientId = localStorage.getItem('spotify_client_id') || CLIENT_ID;

  if (!token) return null;

  // Auto-refresh if expired
  if (Date.now() > expires - 60000 && refreshToken) {
    const payload = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expires', (Date.now() + data.expires_in * 1000).toString());
      return data.access_token;
    }
  }

  return token;
}

export async function spotifyFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json();
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

  const redirectUri = `${window.location.origin}/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function handleAuthCallback(code: string): Promise<boolean> {
  const verifier = localStorage.getItem('pkce_verifier') || '';
  const clientId = localStorage.getItem('spotify_client_id') || CLIENT_ID;
  const redirectUri = `${window.location.origin}/callback`;

  const payload = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });

  if (!res.ok) return false;
  const data = await res.json();

  localStorage.setItem('spotify_access_token', data.access_token);
  localStorage.setItem('spotify_refresh_token', data.refresh_token);
  localStorage.setItem('spotify_token_expires', (Date.now() + data.expires_in * 1000).toString());
  localStorage.removeItem('pkce_verifier');
  return true;
}

export async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('spotify_access_token');
  const expires = Number(localStorage.getItem('spotify_token_expires') || '0');
  const refreshToken = localStorage.getItem('spotify_refresh_token');
  const clientId = localStorage.getItem('spotify_client_id') || CLIENT_ID;

  if (!token) return null;

  // Auto-refresh if expired
  if (Date.now() > expires - 60000 && refreshToken) {
    const payload = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('spotify_access_token', data.access_token);
      localStorage.setItem('spotify_token_expires', (Date.now() + data.expires_in * 1000).toString());
      return data.access_token;
    }
  }

  return token;
}

export async function spotifyFetch(endpoint: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 204) return null;
  if (!res.ok) return null;
  return res.json();
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (x) => chars[x % chars.length]).join('');
}