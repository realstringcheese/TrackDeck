'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Sparkles,
  Key,
  LogOut,
  Send,
  ExternalLink,
  Music2,
  Check,
  Disc3,
  Volume2,
  VolumeX,
  Volume1,
  Radio,
  Smartphone,
  Flame,
  Moon,
  Coffee,
  HelpCircle,
} from 'lucide-react';
import { getAccessToken, spotifyFetch, redirectToSpotifyAuth } from '@/lib/spotify';
import { askGemini, ChatMessage } from '@/lib/gemini';

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);

  // Gemini State
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [showGeminiModal, setShowGeminiModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  // Playback State
  const [playback, setPlayback] = useState<{
    name: string;
    artist: string;
    album: string;
    albumArt: string;
    isPlaying: boolean;
    progressMs: number;
    durationMs: number;
    device?: string;
  } | null>(null);

  // Volume State
  const [volume, setVolume] = useState<number>(70);
  const [prevVolume, setPrevVolume] = useState<number>(70);
  const volumeDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Yo! I’m your TrackDeck co-pilot. Ask me anything about your music, ask about samples, or click a vibe chip below to switch up the tracks.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    const savedGeminiKey = localStorage.getItem('gemini_api_key') || '';
    setGeminiKey(savedGeminiKey);
    setKeyInput(savedGeminiKey);

    const savedClientId =
      localStorage.getItem('spotify_client_id') ||
      process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ||
      '';
    setSpotifyClientId(savedClientId);

    getAccessToken().then((token) => {
      if (token) {
        setIsAuthenticated(true);
        fetchNowPlaying();
      } else {
        setIsAuthenticated(false);
        setShowSpotifyModal(true);
      }
    });
  }, []);

  // Poll Spotify playback every 3 seconds for background updates
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchNowPlaying, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Smooth local timer: advance the scrub bar every second without waiting for API
  useEffect(() => {
    if (!playback?.isPlaying) return;
    const timer = setInterval(() => {
      setPlayback((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        const nextProgress = Math.min(prev.durationMs, prev.progressMs + 1000);
        return { ...prev, progressMs: nextProgress };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [playback?.isPlaying]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchNowPlaying() {
    try {
      const data = await spotifyFetch('/me/player');
      if (data && data.item) {
        setPlayback({
          name: data.item.name,
          artist: data.item.artists.map((a: { name: string }) => a.name).join(', '),
          album: data.item.album.name,
          albumArt: data.item.album.images?.[0]?.url || '',
          isPlaying: data.is_playing,
          progressMs: data.progress_ms || 0,
          durationMs: data.item.duration_ms || 1,
          device: data.device?.name || 'Active Device',
        });
        if (typeof data.device?.volume_percent === 'number') {
          setVolume(data.device.volume_percent);
        }
      } else {
        setPlayback(null);
      }
    } catch (e) {
      console.warn('Failed to poll playback', e);
    }
  }

  // --- 0ms INSTANT OPTIMISTIC PLAY/PAUSE ---
  async function togglePlay() {
    if (!playback) return;
    const willPlay = !playback.isPlaying;

    // 1. Instant 0ms visual switch
    setPlayback((prev) => (prev ? { ...prev, isPlaying: willPlay } : null));

    // 2. Background Spotify API call
    try {
      await spotifyFetch(willPlay ? '/me/player/play' : '/me/player/pause', {
        method: 'PUT',
      });
    } catch {
      // Revert if error occurs
      setPlayback((prev) => (prev ? { ...prev, isPlaying: !willPlay } : null));
    }
  }

  // --- RESPONSIVE NEXT / PREV ---
  async function handleNext() {
    setIsSkipping(true);
    try {
      await spotifyFetch('/me/player/next', { method: 'POST' });
      // Double rapid poll so the new song metadata arrives ASAP
      setTimeout(fetchNowPlaying, 250);
      setTimeout(fetchNowPlaying, 900);
    } finally {
      setTimeout(() => setIsSkipping(false), 300);
    }
  }

  async function handlePrev() {
    setIsSkipping(true);
    try {
      await spotifyFetch('/me/player/previous', { method: 'POST' });
      setTimeout(fetchNowPlaying, 250);
      setTimeout(fetchNowPlaying, 900);
    } finally {
      setTimeout(() => setIsSkipping(false), 300);
    }
  }

  // --- CLICK-TO-SEEK PROGRESS BAR ---
  async function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!playback) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newPosMs = Math.floor(ratio * playback.durationMs);

    // Instant local jump
    setPlayback((prev) => (prev ? { ...prev, progressMs: newPosMs } : null));

    // Send seek to Spotify
    await spotifyFetch(`/me/player/seek?position_ms=${newPosMs}`, { method: 'PUT' });
    setTimeout(fetchNowPlaying, 400);
  }

  // --- SMOOTH VOLUME CONTROL WITH DEBOUNCE ---
  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVol = parseInt(e.target.value, 10);
    setVolume(newVol);

    if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);

    // Debounce to prevent flooding Spotify API while dragging
    volumeDebounceTimer.current = setTimeout(async () => {
      await spotifyFetch(`/me/player/volume?volume_percent=${newVol}`, {
        method: 'PUT',
      });
    }, 150);
  }

  async function toggleMute() {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
      await spotifyFetch('/me/player/volume?volume_percent=0', { method: 'PUT' });
    } else {
      const restore = prevVolume || 50;
      setVolume(restore);
      await spotifyFetch(`/me/player/volume?volume_percent=${restore}`, { method: 'PUT' });
    }
  }

  function handleLogout() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expires');
    setIsAuthenticated(false);
    setShowSpotifyModal(true);
  }

  function saveGeminiKey() {
    if (!keyInput.trim()) return;
    localStorage.setItem('gemini_api_key', keyInput.trim());
    setGeminiKey(keyInput.trim());
    setShowGeminiModal(false);
    setMessages((prev) => [
      ...prev,
      {
        role: 'model',
        text: '✨ Gemini Copilot is active! Ask me anything about your music or click a vibe chip below.',
      },
    ]);
  }

  // Chat Execution
  async function sendToGemini(textToSend: string) {
    if (!textToSend.trim() || isAiLoading) return;

    if (!geminiKey) {
      setShowGeminiModal(true);
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: textToSend }]);
    setIsAiLoading(true);

    try {
      const response = await askGemini(textToSend, messages, geminiKey, playback);

      if (response.action) {
        if (response.action.type === 'next') handleNext();
        if (response.action.type === 'pause') {
          setPlayback((p) => (p ? { ...p, isPlaying: false } : null));
          spotifyFetch('/me/player/pause', { method: 'PUT' });
        }
        if (response.action.type === 'play') {
          setPlayback((p) => (p ? { ...p, isPlaying: true } : null));
          spotifyFetch('/me/player/play', { method: 'PUT' });
        }
        if (response.action.type === 'search_play' && response.action.query) {
          const search = await spotifyFetch(
            `/search?q=${encodeURIComponent(response.action.query)}&type=track,playlist&limit=1`
          );
          const uri = search?.tracks?.items?.[0]?.uri || search?.playlists?.items?.[0]?.uri;
          if (uri) {
            await spotifyFetch('/me/player/play', {
              method: 'PUT',
              body: JSON.stringify({ uris: [uri] }),
            });
            setTimeout(fetchNowPlaying, 700);
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: response.reply,
          actionTaken: response.action ? `Action: ${response.action.type}` : undefined,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reaching Gemini';
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: `⚠️ Gemini error: (${msg}). Check your key in Settings.`,
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = chatInput;
    setChatInput('');
    sendToGemini(msg);
  }

  function formatTime(ms: number) {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  const progressPercent = playback
    ? Math.min(100, Math.max(0, (playback.progressMs / playback.durationMs) * 100))
    : 0;

  return (
    <div className="min-h-screen bg-[#07080b] text-zinc-100 flex flex-col justify-between selection:bg-emerald-500/20">
      {/* Dynamic Ambient Background Glow from Album Art */}
      {playback?.albumArt && (
        <div
          className="fixed inset-0 pointer-events-none opacity-20 blur-[140px] transition-all duration-1000 scale-125 z-0"
          style={{
            backgroundImage: `url(${playback.albumArt})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
      )}

      {/* Top Header Navbar */}
      <header className="relative z-10 border-b border-white/[0.06] bg-[#0c0d12]/70 backdrop-blur-xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[1px] shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#0c0d12] rounded-[11px] flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-emerald-400 animate-[spin_10s_linear_infinite]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-sm tracking-wide text-zinc-100">TrackDeck</h1>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-mono px-2 py-0.5 rounded-full border border-emerald-500/20">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <Smartphone className="w-3 h-3 text-zinc-500" />
              {playback?.device || 'Syncing with Spotify...'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGeminiModal(true)}
            className={`text-xs px-3.5 py-1.5 rounded-xl border font-medium transition-all flex items-center gap-2 ${
              geminiKey
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-sm shadow-emerald-500/10 hover:bg-emerald-500/20'
                : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{geminiKey ? 'Gemini 1.5 Active' : 'Setup AI Brain'}</span>
          </button>

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] rounded-xl border border-white/[0.06] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Two-Column Stage */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* LEFT COLUMN: The Deck (Vinyl & Playback Showcase) */}
        <section className="lg:col-span-5 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.08] rounded-3xl p-7 flex flex-col justify-between backdrop-blur-2xl shadow-2xl relative overflow-hidden">
          {/* Subtle Ambient Ring */}
          <div className="absolute -top-24 -left-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between pb-5 border-b border-white/[0.06] mb-6">
              <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-emerald-400" /> Living Player
              </span>

              {/* Animated Equalizer when playing */}
              <div className="flex items-end gap-1 h-3.5">
                <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-300 ${playback?.isPlaying ? 'h-full animate-[bounce_1s_infinite]' : 'h-1 opacity-40'}`} />
                <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-300 ${playback?.isPlaying ? 'h-2/3 animate-[bounce_0.8s_infinite]' : 'h-1 opacity-40'}`} />
                <span className={`w-1 bg-emerald-400 rounded-full transition-all duration-300 ${playback?.isPlaying ? 'h-full animate-[bounce_1.2s_infinite]' : 'h-1 opacity-40'}`} />
              </div>
            </div>

            {/* Glossy Album Card */}
            <div className="relative aspect-square w-full max-w-[300px] mx-auto rounded-2xl overflow-hidden bg-black/60 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] mb-6 group flex items-center justify-center">
              {playback?.albumArt ? (
                <img
                  src={playback.albumArt}
                  alt={playback.name}
                  className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${isSkipping ? 'opacity-60 scale-95' : 'opacity-100'}`}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-zinc-500 p-6 text-center">
                  <Music2 className="w-14 h-14 stroke-[1.25] text-zinc-600 animate-pulse" />
                  <p className="text-xs font-medium text-zinc-400">Spotify is Idle</p>
                  <p className="text-[11px] text-zinc-500">Play any track on your phone to wake up this deck</p>
                </div>
              )}
            </div>

            {/* Track Metadata */}
            <div className="text-center space-y-1 px-4 mb-5">
              <h2 className="font-bold text-xl tracking-tight text-white truncate">
                {playback?.name || 'Awaiting Track...'}
              </h2>
              <p className="text-sm font-medium text-zinc-300 truncate">
                {playback?.artist || 'Ready to spin'}
              </p>
              {playback?.album && (
                <p className="text-xs text-zinc-500 font-medium truncate">{playback.album}</p>
              )}
            </div>

            {/* CLICKABLE Scrub Bar */}
            <div className="space-y-1.5 mb-6">
              <div
                onClick={handleSeek}
                className="w-full bg-white/[0.08] hover:bg-white/[0.12] h-2 rounded-full overflow-hidden cursor-pointer transition-colors relative group"
                title="Click anywhere to jump"
              >
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-[width] duration-150 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-zinc-500">
                <span>{playback ? formatTime(playback.progressMs) : '0:00'}</span>
                <span>{playback ? formatTime(playback.durationMs) : '0:00'}</span>
              </div>
            </div>
          </div>

          <div>
            {/* Media Dock Controls (0ms response) */}
            <div className="flex items-center justify-center gap-6 mb-6">
              <button
                onClick={handlePrev}
                disabled={!playback}
                className="p-3 text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-90 disabled:opacity-30 rounded-2xl transition-all"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                disabled={!playback}
                className="p-5 bg-gradient-to-tr from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-30 text-black rounded-2xl shadow-xl shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95"
              >
                {playback?.isPlaying ? (
                  <Pause className="w-7 h-7 fill-current" />
                ) : (
                  <Play className="w-7 h-7 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={handleNext}
                disabled={!playback}
                className="p-3 text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-90 disabled:opacity-30 rounded-2xl transition-all"
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>
            </div>

            {/* Volume Control Bar */}
            <div className="flex items-center gap-3 bg-black/30 border border-white/[0.06] rounded-2xl px-4 py-2.5">
              <button
                onClick={toggleMute}
                className="text-zinc-400 hover:text-white transition-colors"
                title="Mute / Unmute"
              >
                {volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : volume < 50 ? (
                  <Volume1 className="w-4 h-4 text-zinc-300" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
                className="flex-1 h-1.5 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
              />
              <span className="text-[11px] font-mono text-zinc-400 w-8 text-right">
                {volume}%
              </span>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: AI Music Brain & Chat Terminal */}
        <section className="lg:col-span-7 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.08] rounded-3xl flex flex-col justify-between backdrop-blur-2xl shadow-2xl overflow-hidden min-h-[600px]">
          
          {/* Terminal Header */}
          <div className="px-6 py-4 border-b border-white/[0.06] bg-black/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                Crate-Digger AI Terminal
              </h3>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              {geminiKey ? 'Active Memory Stream' : 'AI Disconnected'}
            </span>
          </div>

          {/* Conversation Feed */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-4 rounded-2xl max-w-[85%] text-xs md:text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-gradient-to-tr from-emerald-500 to-emerald-400 text-black font-semibold rounded-br-none shadow-lg shadow-emerald-500/10'
                      : 'bg-white/[0.04] border border-white/[0.08] text-zinc-200 rounded-bl-none'
                  }`}
                >
                  {m.text}
                </div>
                {m.actionTaken && (
                  <span className="mt-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                    ⚡ {m.actionTaken}
                  </span>
                )}
              </div>
            ))}
            {isAiLoading && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono animate-pulse">
                <Sparkles className="w-4 h-4" />
                Thinking & Analyzing Spotify DNA...
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Vibe Quick-Pick Action Chips */}
          <div className="px-6 py-2.5 border-t border-white/[0.06] bg-black/10 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => sendToGemini('Who produced this track and what samples are used?')}
              className="text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-1.5 rounded-xl text-zinc-300 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <HelpCircle className="w-3 h-3 text-emerald-400" /> Explain this song
            </button>
            <button
              onClick={() => sendToGemini('Play something high focus for studying mathematics')}
              className="text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-1.5 rounded-xl text-zinc-300 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Coffee className="w-3 h-3 text-amber-400" /> Study Focus
            </button>
            <button
              onClick={() => sendToGemini('Switch to some late night moody synthwave or R&B')}
              className="text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-1.5 rounded-xl text-zinc-300 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Moon className="w-3 h-3 text-indigo-400" /> Late Night
            </button>
            <button
              onClick={() => sendToGemini('Skip this track, play high-energy aux classics')}
              className="text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-1.5 rounded-xl text-zinc-300 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Flame className="w-3 h-3 text-rose-400" /> Aux Classics
            </button>
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-white/[0.06] bg-black/30">
            {!geminiKey ? (
              <button
                onClick={() => setShowGeminiModal(true)}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/20 to-emerald-500/10 hover:from-emerald-500/20 hover:to-emerald-500/30 text-emerald-300 rounded-2xl text-xs font-medium border border-emerald-500/30 flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                <Key className="w-4 h-4 text-emerald-400" />
                Activate Free Gemini Key to Enable AI Chat
              </button>
            ) : (
              <form onSubmit={handleFormSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about this track, artist history, or say 'skip'..."
                  className="flex-1 bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isAiLoading || !chatInput.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black p-3 rounded-2xl transition-all shadow-md shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* --- MODAL 1: Connect Spotify --- */}
      {showSpotifyModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1017] border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Disc3 className="w-8 h-8 animate-[spin_8s_linear_infinite]" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Connect TrackDeck</h2>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Connect your Spotify Premium account to control your music wirelessly with custom atmosphere UI.
              </p>
            </div>

            {!process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID && (
              <div className="text-left space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Spotify Client ID
                </label>
                <input
                  type="text"
                  value={spotifyClientId}
                  onChange={(e) => setSpotifyClientId(e.target.value)}
                  placeholder="Paste Spotify Client ID..."
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            )}

            <button
              onClick={() => redirectToSpotifyAuth(spotifyClientId)}
              className="w-full py-3.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-2xl text-xs tracking-wide uppercase transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Music2 className="w-4 h-4 fill-current" />
              Continue with Spotify
            </button>

            <p className="text-[10px] text-zinc-500">
              Zero passwords stored. Communicates directly with Spotify Web API via PKCE.
            </p>
          </div>
        </div>
      )}

      {/* --- MODAL 2: BYOK Gemini Key Setup --- */}
      {showGeminiModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1017] border border-white/10 w-full max-w-lg rounded-3xl p-7 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Unlock Free AI Companion</h3>
              </div>
              <button
                onClick={() => setShowGeminiModal(false)}
                className="text-zinc-500 hover:text-white text-xs p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-zinc-300">
              <p className="text-zinc-400 leading-relaxed">
                TrackDeck uses Google's latest Gemini 1.5 Flash model. It's 100% free with no credit card required.
              </p>

              <div className="bg-black/50 p-4 rounded-2xl border border-white/[0.06] space-y-2 text-zinc-400">
                <p>
                  1. Open{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 underline font-semibold inline-flex items-center gap-1"
                  >
                    Google AI Studio <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
                <p>2. Sign in with your normal Google account.</p>
                <p>3. Click <strong>"Create API key"</strong> and copy it.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-zinc-400">Paste Gemini Key</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/80 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowGeminiModal(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={saveGeminiKey}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Check className="w-4 h-4" /> Save & Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}