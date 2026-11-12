'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Music2, Smartphone, LogOut } from 'lucide-react';

export default function HomePage() {
  const [playback, setPlayback] = useState<{
    name: string;
    artist: string;
    albumArt: string;
    isPlaying: boolean;
    device?: string;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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
        setPlayback(null);
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
    await fetch('/api/spotify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, method, payload: body }),
    });
    setTimeout(fetchNowPlaying, 400);
  }

  return (
    <main className="h-screen w-screen bg-[#07080b] text-white flex flex-col items-center justify-center p-6 select-none font-sans">
      {/* 1. If Logged Out: 1 Clean Button (Zero Input Boxes) */}
      {!isAuthenticated ? (
        <div className="text-center space-y-4 bg-zinc-900/60 p-8 rounded-3xl border border-white/10 max-w-sm w-full shadow-2xl">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
            <Music2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">TrackDeck</h1>
            <p className="text-xs text-zinc-400 mt-1">Connect your Spotify account to test remote phone playback.</p>
          </div>
          <a
            href="/api/auth/login"
            className="w-full py-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold text-xs tracking-wide uppercase rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            Continue with Spotify
          </a>
        </div>
      ) : (
        /* 2. If Logged In: Real-Time Phone Sync Verification */
        <div className="w-full max-w-md bg-zinc-900/60 p-6 rounded-3xl border border-white/10 shadow-2xl text-center space-y-5">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-3 border-b border-white/10">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Smartphone className="w-4 h-4" /> {playback?.device || 'Syncing...'}
            </span>
            <a href="/api/auth/logout" title="Logout" className="hover:text-rose-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </a>
          </div>

          <div className="w-56 h-56 mx-auto rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-xl flex items-center justify-center">
            {playback?.albumArt ? (
              <img src={playback.albumArt} alt={playback.name} className="w-full h-full object-cover" />
            ) : (
              <Music2 className="w-12 h-12 text-zinc-600 animate-pulse" />
            )}
          </div>

          <div>
            <h2 className="font-bold text-lg truncate">{playback?.name || 'Awaiting Track...'}</h2>
            <p className="text-xs text-zinc-400 truncate mt-0.5">{playback?.artist || 'Play any song on phone'}</p>
          </div>

          <div className="flex items-center justify-center gap-6 pt-2">
            <button
              onClick={() => sendCommand('/me/player/previous')}
              className="p-3 text-zinc-400 hover:text-white transition-colors"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={() => sendCommand(playback?.isPlaying ? '/me/player/pause' : '/me/player/play', 'PUT')}
              className="p-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
            >
              {playback?.isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
            </button>
            <button
              onClick={() => sendCommand('/me/player/next')}
              className="p-3 text-zinc-400 hover:text-white transition-colors"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}