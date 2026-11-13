'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Music2, Smartphone, LogOut, Disc3 } from 'lucide-react';

export default function HomePage() {
  const [playback, setPlayback] = useState<{
    name: string;
    artist: string;
    albumArt: string;
    isPlaying: boolean;
    device?: string;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Poll server proxy every 2 seconds
  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 2000);
    return () => clearInterval(interval);
  }, []);

  async function fetchNowPlaying() {
    try {
      const res = await fetch('/api/spotify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: '/me/player' }),
      });

      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }

      setIsAuthenticated(true);
      if (res.status === 204) return;

      const data = await res.json();
      if (data && data.item) {
        setPlayback({
          name: data.item.name,
          artist: data.item.artists?.map((a: { name: string }) => a.name).join(', ') || 'Unknown',
          albumArt: data.item.album?.images?.[0]?.url || '',
          isPlaying: Boolean(data.is_playing),
          device: data.device?.name || 'Active Device',
        });
      }
    } catch {
      setIsAuthenticated(false);
    }
  }

  async function sendCommand(endpoint: string, method: string = 'POST', body?: object) {
    if (!isAuthenticated) {
      window.location.href = '/api/auth/login';
      return;
    }

    await fetch('/api/spotify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, method, payload: body }),
    });
    setTimeout(fetchNowPlaying, 400);
  }

  return (
    <div className="h-screen w-screen bg-[#07080b] text-white flex flex-col justify-between font-sans select-none overflow-hidden">
      {/* 1. TOP NAVBAR */}
      <header className="h-12 border-b border-white/10 bg-[#040507]/90 px-6 flex items-center justify-between">
        {/* Left Side Status */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
              <Smartphone className="w-3.5 h-3.5" /> {playback?.device || 'Connected'}
            </span>
          ) : (
            <span className="text-xs text-zinc-500 font-mono bg-white/5 border border-white/10 px-3 py-1 rounded-full">
              Guest Mode (Offline)
            </span>
          )}
        </div>

        {/* Center: Brand */}
        <div className="flex items-center gap-2">
          <Disc3 className="w-4 h-4 text-emerald-500 animate-[spin_10s_linear_infinite]" />
          <h1 className="font-bold text-xs tracking-widest uppercase font-mono">TrackDeck</h1>
        </div>

        {/* Right Side: Auth Action */}
        <div>
          {isAuthenticated ? (
            <a
              href="/api/auth/logout"
              className="text-xs text-zinc-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors p-1.5"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </a>
          ) : (
            <a
              href="/api/auth/login"
              className="px-3.5 py-1 text-xs font-bold rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black transition-all shadow-md flex items-center gap-1"
            >
              <Music2 className="w-3.5 h-3.5 fill-current" />
              <span>Connect Spotify</span>
            </a>
          )}
        </div>
      </header>

      {/* 2. THE LIVING PLAYER DECK (ALWAYS VISIBLE TO EVERYONE) */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-black/60 border border-white/10 p-7 rounded-3xl shadow-2xl backdrop-blur-2xl flex flex-col items-center text-center space-y-4">
          
          {/* Album Cover Showcase */}
          <div className="relative aspect-square w-56 rounded-2xl overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl flex items-center justify-center group">
            {playback?.albumArt ? (
              <img
                src={playback.albumArt}
                alt={playback.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-600 p-4">
                <Music2 className="w-12 h-12 stroke-[1.25] text-zinc-500 animate-pulse" />
                <p className="text-xs text-zinc-400 font-medium">
                  {isAuthenticated ? 'Spotify is Idle' : 'Guest Standby Deck'}
                </p>
              </div>
            )}
          </div>

          {/* Song Title & Artist */}
          <div className="space-y-0.5 px-2 w-full">
            <h2 className="font-bold text-lg truncate tracking-tight text-white">
              {playback?.name || (isAuthenticated ? 'Awaiting Track...' : 'TrackDeck Player')}
            </h2>
            <p className="text-xs font-medium text-zinc-400 truncate">
              {playback?.artist || (isAuthenticated ? 'Play any song on phone' : 'Sign in to stream your music')}
            </p>
          </div>

          {/* Media Playback Controls */}
          <div className="flex items-center justify-center gap-7 pt-2">
            <button
              onClick={() => sendCommand('/me/player/previous')}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
              title="Previous"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={() => sendCommand(playback?.isPlaying ? '/me/player/pause' : '/me/player/play', 'PUT')}
              className="p-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl shadow-xl shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
              title={playback?.isPlaying ? 'Pause' : 'Play'}
            >
              {playback?.isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={() => sendCommand('/me/player/next')}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
              title="Next"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>

          {/* Login prompt inside the card if guest */}
          {!isAuthenticated && (
            <div className="pt-2 border-t border-white/10 w-full">
              <a
                href="/api/auth/login"
                className="w-full py-2 px-3 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center gap-2 transition-all"
              >
                <Music2 className="w-3.5 h-3.5" /> Connect to Control Spotify
              </a>
            </div>
          )}
        </div>
      </main>

      {/* 3. FOOTER */}
      <footer className="h-8 border-t border-white/5 px-6 flex items-center justify-center text-[10px] text-zinc-500 font-mono">
        <span>TrackDeck • Zero-Server Architecture</span>
      </footer>
    </div>
  );
}