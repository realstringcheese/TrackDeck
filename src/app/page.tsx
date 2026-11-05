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
  } | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Hey! Connect your Google Gemini key below and we can chat about what you are listening to, or tell me to switch up the music.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Initial load checks
  useEffect(() => {
    const savedGeminiKey = localStorage.getItem('gemini_api_key') || '';
    setGeminiKey(savedGeminiKey);
    setKeyInput(savedGeminiKey);

    const savedClientId = localStorage.getItem('spotify_client_id') || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
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

  // Poll Spotify playback every 4 seconds
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchNowPlaying, 4000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchNowPlaying() {
    try {
      const data = await spotifyFetch('/me/player/currently-playing');
      if (data && data.item) {
        setPlayback({
          name: data.item.name,
          artist: data.item.artists.map((a: { name: string }) => a.name).join(', '),
          album: data.item.album.name,
          albumArt: data.item.album.images?.[0]?.url || '',
          isPlaying: data.is_playing,
        });
      } else {
        setPlayback(null);
      }
    } catch (e) {
      console.warn('Failed to poll playback', e);
    }
  }

  // Playback Handlers
  async function togglePlay() {
    if (!playback) return;
    if (playback.isPlaying) {
      await spotifyFetch('/me/player/pause', { method: 'PUT' });
      setPlayback((prev) => (prev ? { ...prev, isPlaying: false } : null));
    } else {
      await spotifyFetch('/me/player/play', { method: 'PUT' });
      setPlayback((prev) => (prev ? { ...prev, isPlaying: true } : null));
    }
  }

  async function handleNext() {
    await spotifyFetch('/me/player/next', { method: 'POST' });
    setTimeout(fetchNowPlaying, 600);
  }

  async function handlePrev() {
    await spotifyFetch('/me/player/previous', { method: 'POST' });
    setTimeout(fetchNowPlaying, 600);
  }

  function handleLogout() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expires');
    setIsAuthenticated(false);
    setShowSpotifyModal(true);
  }

  // Gemini Key Save
  function saveGeminiKey() {
    if (!keyInput.trim()) return;
    localStorage.setItem('gemini_api_key', keyInput.trim());
    setGeminiKey(keyInput.trim());
    setShowGeminiModal(false);
    setMessages((prev) => [
      ...prev,
      {
        role: 'model',
        text: '✨ Gemini Copilot is connected! Ask me about this track, artist trivia, or tell me what vibe you want next.',
      },
    ]);
  }

  // Chat Execution
  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || isAiLoading) return;

    if (!geminiKey) {
      setShowGeminiModal(true);
      return;
    }

    const text = chatInput.trim();
    setChatInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setIsAiLoading(true);

    try {
      const response = await askGemini(text, messages, geminiKey, playback);

      // Execute extracted action if Gemini sent one
      if (response.action) {
        if (response.action.type === 'next') handleNext();
        if (response.action.type === 'pause') spotifyFetch('/me/player/pause', { method: 'PUT' });
        if (response.action.type === 'play') spotifyFetch('/me/player/play', { method: 'PUT' });
        if (response.action.type === 'search_play' && response.action.query) {
          const search = await spotifyFetch(`/search?q=${encodeURIComponent(response.action.query)}&type=track,playlist&limit=1`);
          const uri = search?.tracks?.items?.[0]?.uri || search?.playlists?.items?.[0]?.uri;
          if (uri) {
            await spotifyFetch('/me/player/play', {
              method: 'PUT',
              body: JSON.stringify({ uris: [uri] }),
            });
            setTimeout(fetchNowPlaying, 800);
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: response.reply,
          actionTaken: response.action ? `Executed: ${response.action.type}` : undefined,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reaching Gemini';
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: `⚠️ Could not reach Gemini. Please check your API key in Settings. (${msg})`,
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-[#0d0f15]/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Disc3 className="w-4 h-4 animate-[spin_8s_linear_infinite]" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-tight text-zinc-100">TrackDeck</h1>
            <p className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase">Zero-Cost AI Controller</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Gemini AI Status / Key Button */}
          <button
            onClick={() => setShowGeminiModal(true)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${
              geminiKey
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>{geminiKey ? 'Gemini Active' : 'Connect AI (Free)'}</span>
          </button>

          {/* Spotify Status & Logout */}
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              title="Disconnect Spotify"
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Dashboard Canvas */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Player Widget */}
        <section className="md:col-span-5 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 backdrop-blur-sm flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800/50 mb-6">
              <span className="text-xs font-mono uppercase text-zinc-500 tracking-wider">Now Playing</span>
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Spotify Connect
              </span>
            </div>

            {/* Album Art Showcase */}
            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800/80 mb-6 flex items-center justify-center group shadow-2xl">
              {playback?.albumArt ? (
                <img
                  src={playback.albumArt}
                  alt={playback.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-600">
                  <Music2 className="w-12 h-12 stroke-[1.25]" />
                  <span className="text-xs">No active playback</span>
                </div>
              )}
            </div>

            {/* Track Info */}
            <div className="space-y-1 mb-6 text-center">
              <h2 className="font-semibold text-lg text-zinc-100 truncate">
                {playback?.name || 'No song playing'}
              </h2>
              <p className="text-sm text-zinc-400 truncate">
                {playback?.artist || 'Open Spotify on your phone or PC to begin'}
              </p>
              {playback?.album && (
                <p className="text-[11px] text-zinc-600 truncate">{playback.album}</p>
              )}
            </div>
          </div>

          {/* Media Controls */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              onClick={handlePrev}
              disabled={!playback}
              className="p-3 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800/60 rounded-full transition-all"
            >
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              disabled={!playback}
              className="p-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-black rounded-full shadow-lg shadow-emerald-500/20 transition-all hover:scale-105 active:scale-95"
            >
              {playback?.isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current ml-0.5" />
              )}
            </button>
            <button
              onClick={handleNext}
              disabled={!playback}
              className="p-3 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 hover:bg-zinc-800/60 rounded-full transition-all"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>
        </section>

        {/* Right Column: AI Conversation Companion */}
        <section className="md:col-span-7 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl flex flex-col h-[560px] shadow-xl overflow-hidden">
          {/* AI Header */}
          <div className="px-5 py-4 border-b border-zinc-800/70 flex items-center justify-between bg-zinc-900/30">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-zinc-200">Music Companion</h3>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              {geminiKey ? 'Gemini 1.5 Flash' : 'AI Offline'}
            </span>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-3.5 rounded-2xl max-w-[85%] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-emerald-500 text-black font-medium rounded-br-none shadow-md shadow-emerald-500/10'
                      : 'bg-zinc-800/70 border border-zinc-700/50 text-zinc-200 rounded-bl-none'
                  }`}
                >
                  {m.text}
                </div>
                {m.actionTaken && (
                  <span className="mt-1 text-[10px] font-mono text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    ⚡ {m.actionTaken}
                  </span>
                )}
              </div>
            ))}
            {isAiLoading && (
              <div className="flex items-center gap-2 text-zinc-500 text-xs animate-pulse">
                <Sparkles className="w-3.5 h-3.5" />
                Thinking...
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-zinc-800/70 bg-zinc-900/30">
            {!geminiKey ? (
              <button
                onClick={() => setShowGeminiModal(true)}
                className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium border border-zinc-700/60 flex items-center justify-center gap-2 transition-all"
              >
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                Connect your Free Gemini API Key to Chat
              </button>
            ) : (
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about this track, artist trivia, or say 'skip'..."
                  className="flex-1 bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isAiLoading || !chatInput.trim()}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black p-2.5 rounded-xl transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* --- MODAL 1: Connect Spotify (Shown if unauthenticated) --- */}
      {showSpotifyModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101218] border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl text-center space-y-5">
            <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl mx-auto flex items-center justify-center">
              <Disc3 className="w-6 h-6 animate-[spin_10s_linear_infinite]" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Connect to TrackDeck</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Log in with Spotify to enable wireless playback controls and personalized music conversations.
              </p>
            </div>

            {/* Optional Spotify Client ID input if not in ENV */}
            {!process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID && (
              <div className="text-left space-y-1">
                <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Spotify Client ID
                </label>
                <input
                  type="text"
                  value={spotifyClientId}
                  onChange={(e) => setSpotifyClientId(e.target.value)}
                  placeholder="Paste your Spotify Client ID..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <button
              onClick={() => redirectToSpotifyAuth(spotifyClientId)}
              className="w-full py-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2"
            >
              <Music2 className="w-4 h-4 fill-current" />
              Continue with Spotify
            </button>

            <p className="text-[11px] text-zinc-600">
              Requires Spotify Premium for remote playback control. No passwords stored.
            </p>
          </div>
        </div>
      )}

      {/* --- MODAL 2: BYOK Gemini Key Setup --- */}
      {showGeminiModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101218] border border-zinc-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-zinc-100">Connect Google Gemini (Free)</h3>
              </div>
              <button
                onClick={() => setShowGeminiModal(false)}
                className="text-zinc-500 hover:text-zinc-300 text-xs"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p className="text-zinc-400">
                To keep TrackDeck 100% free with unlimited scale, you use your own personal Google Gemini key. No credit card is required.
              </p>

              <ol className="list-decimal list-inside space-y-2 bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800/70 text-zinc-400">
                <li>
                  Open{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    Google AI Studio <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  and sign in with your Google account.
                </li>
                <li>Click the blue <strong>"Create API key"</strong> button.</li>
                <li>Copy and paste your key below:</li>
              </ol>

              <div className="space-y-1 pt-1">
                <label className="text-[11px] font-mono uppercase text-zinc-500">Gemini API Key</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/70 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowGeminiModal(false)}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={saveGeminiKey}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
              >
                <Check className="w-3.5 h-3.5" /> Save & Activate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}