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
  ListPlus,
  ArrowLeft,
  Settings,
  User,
  Sun,
  Moon,
  RefreshCw,
  X,
} from 'lucide-react';
import { getAccessToken, spotifyFetch, redirectToSpotifyAuth, SpotifyAPI } from '@/lib/spotify';
import { askGemini, ChatMessage } from '@/lib/gemini';

interface Playlist {
  id: string;
  name: string;
  images?: { url: string }[];
  tracks?: { total: number };
  uri: string;
}

interface TrackItem {
  id: string;
  name: string;
  artists?: { name: string }[];
  album?: { name: string; images?: { url: string }[] };
  duration_ms: number;
  uri: string;
}

export default function HomePage() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Gemini State
  const [geminiKey, setGeminiKey] = useState<string>('');
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
    lastSyncTime: number;
  } | null>(null);

  const isActionPending = useRef(false);

  // Playlists (Left Wing)
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);

  // Queue (Right Wing)
  const [queue, setQueue] = useState<TrackItem[]>([]);

  // AI Chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'TrackDeck Copilot ready. Ask anything about this track, artist history, or tell me what to queue.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load & Theme Hydration
  useEffect(() => {
    const savedTheme = (localStorage.getItem('trackdeck_theme') as 'dark' | 'light') || 'dark';
    setTheme(savedTheme);

    const savedGeminiKey = localStorage.getItem('gemini_api_key') || '';
    setGeminiKey(savedGeminiKey);
    setKeyInput(savedGeminiKey);

    const savedClientId =
      localStorage.getItem('spotify_client_id') ||
      process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ||
      '';
    setSpotifyClientId(savedClientId);

    const cached = localStorage.getItem('trackdeck_cached_track');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setPlayback({ ...parsed, isPlaying: false, lastSyncTime: Date.now() });
      } catch {}
    }

    getAccessToken().then((token) => {
      if (token) {
        setIsAuthenticated(true);
        fetchNowPlaying();
        loadPlaylists();
        loadQueue();
      } else {
        setIsAuthenticated(false);
        setShowSpotifyModal(true);
      }
    });
  }, []);

  function toggleTheme(newTheme: 'dark' | 'light') {
    setTheme(newTheme);
    localStorage.setItem('trackdeck_theme', newTheme);
  }

  // 2. Real-Time Sync Polling (Every 1.5s)
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchNowPlaying, 1500);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Periodic Queue Refresh (Every 12s)
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(loadQueue, 12000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // 3. Smooth Sub-Second Scrub Ticking
  useEffect(() => {
    if (!playback?.isPlaying) return;
    const timer = setInterval(() => {
      setPlayback((prev) => {
        if (!prev || !prev.isPlaying) return prev;
        const elapsed = Date.now() - prev.lastSyncTime;
        const currentProgress = Math.min(prev.durationMs, prev.progressMs + elapsed);
        return {
          ...prev,
          progressMs: currentProgress,
          lastSyncTime: Date.now(),
        };
      });
    }, 500);
    return () => clearInterval(timer);
  }, [playback?.isPlaying]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Safe Spotify Data Loaders
  async function loadPlaylists() {
    try {
      const data = await SpotifyAPI.getPlaylists();
      if (data?.items && Array.isArray(data.items)) {
        // Filter out null or broken items
        setPlaylists(data.items.filter(Boolean));
      }
    } catch (e) {
      console.warn('Failed to load playlists', e);
    }
  }

  async function loadQueue() {
    try {
      const data = await SpotifyAPI.getQueue();
      if (data?.queue && Array.isArray(data.queue)) {
        // Filter out null or broken items
        setQueue(data.queue.filter(Boolean).slice(0, 15));
      }
    } catch (e) {
      console.warn('Failed to load queue', e);
    }
  }

  async function openPlaylistInspector(playlist: Playlist) {
    if (!playlist?.id) return;
    setSelectedPlaylist(playlist);
    setIsLoadingTracks(true);
    try {
      const data = await SpotifyAPI.getPlaylistTracks(playlist.id);
      if (data?.items && Array.isArray(data.items)) {
        setPlaylistTracks(
          data.items
            .map((item: { track?: TrackItem }) => item?.track)
            .filter((t: TrackItem | null | undefined): t is TrackItem => Boolean(t && t.id && t.name))
        );
      }
    } catch (e) {
      console.warn('Failed to load playlist tracks', e);
    } finally {
      setIsLoadingTracks(false);
    }
  }

  async function fetchNowPlaying() {
    if (isActionPending.current) return;
    try {
      const data = await spotifyFetch('/me/player');
      if (data && data.item) {
        const isPlaying = Boolean(data.is_playing);
        const serverProgress = data.progress_ms || 0;

        // Safe artist extraction (handles podcasts/episodes without artists array)
        const artistName = Array.isArray(data.item.artists)
          ? data.item.artists.map((a: { name: string }) => a?.name).filter(Boolean).join(', ')
          : data.item.show?.name || 'Unknown Artist';

        const albumName = data.item.album?.name || data.item.show?.name || '';
        const albumCover =
          data.item.album?.images?.[0]?.url || data.item.show?.images?.[0]?.url || '';

        setPlayback((prev) => {
          const sameTrack = prev?.name === data.item.name;
          const sameState = prev?.isPlaying === isPlaying;

          if (sameTrack && sameState && prev) {
            const drift = Math.abs(prev.progressMs - serverProgress);
            return {
              ...prev,
              isPlaying,
              progressMs: drift > 1500 ? serverProgress : prev.progressMs,
              lastSyncTime: Date.now(),
              device: data.device?.name || prev.device,
            };
          }

          const fresh = {
            name: data.item.name || 'Unknown Track',
            artist: artistName,
            album: albumName,
            albumArt: albumCover,
            isPlaying,
            progressMs: serverProgress,
            durationMs: data.item.duration_ms || 1,
            device: data.device?.name || 'Active Device',
            lastSyncTime: Date.now(),
          };
          localStorage.setItem('trackdeck_cached_track', JSON.stringify(fresh));
          return fresh;
        });
      } else {
        setPlayback((prev) => (prev ? { ...prev, isPlaying: false } : null));
      }
    } catch (e) {
      console.warn('Sync poll error', e);
    }
  }

  // Media Controls
  async function togglePlay() {
    if (!playback) return;
    const targetState = !playback.isPlaying;
    isActionPending.current = true;
    setPlayback((prev) => (prev ? { ...prev, isPlaying: targetState, lastSyncTime: Date.now() } : null));

    try {
      await spotifyFetch(targetState ? '/me/player/play' : '/me/player/pause', { method: 'PUT' });
    } finally {
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
      }, 400);
    }
  }

  async function handleNext() {
    isActionPending.current = true;
    try {
      await spotifyFetch('/me/player/next', { method: 'POST' });
    } finally {
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
        loadQueue();
      }, 500);
    }
  }

  async function handlePrev() {
    isActionPending.current = true;
    try {
      await spotifyFetch('/me/player/previous', { method: 'POST' });
    } finally {
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
      }, 500);
    }
  }

  async function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!playback) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newPosMs = Math.floor(ratio * playback.durationMs);

    isActionPending.current = true;
    setPlayback((prev) => (prev ? { ...prev, progressMs: newPosMs, lastSyncTime: Date.now() } : null));

    try {
      await spotifyFetch(`/me/player/seek?position_ms=${newPosMs}`, { method: 'PUT' });
    } finally {
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
      }, 500);
    }
  }

  async function handlePlayTrack(trackUri: string) {
    if (!trackUri) return;
    await SpotifyAPI.playUri(undefined, [trackUri]);
    setTimeout(() => {
      fetchNowPlaying();
      loadQueue();
    }, 600);
  }

  async function handleAddToQueue(track: TrackItem) {
    if (!track?.uri) return;
    await SpotifyAPI.addToQueue(track.uri);
    setQueue((prev) => [track, ...prev]);
    setTimeout(loadQueue, 800);
  }

  async function handlePlayPlaylist(playlistUri: string) {
    if (!playlistUri) return;
    await SpotifyAPI.playUri(playlistUri);
    setTimeout(() => {
      fetchNowPlaying();
      loadQueue();
    }, 800);
  }

  function handleLogout() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expires');
    localStorage.removeItem('trackdeck_cached_track');
    setIsAuthenticated(false);
    setShowSpotifyModal(true);
  }

  function saveGeminiKey() {
    if (!keyInput.trim()) return;
    localStorage.setItem('gemini_api_key', keyInput.trim());
    setGeminiKey(keyInput.trim());
    setShowSettingsModal(false);
    setMessages((prev) => [
      ...prev,
      { role: 'model', text: '✨ Gemini Copilot is connected and ready.' },
    ]);
  }

  // AI Chat
  async function sendToGemini(textToSend: string) {
    if (!textToSend.trim() || isAiLoading) return;
    if (!geminiKey) {
      setShowSettingsModal(true);
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
            await SpotifyAPI.playUri(undefined, [uri]);
            setTimeout(fetchNowPlaying, 800);
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
        { role: 'model', text: `⚠️ Gemini error: (${msg}). Check your key in Settings.` },
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

  const isDark = theme === 'dark';

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col font-sans select-none transition-colors duration-300 ${
        isDark ? 'bg-[#07080b] text-zinc-100' : 'bg-[#f4f5f8] text-zinc-900'
      }`}
    >
      {/* Dynamic Ambient Background Glow */}
      {playback?.albumArt && (
        <div
          className={`fixed inset-0 pointer-events-none transition-all duration-1000 scale-125 z-0 ${
            isDark ? 'opacity-25 blur-[160px]' : 'opacity-15 blur-[140px]'
          }`}
          style={{
            backgroundImage: `url(${playback.albumArt})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
      )}

      {/* ======================================================== */}
      {/* 1. TOP BAR                                               */}
      {/* ======================================================== */}
      <header
        className={`relative z-30 h-12 border-b px-5 flex items-center justify-between shrink-0 backdrop-blur-2xl transition-colors duration-300 ${
          isDark
            ? 'border-white/[0.05] bg-[#040507]/90 text-white'
            : 'border-zinc-200/80 bg-white/80 text-zinc-900'
        }`}
      >
        <div className="flex items-center">
          <button
            onClick={() => setShowSettingsModal(true)}
            className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
              geminiKey
                ? isDark
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                : isDark
                ? 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200'
                : 'bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Sparkles className={`w-3 h-3 ${geminiKey ? 'text-emerald-500' : 'text-zinc-400'}`} />
            <span>{geminiKey ? 'Gemini Connected' : 'Connect AI'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Disc3 className="w-4 h-4 text-emerald-500 animate-[spin_10s_linear_infinite]" />
          <h1 className="font-bold text-xs tracking-widest uppercase font-mono">TrackDeck</h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Settings & Appearance"
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? 'text-zinc-400 hover:text-white hover:bg-white/[0.06]' : 'text-zinc-600 hover:text-black hover:bg-zinc-200/60'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              title="Spotify Account (Logout)"
              className={`p-1.5 rounded-lg transition-colors ${
                isDark ? 'text-zinc-400 hover:text-rose-400 hover:bg-white/[0.06]' : 'text-zinc-600 hover:text-rose-600 hover:bg-zinc-200/60'
              }`}
            >
              <User className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. THREE-COLUMN BALANCED WORKSPACE                        */}
      {/* ======================================================== */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        
        {/* -------------------------------------------------------- */}
        {/* LEFT WING: PLAYLISTS                                     */}
        {/* -------------------------------------------------------- */}
        <aside
          className={`h-full w-64 border-r backdrop-blur-2xl flex flex-col shrink-0 overflow-hidden transition-colors duration-300 ${
            isDark
              ? 'border-white/[0.05] bg-black/40 text-zinc-100'
              : 'border-zinc-200/80 bg-white/70 text-zinc-900 shadow-sm'
          }`}
        >
          <div
            className={`p-3.5 border-b flex items-center justify-between min-h-[44px] ${
              isDark ? 'border-white/[0.04]' : 'border-zinc-200/60'
            }`}
          >
            {selectedPlaylist ? (
              <button
                onClick={() => setSelectedPlaylist(null)}
                className={`text-xs flex items-center gap-1.5 font-medium transition-colors ${
                  isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-black'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All Playlists</span>
              </button>
            ) : (
              <h2 className="text-xs font-mono uppercase tracking-wider font-semibold opacity-70">
                Playlists
              </h2>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
            {selectedPlaylist ? (
              /* Playlist Track Inspector */
              <div className="space-y-3">
                <div className="text-center p-2">
                  <img
                    src={selectedPlaylist.images?.[0]?.url || ''}
                    alt={selectedPlaylist.name || 'Playlist'}
                    className="w-28 h-28 mx-auto rounded-2xl shadow-lg object-cover mb-2"
                  />
                  <h3 className="font-bold text-xs truncate">{selectedPlaylist.name}</h3>
                  <p className="text-[10px] opacity-60">
                    {selectedPlaylist.tracks?.total ?? 0} songs
                  </p>
                  <button
                    onClick={() => handlePlayPlaylist(selectedPlaylist.uri)}
                    className="mt-2 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-bold rounded-full transition-transform hover:scale-105 active:scale-95 shadow-md shadow-emerald-500/20"
                  >
                    Play
                  </button>
                </div>

                <div className={`space-y-0.5 border-t pt-2 ${isDark ? 'border-white/[0.04]' : 'border-zinc-200'}`}>
                  {isLoadingTracks ? (
                    <div className="p-4 text-center text-xs opacity-50 animate-pulse">Loading songs...</div>
                  ) : (
                    playlistTracks.map((track, idx) => {
                      const artistLine = Array.isArray(track?.artists)
                        ? track.artists.map((a) => a?.name).filter(Boolean).join(', ')
                        : 'Unknown Artist';

                      return (
                        <div
                          key={`${track.id}-${idx}`}
                          className={`group flex items-center justify-between p-2 rounded-xl transition-colors text-xs ${
                            isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-zinc-200/60'
                          }`}
                        >
                          <div className="truncate flex-1 pr-2">
                            <p className="font-medium truncate group-hover:text-emerald-500 transition-colors">
                              {track.name}
                            </p>
                            <p className="text-[10px] opacity-60 truncate">{artistLine}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handlePlayTrack(track.uri)}
                              title="Play"
                              className="p-1 hover:text-emerald-500"
                            >
                              <Play className="w-3 h-3 fill-current" />
                            </button>
                            <button
                              onClick={() => handleAddToQueue(track)}
                              title="Queue"
                              className="p-1 hover:text-emerald-500"
                            >
                              <ListPlus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : playlists.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs opacity-60">Playlists not loaded.</p>
                <button
                  onClick={() => redirectToSpotifyAuth(spotifyClientId)}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-bold rounded-xl transition-all"
                >
                  Sync Permissions
                </button>
              </div>
            ) : (
              /* Playlists Cards */
              playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => openPlaylistInspector(pl)}
                  className={`group rounded-xl cursor-pointer transition-all flex items-center gap-3 p-2 ${
                    isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-zinc-200/60'
                  }`}
                >
                  <img
                    src={pl.images?.[0]?.url || ''}
                    alt={pl.name || 'Playlist'}
                    className="w-10 h-10 rounded-lg object-cover shadow-sm shrink-0"
                  />
                  <div className="truncate flex-1">
                    <p className="text-xs font-semibold truncate group-hover:text-emerald-500 transition-colors">
                      {pl.name}
                    </p>
                    <p className="text-[10px] opacity-60">{pl.tracks?.total ?? 0} songs</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* -------------------------------------------------------- */}
        {/* CENTER STAGE: CLEAN FLOATING DECK + WIDE COMPACT CHAT   */}
        {/* -------------------------------------------------------- */}
        <main className="flex-1 flex flex-col justify-between overflow-hidden px-6 py-4">
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <div className="w-full max-w-md flex flex-col items-center text-center">
              
              {/* Album Art */}
              <div
                className={`relative aspect-square w-56 md:w-64 rounded-3xl overflow-hidden border shadow-2xl mb-4 group flex items-center justify-center transition-all ${
                  isDark
                    ? 'bg-black/70 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)]'
                    : 'bg-white border-zinc-200/80 shadow-xl'
                }`}
              >
                {playback?.albumArt ? (
                  <img
                    src={playback.albumArt}
                    alt={playback.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 opacity-50 p-4">
                    <Music2 className="w-12 h-12 stroke-[1.2]" />
                    <p className="text-xs">Spotify is Idle</p>
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div className="space-y-0.5 px-4 mb-4 w-full">
                <h2 className="font-bold text-lg truncate tracking-tight">
                  {playback?.name || 'Awaiting Track...'}
                </h2>
                <p className="text-xs font-medium opacity-60 truncate">
                  {playback?.artist || 'Open Spotify on phone to spin'}
                </p>
              </div>

              {/* Timeline Scrub Bar */}
              <div className="w-full space-y-1 mb-4">
                <div
                  onClick={handleSeek}
                  className={`w-full h-1.5 rounded-full overflow-hidden cursor-pointer transition-colors relative ${
                    isDark ? 'bg-white/[0.08] hover:bg-white/[0.14]' : 'bg-zinc-200 hover:bg-zinc-300'
                  }`}
                  title="Click to jump"
                >
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-[width] duration-300 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono opacity-50">
                  <span>{playback ? formatTime(playback.progressMs) : '0:00'}</span>
                  <span>{playback ? formatTime(playback.durationMs) : '0:00'}</span>
                </div>
              </div>

              {/* Media Controls */}
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={handlePrev}
                  disabled={!playback}
                  className="p-2 opacity-70 hover:opacity-100 active:scale-90 disabled:opacity-30 transition-all"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!playback}
                  className="p-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-black rounded-2xl shadow-xl shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95"
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
                  className="p-2 opacity-70 hover:opacity-100 active:scale-90 disabled:opacity-30 transition-all"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>
            </div>
          </div>

          {/* LOWER DECK: WIDE, COMPACT AI CONSOLE */}
          <div
            className={`w-full max-w-3xl mx-auto h-[20vh] border rounded-2xl backdrop-blur-2xl flex flex-col justify-between p-3 shrink-0 shadow-lg transition-colors ${
              isDark
                ? 'border-white/[0.06] bg-[#040507]/80'
                : 'border-zinc-200/80 bg-white/80'
            }`}
          >
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 text-xs">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`px-3 py-1.5 rounded-xl max-w-[90%] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-emerald-500 text-black font-semibold'
                        : isDark
                        ? 'bg-white/[0.04] text-zinc-200 border border-white/[0.05]'
                        : 'bg-zinc-100 text-zinc-800 border border-zinc-200'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-500 font-mono animate-pulse">
                  <Sparkles className="w-3 h-3" /> Thinking...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleFormSubmit} className="flex gap-2 pt-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about music, samples, or type 'skip'..."
                className={`flex-1 border rounded-xl px-3.5 py-2 text-xs focus:outline-none transition-colors ${
                  isDark
                    ? 'bg-white/[0.03] border-white/10 text-white placeholder:text-zinc-500 focus:border-emerald-500/60'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500'
                }`}
              />
              <button
                type="submit"
                disabled={isAiLoading || !chatInput.trim()}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black p-2 rounded-xl transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </main>

        {/* -------------------------------------------------------- */}
        {/* RIGHT WING: QUEUE                                        */}
        {/* -------------------------------------------------------- */}
        <aside
          className={`h-full w-64 border-l backdrop-blur-2xl flex flex-col shrink-0 overflow-hidden transition-colors duration-300 ${
            isDark
              ? 'border-white/[0.05] bg-black/40 text-zinc-100'
              : 'border-zinc-200/80 bg-white/70 text-zinc-900 shadow-sm'
          }`}
        >
          <div
            className={`p-3.5 border-b flex items-center justify-between min-h-[44px] ${
              isDark ? 'border-white/[0.04]' : 'border-zinc-200/60'
            }`}
          >
            <h2 className="text-xs font-mono uppercase tracking-wider font-semibold opacity-70">
              Queue
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
            {queue.length === 0 ? (
              <div className="p-4 text-center text-xs opacity-50">Queue is empty</div>
            ) : (
              queue.map((track, idx) => {
                const artistLine = Array.isArray(track?.artists)
                  ? track.artists.map((a) => a?.name).filter(Boolean).join(', ')
                  : 'Unknown Artist';

                return (
                  <div
                    key={`${track.id || idx}-${idx}`}
                    onClick={() => track.uri && handlePlayTrack(track.uri)}
                    className={`group rounded-xl cursor-pointer transition-all flex items-center gap-3 p-2 ${
                      isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-zinc-200/60'
                    }`}
                    title={`${track.name} - ${artistLine}`}
                  >
                    <img
                      src={track.album?.images?.[0]?.url || ''}
                      alt={track.name || 'Song'}
                      className="w-10 h-10 rounded-lg object-cover shadow-sm shrink-0"
                    />
                    <div className="truncate flex-1">
                      <p className="text-xs font-semibold truncate group-hover:text-emerald-500 transition-colors">
                        {track.name}
                      </p>
                      <p className="text-[10px] opacity-60 truncate">{artistLine}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* ======================================================== */}
      {/* 3. SETTINGS MODAL                                        */}
      {/* ======================================================== */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 border transition-colors ${
              isDark ? 'bg-[#0e1017] border-white/10 text-white' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-white/[0.08]' : 'border-zinc-200'}`}>
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-500" />
                <h3 className="font-bold text-sm">Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="opacity-50 hover:opacity-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SETTING 1: APPEARANCE */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">
                Appearance
              </label>
              <div className={`grid grid-cols-2 gap-2 p-1 rounded-2xl border ${isDark ? 'bg-black/40 border-white/10' : 'bg-zinc-100 border-zinc-200'}`}>
                <button
                  onClick={() => toggleTheme('dark')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    isDark
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-600 hover:text-black'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" /> Dark
                </button>
                <button
                  onClick={() => toggleTheme('light')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                    !isDark
                      ? 'bg-white text-black shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" /> Light
                </button>
              </div>
            </div>

            {/* SETTING 2: GEMINI API KEY */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">
                  Google Gemini Key (Free)
                </label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-500 hover:underline flex items-center gap-1"
                >
                  Get Key <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Paste Gemini key (AIzaSy...)"
                className={`w-full rounded-xl px-3.5 py-2 text-xs font-mono border focus:outline-none ${
                  isDark
                    ? 'bg-black/60 border-white/10 text-white focus:border-emerald-500'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:border-emerald-500'
                }`}
              />
            </div>

            {/* SETTING 3: SPOTIFY PLAYLIST SYNC */}
            <div className="space-y-2 border-t pt-3 border-inherit">
              <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">
                Spotify Sync
              </label>
              <button
                onClick={() => redirectToSpotifyAuth(spotifyClientId)}
                className={`w-full py-2 px-3 rounded-xl text-xs font-medium border flex items-center justify-center gap-2 transition-colors ${
                  isDark
                    ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08] text-zinc-300'
                    : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-800'
                }`}
              >
                <RefreshCw className="w-3 h-3 text-emerald-500" /> Refresh Playlist Permissions
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-3 py-1.5 text-xs opacity-60 hover:opacity-100"
              >
                Close
              </button>
              <button
                onClick={saveGeminiKey}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spotify Login Modal */}
      {showSpotifyModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0d12] border border-white/10 w-full max-w-md rounded-3xl p-7 shadow-2xl text-center space-y-5 text-white">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 rounded-2xl mx-auto flex items-center justify-center">
              <Disc3 className="w-7 h-7 animate-[spin_8s_linear_infinite]" />
            </div>

            <div>
              <h2 className="text-lg font-bold">Connect TrackDeck</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Log in to control your phone's Spotify wirelessly with custom atmosphere.
              </p>
            </div>

            {!process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID && (
              <div className="text-left space-y-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Spotify Client ID
                </label>
                <input
                  type="text"
                  value={spotifyClientId}
                  onChange={(e) => setSpotifyClientId(e.target.value)}
                  placeholder="Paste Spotify Client ID..."
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            )}

            <button
              onClick={() => redirectToSpotifyAuth(spotifyClientId)}
              className="w-full py-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-2xl text-xs tracking-wide uppercase transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Music2 className="w-4 h-4 fill-current" />
              Continue with Spotify
            </button>
          </div>
        </div>
      )}
    </div>
  );
}