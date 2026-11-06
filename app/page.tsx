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
  ListMusic,
  ListPlus,
  ArrowLeft,
  ChevronRight,
  Settings,
  User,
  Flame,
  Moon,
  Coffee,
  HelpCircle,
} from 'lucide-react';
import { getAccessToken, spotifyFetch, redirectToSpotifyAuth, SpotifyAPI } from '@/lib/spotify';
import { askGemini, ChatMessage } from '@/lib/gemini';

interface Playlist {
  id: string;
  name: string;
  images: { url: string }[];
  tracks: { total: number };
  uri: string;
}

interface TrackItem {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
  uri: string;
}

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
    lastSyncTime: number;
  } | null>(null);

  // Volume
  const [volume, setVolume] = useState<number>(70);
  const [prevVolume, setPrevVolume] = useState<number>(70);
  const volumeDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isActionPending = useRef(false);

  // Playlists (Left Wing)
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLeftExpanded, setIsLeftExpanded] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);

  // Queue (Right Wing)
  const [queue, setQueue] = useState<TrackItem[]>([]);
  const [isRightExpanded, setIsRightExpanded] = useState(false);

  // AI Chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Yo! I’m your TrackDeck co-pilot. I can queue tracks from your playlists, explain samples, or match your late night vibe.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load
  useEffect(() => {
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

  // 2. Real-Time Sync Polling (Every 1.5s)
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      fetchNowPlaying();
    }, 1500);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Periodic Queue & Playlist Refresh (Every 12s)
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      loadQueue();
    }, 12000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // 3. Smooth Sub-Second Progress Ticking
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

  // Spotify Data Loaders
  async function loadPlaylists() {
    try {
      const data = await SpotifyAPI.getPlaylists();
      if (data?.items) setPlaylists(data.items);
    } catch (e) {
      console.warn('Failed to load playlists', e);
    }
  }

  async function loadQueue() {
    try {
      const data = await SpotifyAPI.getQueue();
      if (data?.queue) setQueue(data.queue.slice(0, 15));
    } catch (e) {
      console.warn('Failed to load queue', e);
    }
  }

  async function openPlaylistInspector(playlist: Playlist) {
    setSelectedPlaylist(playlist);
    setIsLoadingTracks(true);
    try {
      const data = await SpotifyAPI.getPlaylistTracks(playlist.id);
      if (data?.items) {
        setPlaylistTracks(
          data.items
            .map((item: { track: TrackItem }) => item.track)
            .filter((t: TrackItem | null) => t && t.id)
        );
      }
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
            name: data.item.name,
            artist: data.item.artists.map((a: { name: string }) => a.name).join(', '),
            album: data.item.album.name,
            albumArt: data.item.album.images?.[0]?.url || '',
            isPlaying,
            progressMs: serverProgress,
            durationMs: data.item.duration_ms || 1,
            device: data.device?.name || 'Active Device',
            lastSyncTime: Date.now(),
          };
          localStorage.setItem('trackdeck_cached_track', JSON.stringify(fresh));
          return fresh;
        });

        if (typeof data.device?.volume_percent === 'number') {
          setVolume(data.device.volume_percent);
        }
      } else {
        setPlayback((prev) => (prev ? { ...prev, isPlaying: false } : null));
      }
    } catch (e) {
      console.warn('Sync poll error', e);
    }
  }

  // Media Handlers
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

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVol = parseInt(e.target.value, 10);
    setVolume(newVol);
    if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);

    volumeDebounceTimer.current = setTimeout(async () => {
      await spotifyFetch(`/me/player/volume?volume_percent=${newVol}`, { method: 'PUT' });
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

  async function handlePlayTrack(trackUri: string) {
    await SpotifyAPI.playUri(undefined, [trackUri]);
    setTimeout(() => {
      fetchNowPlaying();
      loadQueue();
    }, 600);
  }

  async function handleAddToQueue(track: TrackItem) {
    await SpotifyAPI.addToQueue(track.uri);
    setQueue((prev) => [track, ...prev]);
    setTimeout(loadQueue, 800);
  }

  async function handlePlayPlaylist(playlistUri: string) {
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
    setShowGeminiModal(false);
    setMessages((prev) => [
      ...prev,
      {
        role: 'model',
        text: '✨ Gemini Copilot is online! What vibe or playlist are we feeling?',
      },
    ]);
  }

  // Gemini AI Chat
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#07080b] text-zinc-100 flex flex-col font-sans select-none selection:bg-emerald-500/20">
      {/* Dynamic Ambient Background Glow */}
      {playback?.albumArt && (
        <div
          className="fixed inset-0 pointer-events-none opacity-25 blur-[160px] transition-all duration-1000 scale-125 z-0"
          style={{
            backgroundImage: `url(${playback.albumArt})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
      )}

      {/* ======================================================== */}
      {/* 1. TOP BAR (Darker, Thin, Centered Name, Left AI, Right Settings) */}
      {/* ======================================================== */}
      <header className="relative z-30 h-12 border-b border-white/[0.04] bg-[#040507]/90 backdrop-blur-2xl px-5 flex items-center justify-between shrink-0">
        {/* Left: AI Connectivity Status */}
        <div className="flex items-center">
          <button
            onClick={() => setShowGeminiModal(true)}
            className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
              geminiKey
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
          >
            <Sparkles className={`w-3 h-3 ${geminiKey ? 'text-emerald-400' : 'text-zinc-400'}`} />
            <span>{geminiKey ? 'Gemini Connected' : 'Connect AI'}</span>
          </button>
        </div>

        {/* Center: Brand & Logo */}
        <div className="flex items-center gap-2">
          <Disc3 className="w-4 h-4 text-emerald-400 animate-[spin_10s_linear_infinite]" />
          <h1 className="font-bold text-sm tracking-widest uppercase text-white font-mono">
            TrackDeck
          </h1>
        </div>

        {/* Right: Settings & Account Icons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowGeminiModal(true)}
            title="Settings & Keys"
            className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          {isAuthenticated && (
            <button
              onClick={handleLogout}
              title="Spotify Account (Logout)"
              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <User className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. THREE-WING MAIN CANVAS */}
      {/* ======================================================== */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        
        {/* -------------------------------------------------------- */}
        {/* LEFT WING: PLAYLISTS (Mini Rail -> Expanded -> Full Inspector) */}
        {/* -------------------------------------------------------- */}
        <aside
          onMouseEnter={() => !selectedPlaylist && setIsLeftExpanded(true)}
          onMouseLeave={() => !selectedPlaylist && setIsLeftExpanded(false)}
          className={`h-full border-r border-white/[0.05] bg-black/40 backdrop-blur-2xl flex flex-col transition-all duration-300 ease-out shrink-0 overflow-hidden ${
            selectedPlaylist ? 'w-80' : isLeftExpanded ? 'w-72' : 'w-16'
          }`}
        >
          {/* Header & Title */}
          <div className="p-3.5 border-b border-white/[0.04] flex items-center justify-between min-h-[48px]">
            {selectedPlaylist ? (
              <button
                onClick={() => setSelectedPlaylist(null)}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="font-semibold text-xs truncate">All Playlists</span>
              </button>
            ) : (
              <h2
                className={`font-mono text-zinc-400 uppercase tracking-wider transition-all duration-300 ${
                  isLeftExpanded
                    ? 'text-xs font-bold w-full text-center text-zinc-200'
                    : 'text-[9px] text-center w-full'
                }`}
              >
                {isLeftExpanded ? 'Playlists' : 'Playlists'}
              </h2>
            )}
          </div>

          {/* Playlist Content View */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
            {/* STATE 3: FULL PLAYLIST INSPECTOR WITH TRACKLIST */}
            {selectedPlaylist ? (
              <div className="space-y-4">
                {/* Playlist Banner */}
                <div className="text-center p-2">
                  <img
                    src={selectedPlaylist.images?.[0]?.url || ''}
                    alt={selectedPlaylist.name}
                    className="w-32 h-32 mx-auto rounded-2xl shadow-xl object-cover mb-2"
                  />
                  <h3 className="font-bold text-sm text-white truncate">{selectedPlaylist.name}</h3>
                  <p className="text-[11px] text-zinc-400">{selectedPlaylist.tracks.total} tracks</p>
                  <button
                    onClick={() => handlePlayPlaylist(selectedPlaylist.uri)}
                    className="mt-2.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-full transition-transform hover:scale-105 active:scale-95 shadow-md shadow-emerald-500/20"
                  >
                    Play Playlist
                  </button>
                </div>

                {/* Tracklist */}
                <div className="space-y-1 border-t border-white/[0.04] pt-2">
                  {isLoadingTracks ? (
                    <div className="p-4 text-center text-xs text-zinc-500 animate-pulse">
                      Loading songs...
                    </div>
                  ) : (
                    playlistTracks.map((track, idx) => (
                      <div
                        key={`${track.id}-${idx}`}
                        className="group flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.06] transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2.5 truncate flex-1 pr-2">
                          <span className="text-[10px] font-mono text-zinc-500 w-4">{idx + 1}</span>
                          <div className="truncate">
                            <p className="font-medium text-zinc-200 truncate group-hover:text-emerald-400 transition-colors">
                              {track.name}
                            </p>
                            <p className="text-[10px] text-zinc-500 truncate">
                              {track.artists.map((a) => a.name).join(', ')}
                            </p>
                          </div>
                        </div>

                        {/* Hover Quick Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handlePlayTrack(track.uri)}
                            title="Play Now"
                            className="p-1 hover:text-emerald-400 text-zinc-400"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </button>
                          <button
                            onClick={() => handleAddToQueue(track)}
                            title="Add to Queue"
                            className="p-1 hover:text-emerald-400 text-zinc-400"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* STATE 1 & 2: MINI RAIL OR EXPANDED CARDS */
              playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => openPlaylistInspector(pl)}
                  className={`group rounded-xl cursor-pointer hover:bg-white/[0.06] transition-all flex items-center p-1.5 ${
                    isLeftExpanded ? 'gap-3' : 'justify-center'
                  }`}
                >
                  <img
                    src={pl.images?.[0]?.url || ''}
                    alt={pl.name}
                    className={`rounded-lg object-cover shadow-md transition-all ${
                      isLeftExpanded ? 'w-11 h-11' : 'w-10 h-10'
                    }`}
                  />
                  {isLeftExpanded && (
                    <div className="truncate flex-1">
                      <p className="text-xs font-semibold text-zinc-200 truncate group-hover:text-emerald-400 transition-colors">
                        {pl.name}
                      </p>
                      <p className="text-[10px] text-zinc-500">{pl.tracks.total} songs</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>

        {/* -------------------------------------------------------- */}
        {/* CENTER STAGE: UNIFIED FLOATING DECK & BOTTOM 1/3 AI CHAT */}
        {/* -------------------------------------------------------- */}
        <main className="flex-1 flex flex-col justify-between overflow-hidden">
          
          {/* TOP 2/3: THE SEAMLESS FLOATING PLAYER (NO DIVIDERS) */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-0">
            <div className="w-full max-w-sm flex flex-col items-center text-center">
              
              {/* Glossy Album Art with Dynamic Ambient Shadow */}
              <div className="relative aspect-square w-52 md:w-60 rounded-3xl overflow-hidden bg-black/70 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] mb-4 group flex items-center justify-center">
                {playback?.albumArt ? (
                  <img
                    src={playback.albumArt}
                    alt={playback.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-zinc-500 p-4">
                    <Music2 className="w-12 h-12 stroke-[1.2] text-zinc-600" />
                    <p className="text-xs text-zinc-400">Spotify is Idle</p>
                  </div>
                )}
              </div>

              {/* Title & Artist (Flowing seamlessly under art) */}
              <div className="space-y-0.5 px-4 mb-3 w-full">
                <h2 className="font-bold text-lg text-white truncate tracking-tight">
                  {playback?.name || 'Awaiting Track...'}
                </h2>
                <p className="text-xs font-medium text-zinc-400 truncate">
                  {playback?.artist || 'Open Spotify on phone to spin'}
                </p>
              </div>

              {/* Timeline Scrub Bar */}
              <div className="w-full space-y-1 mb-4">
                <div
                  onClick={handleSeek}
                  className="w-full bg-white/[0.08] hover:bg-white/[0.14] h-1.5 rounded-full overflow-hidden cursor-pointer transition-colors relative"
                  title="Click to jump"
                >
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-[width] duration-300 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                  <span>{playback ? formatTime(playback.progressMs) : '0:00'}</span>
                  <span>{playback ? formatTime(playback.durationMs) : '0:00'}</span>
                </div>
              </div>

              {/* Play / Next / Prev Controls */}
              <div className="flex items-center justify-center gap-6 mb-3">
                <button
                  onClick={handlePrev}
                  disabled={!playback}
                  className="p-2 text-zinc-400 hover:text-white active:scale-90 disabled:opacity-30 rounded-xl transition-all"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!playback}
                  className="p-4 bg-gradient-to-tr from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-30 text-black rounded-2xl shadow-xl shadow-emerald-500/25 transition-all hover:scale-105 active:scale-95"
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
                  className="p-2 text-zinc-400 hover:text-white active:scale-90 disabled:opacity-30 rounded-xl transition-all"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              </div>

              {/* Volume Slider (Directly floating below controls) */}
              <div className="w-48 flex items-center gap-2.5 bg-black/30 border border-white/[0.05] rounded-xl px-3 py-1.5">
                <button onClick={toggleMute} className="text-zinc-400 hover:text-white">
                  {volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : volume < 50 ? (
                    <Volume1 className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="flex-1 h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-emerald-400 focus:outline-none"
                />
                <span className="text-[10px] font-mono text-zinc-400 w-6 text-right">
                  {volume}%
                </span>
              </div>
            </div>
          </div>

          {/* BOTTOM 1/3: COMPACT CONVERSATIONAL AI CONSOLE */}
          <div className="h-[34vh] border-t border-white/[0.05] bg-[#040507]/80 backdrop-blur-2xl flex flex-col justify-between p-3.5 shrink-0 max-w-2xl w-full mx-auto rounded-t-3xl shadow-2xl">
            {/* Scrollable Message History */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`px-3.5 py-2 rounded-2xl max-w-[85%] leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-emerald-500 text-black font-semibold rounded-br-none'
                        : 'bg-white/[0.04] border border-white/[0.06] text-zinc-200 rounded-bl-none'
                    }`}
                  >
                    {m.text}
                  </div>
                  {m.actionTaken && (
                    <span className="mt-1 text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      ⚡ {m.actionTaken}
                    </span>
                  )}
                </div>
              ))}
              {isAiLoading && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono animate-pulse">
                  <Sparkles className="w-3.5 h-3.5" />
                  Thinking...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Quick-Vibe Chips */}
            <div className="py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              <button
                onClick={() => sendToGemini('Who produced this track and what samples are used?')}
                className="text-[10px] bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] px-2.5 py-1 rounded-lg text-zinc-300 flex items-center gap-1 shrink-0"
              >
                <HelpCircle className="w-3 h-3 text-emerald-400" /> Explain song
              </button>
              <button
                onClick={() => sendToGemini('Play something high focus for studying mathematics')}
                className="text-[10px] bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] px-2.5 py-1 rounded-lg text-zinc-300 flex items-center gap-1 shrink-0"
              >
                <Coffee className="w-3 h-3 text-amber-400" /> Study Focus
              </button>
              <button
                onClick={() => sendToGemini('Switch to some late night moody synthwave or R&B')}
                className="text-[10px] bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] px-2.5 py-1 rounded-lg text-zinc-300 flex items-center gap-1 shrink-0"
              >
                <Moon className="w-3 h-3 text-indigo-400" /> Late Night
              </button>
              <button
                onClick={() => sendToGemini('Skip this track, play high-energy aux classics')}
                className="text-[10px] bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] px-2.5 py-1 rounded-lg text-zinc-300 flex items-center gap-1 shrink-0"
              >
                <Flame className="w-3 h-3 text-rose-400" /> Aux Classics
              </button>
            </div>

            {/* AI Prompt Input Bar */}
            <div className="pt-1 shrink-0">
              {!geminiKey ? (
                <button
                  onClick={() => setShowGeminiModal(true)}
                  className="w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-xl text-xs font-medium border border-emerald-500/30 flex items-center justify-center gap-2 transition-all"
                >
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  Connect Free Gemini Key to Chat
                </button>
              ) : (
                <form onSubmit={handleFormSubmit} className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about this song, artist history, or say 'skip'..."
                    className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
                  />
                  <button
                    type="submit"
                    disabled={isAiLoading || !chatInput.trim()}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black p-2 rounded-xl transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </main>

        {/* -------------------------------------------------------- */}
        {/* RIGHT WING: QUEUE (Mini Album Cover Filmstrip -> Expanded Details) */}
        {/* -------------------------------------------------------- */}
        <aside
          onMouseEnter={() => setIsRightExpanded(true)}
          onMouseLeave={() => setIsRightExpanded(false)}
          className={`h-full border-l border-white/[0.05] bg-black/40 backdrop-blur-2xl flex flex-col transition-all duration-300 ease-out shrink-0 overflow-hidden ${
            isRightExpanded ? 'w-72' : 'w-16'
          }`}
        >
          {/* Header & Title */}
          <div className="p-3.5 border-b border-white/[0.04] flex items-center justify-center min-h-[48px]">
            <h2
              className={`font-mono text-zinc-400 uppercase tracking-wider transition-all duration-300 ${
                isRightExpanded
                  ? 'text-xs font-bold text-center w-full text-zinc-200'
                  : 'text-[9px] text-center w-full'
              }`}
            >
              {isRightExpanded ? 'Queue' : 'Queue'}
            </h2>
          </div>

          {/* Queue Track List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar">
            {queue.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-zinc-500">
                {isRightExpanded ? 'Queue is empty' : 'Empty'}
              </div>
            ) : (
              queue.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  onClick={() => handlePlayTrack(track.uri)}
                  className={`group rounded-xl cursor-pointer hover:bg-white/[0.06] transition-all flex items-center p-1.5 ${
                    isRightExpanded ? 'gap-3' : 'justify-center'
                  }`}
                  title={`${track.name} - ${track.artists.map((a) => a.name).join(', ')}`}
                >
                  {/* Album Cover Thumbnail */}
                  <img
                    src={track.album?.images?.[0]?.url || ''}
                    alt={track.name}
                    className={`rounded-lg object-cover shadow-md transition-all ${
                      isRightExpanded ? 'w-10 h-10' : 'w-10 h-10'
                    }`}
                  />

                  {/* Expanded Track Details */}
                  {isRightExpanded && (
                    <div className="truncate flex-1">
                      <p className="text-xs font-semibold text-zinc-200 truncate group-hover:text-emerald-400 transition-colors">
                        {track.name}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {track.artists.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {/* ======================================================== */}
      {/* MODALS */}
      {/* ======================================================== */}
      {/* Spotify Auth Modal */}
      {showSpotifyModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0d12] border border-white/10 w-full max-w-md rounded-3xl p-7 shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-2xl mx-auto flex items-center justify-center">
              <Disc3 className="w-7 h-7 animate-[spin_8s_linear_infinite]" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">Connect TrackDeck</h2>
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
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
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

      {/* Gemini API Key Modal */}
      {showGeminiModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0c0d12] border border-white/10 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Google Gemini Copilot</h3>
              </div>
              <button
                onClick={() => setShowGeminiModal(false)}
                className="text-zinc-500 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p className="text-zinc-400">
                Uses Google Gemini 1.5 Flash. Completely free with no credit card.
              </p>
              <div className="bg-black/50 p-3 rounded-xl border border-white/[0.05] space-y-1.5 text-zinc-400">
                <p>1. Open <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-medium inline-flex items-center gap-1">Google AI Studio <ExternalLink className="w-2.5 h-2.5" /></a></p>
                <p>2. Sign in with your Google account.</p>
                <p>3. Click <strong>"Create API key"</strong> and paste it below:</p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-zinc-400">API Key</label>
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowGeminiModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={saveGeminiKey}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20"
              >
                <Check className="w-3.5 h-3.5" /> Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}