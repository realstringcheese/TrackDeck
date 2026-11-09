'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Sparkles,
  Music2,
  Disc3,
  ListPlus,
  ArrowLeft,
  Settings,
  User,
  RefreshCw,
  X,
  Send,
  ExternalLink,
  Smartphone,
  Laptop,
  Speaker,
  Radio,
  Palette,
  Maximize2,
  LayoutGrid,
  Minimize2,
  Flame,
  Waves,
  Sun,
  Moon,
} from 'lucide-react';
import { getAccessToken, spotifyFetch, redirectToSpotifyAuth, SpotifyAPI } from '@/lib/spotify';
import { askGemini, ChatMessage, CopilotResponse } from '@/lib/gemini';

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

interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

type LayoutPreset = 'studio' | 'cinema' | 'mini';
type ColorPreset = 'dark' | 'light' | 'neon' | 'aqua' | 'amber' | 'oled';

export default function HomePage() {
  const [layout, setLayout] = useState<LayoutPreset>('studio');
  const [colorTheme, setColorTheme] = useState<ColorPreset>('dark');

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [showAtmosphereModal, setShowAtmosphereModal] = useState(false);

  // Key
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [keyInput, setKeyInput] = useState('');

  // Playback
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

  const activeDeviceId = useRef<string | null>(null);
  const isActionPending = useRef(false);

  // Devices & Collections
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [queue, setQueue] = useState<TrackItem[]>([]);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'TrackDeck Copilot ready. Ask for any song, artist, or music trivia.',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Initial Load
  useEffect(() => {
    const savedLayout = (localStorage.getItem('trackdeck_layout') as LayoutPreset) || 'studio';
    setLayout(savedLayout);

    const savedColor = (localStorage.getItem('trackdeck_color_theme') as ColorPreset) || 'dark';
    setColorTheme(savedColor);

    const savedKey = localStorage.getItem('gemini_api_key') || '';
    setGeminiKey(savedKey);
    setKeyInput(savedKey);

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
        loadDevices();
      } else {
        setIsAuthenticated(false);
        setShowSpotifyModal(true);
      }
    });
  }, []);

  function changeLayout(newLayout: LayoutPreset) {
    setLayout(newLayout);
    localStorage.setItem('trackdeck_layout', newLayout);
  }

  function changeColorTheme(newTheme: ColorPreset) {
    setColorTheme(newTheme);
    localStorage.setItem('trackdeck_color_theme', newTheme);
  }

  // Polling
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchNowPlaying, 1500);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(loadQueue, 10000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Scrub Ticking
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

  // Load Devices
  async function loadDevices() {
    try {
      const data = await SpotifyAPI.getDevices();
      if (data?.devices && Array.isArray(data.devices)) {
        setDevices(data.devices);
        const active = data.devices.find((d: SpotifyDevice) => d.is_active);
        if (active?.id) activeDeviceId.current = active.id;
      }
    } catch (e) {
      console.warn('Failed to load devices', e);
    }
  }

  // Transfer Playback
  async function handleTransferDevice(devId: string) {
    try {
      isActionPending.current = true;
      activeDeviceId.current = devId;
      await SpotifyAPI.transferPlayback(devId, true);
      setShowDevicesModal(false);
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
        loadDevices();
      }, 800);
    } catch (e) {
      console.warn('Failed to transfer playback', e);
      isActionPending.current = false;
    }
  }

  async function loadPlaylists() {
    try {
      const data = await SpotifyAPI.getPlaylists();
      if (data?.items && Array.isArray(data.items)) {
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
        if (data.device?.id) {
          activeDeviceId.current = data.device.id;
        }

        const isPlaying = Boolean(data.is_playing);
        const serverProgress = data.progress_ms || 0;

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

  // Copilot Direct Executor
  async function executeCopilotCommand(copilot: CopilotResponse) {
    const { command, query } = copilot;
    if (!command) return;

    isActionPending.current = true;
    const deviceId = activeDeviceId.current || undefined;
    const devParam = deviceId ? `?device_id=${deviceId}` : '';

    try {
      if (command === 'play') {
        const isGeneric =
          !query ||
          /^(play|music|song|the song|it|unpause|resume|track)$/i.test(query.trim());

        if (!isGeneric && query) {
          const searchRes = await spotifyFetch(
            `/search?q=${encodeURIComponent(query)}&type=track&limit=5`
          );
          const track = searchRes?.tracks?.items?.[0];

          if (track?.uri) {
            await SpotifyAPI.playUri(undefined, [track.uri], deviceId);
          }
        } else {
          await spotifyFetch(`/me/player/play${devParam}`, { method: 'PUT' });
        }
      }

      if (command === 'queue' && query) {
        const searchRes = await spotifyFetch(
          `/search?q=${encodeURIComponent(query)}&type=track&limit=1`
        );
        const track = searchRes?.tracks?.items?.[0];

        if (track?.uri) {
          await SpotifyAPI.addToQueue(track.uri);
          setQueue((prev) => [track, ...prev]);
        }
      }

      if (command === 'next') {
        await spotifyFetch(`/me/player/next${devParam}`, { method: 'POST' });
      }

      if (command === 'pause') {
        await spotifyFetch(`/me/player/pause${devParam}`, { method: 'PUT' });
      }

      if (command === 'prev') {
        await spotifyFetch(`/me/player/previous${devParam}`, { method: 'POST' });
      }
    } catch (e) {
      console.error('Command execution failed', e);
    } finally {
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
        loadQueue();
      }, 700);
    }
  }

  // Media Handlers
  async function togglePlay() {
    if (!playback) return;
    const targetState = !playback.isPlaying;
    const devParam = activeDeviceId.current ? `?device_id=${activeDeviceId.current}` : '';
    isActionPending.current = true;
    setPlayback((prev) => (prev ? { ...prev, isPlaying: targetState, lastSyncTime: Date.now() } : null));

    try {
      await spotifyFetch(`/me/player/${targetState ? 'play' : 'pause'}${devParam}`, { method: 'PUT' });
    } finally {
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
      }, 400);
    }
  }

  async function handleNext() {
    isActionPending.current = true;
    const devParam = activeDeviceId.current ? `?device_id=${activeDeviceId.current}` : '';
    try {
      await spotifyFetch(`/me/player/next${devParam}`, { method: 'POST' });
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
    const devParam = activeDeviceId.current ? `?device_id=${activeDeviceId.current}` : '';
    try {
      await spotifyFetch(`/me/player/previous${devParam}`, { method: 'POST' });
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
    const devParam = activeDeviceId.current ? `?device_id=${activeDeviceId.current}` : '';

    isActionPending.current = true;
    setPlayback((prev) => (prev ? { ...prev, progressMs: newPosMs, lastSyncTime: Date.now() } : null));

    try {
      await spotifyFetch(`/me/player/seek?position_ms=${newPosMs}${devParam}`, { method: 'PUT' });
    } finally {
      setTimeout(() => {
        isActionPending.current = false;
        fetchNowPlaying();
      }, 500);
    }
  }

  async function handlePlayTrack(trackUri: string) {
    if (!trackUri) return;
    await SpotifyAPI.playUri(undefined, [trackUri], activeDeviceId.current || undefined);
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
    await SpotifyAPI.playUri(playlistUri, undefined, activeDeviceId.current || undefined);
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
      { role: 'model', text: '✨ Copilot is connected and ready.' },
    ]);
  }

  // AI Chat Sender
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
      if (response.command) {
        executeCopilotCommand(response);
      }
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: response.message },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error reaching Copilot';
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: `⚠️ Copilot error: (${msg}). Check your key in Settings.` },
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

  // --- THEME COLOR ENGINE ---
  const themeClasses: Record<
    ColorPreset,
    {
      root: string;
      topBar: string;
      panel: string;
      border: string;
      accentBtn: string;
      accentText: string;
      scrubBg: string;
      scrubFill: string;
      modal: string;
      input: string;
    }
  > = {
    dark: {
      root: 'bg-[#07080b] text-zinc-100',
      topBar: 'bg-[#040507]/90 border-white/[0.05] text-white',
      panel: 'bg-black/40 text-zinc-100 border-white/[0.05]',
      border: 'border-white/[0.05]',
      accentBtn: 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20',
      accentText: 'text-emerald-500',
      scrubBg: 'bg-white/[0.08] hover:bg-white/[0.14]',
      scrubFill: 'bg-emerald-500',
      modal: 'bg-[#0e1017] border-white/10 text-white',
      input: 'bg-white/[0.03] border-white/10 text-white placeholder:text-zinc-500 focus:border-emerald-500/60',
    },
    light: {
      root: 'bg-[#f4f5f8] text-zinc-900',
      topBar: 'bg-white/80 border-zinc-200/80 text-zinc-900 shadow-sm',
      panel: 'bg-white/70 text-zinc-900 border-zinc-200/80 shadow-sm',
      border: 'border-zinc-200/80',
      accentBtn: 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/10',
      accentText: 'text-emerald-600',
      scrubBg: 'bg-zinc-200 hover:bg-zinc-300',
      scrubFill: 'bg-emerald-500',
      modal: 'bg-white border-zinc-200 text-zinc-900',
      input: 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500',
    },
    neon: {
      root: 'bg-[#0a0518] text-pink-50',
      topBar: 'bg-[#070212]/90 border-pink-500/20 text-white',
      panel: 'bg-[#120826]/60 text-pink-50 border-pink-500/20 shadow-pink-950/20',
      border: 'border-pink-500/20',
      accentBtn: 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white shadow-pink-500/30',
      accentText: 'text-cyan-400',
      scrubBg: 'bg-pink-950/40 hover:bg-pink-900/50',
      scrubFill: 'bg-gradient-to-r from-cyan-400 to-pink-500',
      modal: 'bg-[#120826] border-pink-500/30 text-white',
      input: 'bg-pink-950/20 border-pink-500/30 text-white placeholder:text-pink-400/50 focus:border-cyan-400',
    },
    aqua: {
      root: 'bg-[#040d1a] text-cyan-50',
      topBar: 'bg-[#02070e]/90 border-cyan-500/20 text-white',
      panel: 'bg-[#081b33]/60 text-cyan-50 border-cyan-500/20 shadow-cyan-950/20',
      border: 'border-cyan-500/20',
      accentBtn: 'bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-black shadow-cyan-500/30',
      accentText: 'text-cyan-400',
      scrubBg: 'bg-cyan-950/40 hover:bg-cyan-900/50',
      scrubFill: 'bg-gradient-to-r from-cyan-400 to-teal-300',
      modal: 'bg-[#081b33] border-cyan-500/30 text-white',
      input: 'bg-cyan-950/20 border-cyan-500/30 text-white placeholder:text-cyan-400/50 focus:border-teal-400',
    },
    amber: {
      root: 'bg-[#100a06] text-amber-50',
      topBar: 'bg-[#090503]/90 border-amber-500/20 text-white',
      panel: 'bg-[#1a0f07]/60 text-amber-50 border-amber-500/20 shadow-amber-950/20',
      border: 'border-amber-500/20',
      accentBtn: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-amber-500/30',
      accentText: 'text-amber-400',
      scrubBg: 'bg-amber-950/40 hover:bg-amber-900/50',
      scrubFill: 'bg-gradient-to-r from-amber-400 to-orange-400',
      modal: 'bg-[#1a0f07] border-amber-500/30 text-white',
      input: 'bg-amber-950/20 border-amber-500/30 text-white placeholder:text-amber-400/50 focus:border-amber-400',
    },
    oled: {
      root: 'bg-[#000000] text-white',
      topBar: 'bg-[#000000] border-zinc-800 text-white',
      panel: 'bg-[#000000] text-white border-zinc-850',
      border: 'border-zinc-850',
      accentBtn: 'bg-white hover:bg-zinc-200 text-black shadow-white/10',
      accentText: 'text-zinc-400',
      scrubBg: 'bg-zinc-900 hover:bg-zinc-800',
      scrubFill: 'bg-white',
      modal: 'bg-[#000000] border-zinc-800 text-white',
      input: 'bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-600 focus:border-white',
    },
  };

  const theme = themeClasses[colorTheme];

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col font-sans select-none transition-colors duration-500 ${theme.root}`}
    >
      {/* Ambient Glow */}
      {playback?.albumArt && (
        <div
          className="fixed inset-0 pointer-events-none transition-all duration-1000 scale-125 z-0 opacity-20 blur-[160px]"
          style={{
            backgroundImage: `url(${playback.albumArt})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        />
      )}

      {/* ======================================================== */}
      {/* 1. TOP NAVBAR                                            */}
      {/* ======================================================== */}
      <header
        className={`relative z-30 h-12 border-b px-5 flex items-center justify-between shrink-0 backdrop-blur-2xl transition-colors duration-300 ${theme.topBar}`}
      >
        <div className="flex items-center gap-2">
          {/* AI Status */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className={`text-[11px] font-medium px-3 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
              geminiKey
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-emerald-500" />
            <span>{geminiKey ? 'Copilot Active' : 'Connect AI'}</span>
          </button>

          {/* Device Selector Pill */}
          <button
            onClick={() => {
              loadDevices();
              setShowDevicesModal(true);
            }}
            className="text-[11px] font-medium px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] transition-colors flex items-center gap-1.5"
            title="Switch or Wake Device"
          >
            <Smartphone className="w-3 h-3 text-emerald-500" />
            <span className="truncate max-w-[130px]">
              {playback?.device || 'Select Device'}
            </span>
          </button>
        </div>

        {/* Center: Brand */}
        <div className="flex items-center gap-2">
          <Disc3 className="w-4 h-4 text-emerald-500 animate-[spin_10s_linear_infinite]" />
          <h1 className="font-bold text-xs tracking-widest uppercase font-mono">TrackDeck</h1>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          {/* Atmosphere Palette Button */}
          <button
            onClick={() => setShowAtmosphereModal(true)}
            title="Atmosphere & Layout Themes"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-1 text-xs"
          >
            <Palette className="w-4 h-4 text-emerald-500" />
          </button>

          {/* Settings Gear */}
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Settings"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Settings className="w-4 h-4 opacity-70 hover:opacity-100" />
          </button>

          {/* Account Logout */}
          {isAuthenticated && (
            <button
              onClick={handleLogout}
              title="Spotify Account"
              className="p-1.5 rounded-lg hover:bg-white/10 hover:text-rose-400 transition-colors"
            >
              <User className="w-4 h-4 opacity-70 hover:opacity-100" />
            </button>
          )}
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. DYNAMIC WORKSPACE (STUDIO vs CINEMA vs MINI-PLAYER)   */}
      {/* ======================================================== */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        
        {/* LEFT WING: PLAYLISTS (Visible only in 'studio' layout) */}
        {layout === 'studio' && (
          <aside
            className={`h-full w-64 border-r backdrop-blur-2xl flex flex-col shrink-0 overflow-hidden transition-all duration-300 ${theme.panel}`}
          >
            <div className={`p-3.5 border-b flex items-center justify-between min-h-[44px] ${theme.border}`}>
              {selectedPlaylist ? (
                <button
                  onClick={() => setSelectedPlaylist(null)}
                  className="text-xs flex items-center gap-1.5 font-medium opacity-70 hover:opacity-100 transition-opacity"
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
                <div className="space-y-3">
                  <div className="text-center p-2">
                    <img
                      src={selectedPlaylist.images?.[0]?.url || ''}
                      alt={selectedPlaylist.name}
                      className="w-28 h-28 mx-auto rounded-2xl shadow-lg object-cover mb-2"
                    />
                    <h3 className="font-bold text-xs truncate">{selectedPlaylist.name}</h3>
                    <p className="text-[10px] opacity-60">{selectedPlaylist.tracks?.total ?? 0} songs</p>
                    <button
                      onClick={() => handlePlayPlaylist(selectedPlaylist.uri)}
                      className={`mt-2 px-3 py-1 text-[11px] font-bold rounded-full transition-transform hover:scale-105 active:scale-95 shadow-md ${theme.accentBtn}`}
                    >
                      Play
                    </button>
                  </div>

                  <div className={`space-y-0.5 border-t pt-2 ${theme.border}`}>
                    {isLoadingTracks ? (
                      <div className="p-4 text-center text-xs opacity-50 animate-pulse">Loading songs...</div>
                    ) : (
                      playlistTracks.map((track, idx) => (
                        <div
                          key={`${track.id}-${idx}`}
                          className="group flex items-center justify-between p-2 rounded-xl hover:bg-white/10 transition-colors text-xs"
                        >
                          <div className="truncate flex-1 pr-2">
                            <p className={`font-medium truncate transition-colors group-hover:${theme.accentText}`}>
                              {track.name}
                            </p>
                            <p className="text-[10px] opacity-60 truncate">
                              {track.artists?.map((a) => a.name).join(', ')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handlePlayTrack(track.uri)} className="p-1 hover:text-emerald-500">
                              <Play className="w-3 h-3 fill-current" />
                            </button>
                            <button onClick={() => handleAddToQueue(track)} className="p-1 hover:text-emerald-500">
                              <ListPlus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                playlists.map((pl) => (
                  <div
                    key={pl.id}
                    onClick={() => openPlaylistInspector(pl)}
                    className="group rounded-xl cursor-pointer hover:bg-white/10 transition-all flex items-center gap-3 p-2"
                  >
                    <img
                      src={pl.images?.[0]?.url || ''}
                      alt={pl.name}
                      className="w-10 h-10 rounded-lg object-cover shadow-sm shrink-0"
                    />
                    <div className="truncate flex-1">
                      <p className={`text-xs font-semibold truncate transition-colors group-hover:${theme.accentText}`}>
                        {pl.name}
                      </p>
                      <p className="text-[10px] opacity-60">{pl.tracks?.total ?? 0} songs</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* CENTER STAGE: ADAPTS TO 'STUDIO', 'CINEMA', AND 'MINI' */}
        <main
          className={`flex-1 flex flex-col justify-between overflow-hidden transition-all duration-500 ${
            layout === 'cinema'
              ? 'px-8 py-6 max-w-4xl mx-auto'
              : layout === 'mini'
              ? 'p-3 max-w-sm mx-auto'
              : 'px-6 py-4'
          }`}
        >
          {/* UPPER DECK: VINYL SHOWCASE */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <div
              className={`flex flex-col items-center text-center transition-all duration-500 ${
                layout === 'cinema'
                  ? 'w-full max-w-lg'
                  : layout === 'mini'
                  ? 'w-full max-w-xs'
                  : 'w-full max-w-md'
              }`}
            >
              {/* Album Art (Sizes dynamically per layout) */}
              <div
                className={`relative aspect-square rounded-3xl overflow-hidden border shadow-2xl mb-4 group flex items-center justify-center transition-all duration-500 ${
                  layout === 'cinema'
                    ? 'w-64 md:w-80 shadow-[0_25px_60px_rgba(0,0,0,0.9)]'
                    : layout === 'mini'
                    ? 'w-40 md:w-44'
                    : 'w-56 md:w-64'
                } ${theme.panel}`}
              >
                {playback?.albumArt ? (
                  <img
                    src={playback.albumArt}
                    alt={playback.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 opacity-60 p-4">
                    <Music2 className="w-12 h-12 stroke-[1.2]" />
                    <p className="text-xs font-semibold">Spotify is Idle</p>
                    {devices.length > 0 && (
                      <button
                        onClick={() => handleTransferDevice(devices[0].id)}
                        className={`mt-2 px-3 py-1 text-[11px] font-bold rounded-full transition-all ${theme.accentBtn}`}
                      >
                        Wake Up {devices[0].name}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Title & Artist */}
              <div className="space-y-0.5 px-4 mb-3 w-full">
                <h2
                  className={`font-bold truncate tracking-tight transition-all ${
                    layout === 'cinema' ? 'text-2xl' : layout === 'mini' ? 'text-base' : 'text-lg'
                  }`}
                >
                  {playback?.name || 'Awaiting Track...'}
                </h2>
                <p className="text-xs font-medium opacity-60 truncate">
                  {playback?.artist || 'Ready to spin'}
                </p>
              </div>

              {/* Timeline Scrub Bar */}
              <div className="w-full space-y-1 mb-4">
                <div
                  onClick={handleSeek}
                  className={`w-full h-1.5 rounded-full overflow-hidden cursor-pointer transition-colors relative ${theme.scrubBg}`}
                  title="Click to jump"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-linear ${theme.scrubFill}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono opacity-50">
                  <span>{playback ? formatTime(playback.progressMs) : '0:00'}</span>
                  <span>{playback ? formatTime(playback.durationMs) : '0:00'}</span>
                </div>
              </div>

              {/* Media Controls */}
              <div className={`flex items-center justify-center ${layout === 'mini' ? 'gap-5' : 'gap-8'}`}>
                <button
                  onClick={handlePrev}
                  disabled={!playback}
                  className="p-2 opacity-70 hover:opacity-100 active:scale-90 disabled:opacity-30 transition-all"
                >
                  <SkipBack className={layout === 'mini' ? 'w-4 h-4' : 'w-5 h-5'} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!playback}
                  className={`rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-30 ${
                    layout === 'mini' ? 'p-3' : 'p-4'
                  } ${theme.accentBtn}`}
                >
                  {playback?.isPlaying ? (
                    <Pause className={layout === 'mini' ? 'w-5 h-5 fill-current' : 'w-6 h-6 fill-current'} />
                  ) : (
                    <Play className={layout === 'mini' ? 'w-5 h-5 fill-current ml-0.5' : 'w-6 h-6 fill-current ml-0.5'} />
                  )}
                </button>
                <button
                  onClick={handleNext}
                  disabled={!playback}
                  className="p-2 opacity-70 hover:opacity-100 active:scale-90 disabled:opacity-30 transition-all"
                >
                  <SkipForward className={layout === 'mini' ? 'w-4 h-4' : 'w-5 h-5'} />
                </button>
              </div>
            </div>
          </div>

          {/* LOWER DECK: WIDE CHAT */}
          <div
            className={`w-full mx-auto border rounded-2xl backdrop-blur-2xl flex flex-col justify-between p-3 shrink-0 shadow-lg transition-all duration-300 ${
              layout === 'mini' ? 'h-[16vh] max-w-sm' : 'h-[20vh] max-w-3xl'
            } ${theme.panel}`}
          >
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 text-xs">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`px-3 py-1.5 rounded-xl max-w-[90%] leading-relaxed ${
                      m.role === 'user' ? theme.accentBtn : 'bg-white/10 opacity-90'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono animate-pulse opacity-70">
                  <Sparkles className="w-3 h-3 text-emerald-500" /> Thinking...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={handleFormSubmit} className="flex gap-2 pt-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask trivia, or say 'play Silly Watch by Lil Uzi Vert'..."
                className={`flex-1 border rounded-xl px-3.5 py-2 text-xs focus:outline-none transition-colors ${theme.input}`}
              />
              <button
                type="submit"
                disabled={isAiLoading || !chatInput.trim()}
                className={`p-2 rounded-xl transition-all disabled:opacity-40 ${theme.accentBtn}`}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </main>

        {/* RIGHT WING: QUEUE (Visible only in 'studio' layout) */}
        {layout === 'studio' && (
          <aside
            className={`h-full w-64 border-l backdrop-blur-2xl flex flex-col shrink-0 overflow-hidden transition-all duration-300 ${theme.panel}`}
          >
            <div className={`p-3.5 border-b flex items-center justify-between min-h-[44px] ${theme.border}`}>
              <h2 className="text-xs font-mono uppercase tracking-wider font-semibold opacity-70">
                Queue
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 no-scrollbar">
              {queue.length === 0 ? (
                <div className="p-4 text-center text-xs opacity-50">Queue is empty</div>
              ) : (
                queue.map((track, idx) => (
                  <div
                    key={`${track.id || idx}-${idx}`}
                    onClick={() => track.uri && handlePlayTrack(track.uri)}
                    className="group rounded-xl cursor-pointer hover:bg-white/10 transition-all flex items-center gap-3 p-2"
                    title={`${track.name} - ${track.artists?.map((a) => a.name).join(', ')}`}
                  >
                    <img
                      src={track.album?.images?.[0]?.url || ''}
                      alt={track.name}
                      className="w-10 h-10 rounded-lg object-cover shadow-sm shrink-0"
                    />
                    <div className="truncate flex-1">
                      <p className={`text-xs font-semibold truncate transition-colors group-hover:${theme.accentText}`}>
                        {track.name}
                      </p>
                      <p className="text-[10px] opacity-60 truncate">
                        {track.artists?.map((a) => a.name).join(', ')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ======================================================== */}
      {/* ATMOSPHERE & LAYOUT MODAL (🎨 PALETTE BUTTON)            */}
      {/* ======================================================== */}
      {showAtmosphereModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl space-y-6 border ${theme.modal}`}>
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-sm">Atmosphere & Deck Setup</h3>
              </div>
              <button onClick={() => setShowAtmosphereModal(false)} className="opacity-50 hover:opacity-100 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SECTION 1: LAYOUT PRESETS */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono uppercase tracking-wider opacity-60 flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" /> Layout Mode
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {/* Studio */}
                <button
                  onClick={() => changeLayout('studio')}
                  className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                    layout === 'studio'
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <p className="font-bold text-xs flex items-center justify-between">
                    Studio <LayoutGrid className="w-3.5 h-3.5 opacity-60" />
                  </p>
                  <p className="text-[10px] opacity-60 leading-tight">3-column command center with playlists & queue.</p>
                </button>

                {/* Cinema */}
                <button
                  onClick={() => changeLayout('cinema')}
                  className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                    layout === 'cinema'
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <p className="font-bold text-xs flex items-center justify-between">
                    Cinema <Maximize2 className="w-3.5 h-3.5 opacity-60" />
                  </p>
                  <p className="text-[10px] opacity-60 leading-tight">Sidebars hidden. Grand album art focus.</p>
                </button>

                {/* Mini */}
                <button
                  onClick={() => changeLayout('mini')}
                  className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                    layout === 'mini'
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <p className="font-bold text-xs flex items-center justify-between">
                    Mini <Minimize2 className="w-3.5 h-3.5 opacity-60" />
                  </p>
                  <p className="text-[10px] opacity-60 leading-tight">Compact card for multitasking & homework.</p>
                </button>
              </div>
            </div>

            {/* SECTION 2: COLOR PRESETS */}
            <div className="space-y-2 border-t pt-4 border-inherit">
              <label className="text-[11px] font-mono uppercase tracking-wider opacity-60 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" /> Color Presets
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Obsidian */}
                <button
                  onClick={() => changeColorTheme('dark')}
                  className={`p-2.5 rounded-2xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                    colorTheme === 'dark' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 shrink-0" /> Obsidian
                </button>

                {/* Pearl Light */}
                <button
                  onClick={() => changeColorTheme('light')}
                  className={`p-2.5 rounded-2xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                    colorTheme === 'light' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-zinc-200 border border-zinc-400 shrink-0" /> Pearl Light
                </button>

                {/* Cyber Neon */}
                <button
                  onClick={() => changeColorTheme('neon')}
                  className={`p-2.5 rounded-2xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                    colorTheme === 'neon' ? 'border-pink-500 bg-pink-500/10' : 'border-white/10'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-pink-500 to-cyan-400 shrink-0" /> Cyber Neon
                </button>

                {/* Ocean Aqua */}
                <button
                  onClick={() => changeColorTheme('aqua')}
                  className={`p-2.5 rounded-2xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                    colorTheme === 'aqua' ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-cyan-400 to-teal-400 shrink-0" /> Ocean Aqua
                </button>

                {/* Sunset Amber */}
                <button
                  onClick={() => changeColorTheme('amber')}
                  className={`p-2.5 rounded-2xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                    colorTheme === 'amber' ? 'border-amber-500 bg-amber-500/10' : 'border-white/10'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 shrink-0" /> Sunset Amber
                </button>

                {/* OLED Zero */}
                <button
                  onClick={() => changeColorTheme('oled')}
                  className={`p-2.5 rounded-2xl border flex items-center gap-2 text-xs font-semibold transition-all ${
                    colorTheme === 'oled' ? 'border-white bg-white/10' : 'border-white/10'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-black border border-white shrink-0" /> OLED Zero
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-inherit">
              <button
                onClick={() => setShowAtmosphereModal(false)}
                className={`px-5 py-2 text-xs font-bold rounded-xl shadow-md ${theme.accentBtn}`}
              >
                Apply Atmosphere
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SPOTIFY CONNECT DEVICES MODAL */}
      {showDevicesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 border ${theme.modal}`}>
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-500" />
                <h3 className="font-bold text-sm">Spotify Connect Devices</h3>
              </div>
              <button onClick={() => setShowDevicesModal(false)} className="opacity-50 hover:opacity-100 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs opacity-60 leading-relaxed">
              Select which device receives the audio stream. Tap any device below to wake it up and resume playback remotely.
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {devices.length === 0 ? (
                <div className="p-4 text-center text-xs opacity-50 space-y-2">
                  <p>No active Spotify devices found.</p>
                  <p className="text-[11px] opacity-40">Open Spotify on your phone or PC to wake it up.</p>
                </div>
              ) : (
                devices.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                      d.is_active
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'border-white/10 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {d.type.toLowerCase() === 'smartphone' ? (
                        <Smartphone className="w-5 h-5 text-emerald-500" />
                      ) : d.type.toLowerCase() === 'speaker' ? (
                        <Speaker className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Laptop className="w-5 h-5 text-emerald-500" />
                      )}
                      <div>
                        <p className="font-semibold text-xs flex items-center gap-2">
                          {d.name}
                          {d.is_active && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          )}
                        </p>
                        <p className="text-[10px] opacity-60 capitalize">{d.type}</p>
                      </div>
                    </div>

                    {!d.is_active && (
                      <button
                        onClick={() => handleTransferDevice(d.id)}
                        className={`px-3 py-1 text-[11px] font-bold rounded-xl transition-all shadow-sm ${theme.accentBtn}`}
                      >
                        Play Here
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-inherit">
              <button
                onClick={loadDevices}
                className="text-xs text-emerald-500 hover:underline flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> Refresh Device List
              </button>
              <button onClick={() => setShowDevicesModal(false)} className="px-4 py-1.5 text-xs opacity-60 hover:opacity-100">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 border ${theme.modal}`}>
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-500" />
                <h3 className="font-bold text-sm">Settings</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="opacity-50 hover:opacity-100 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* API KEY */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">
                  Groq API Key (Free)
                </label>
                <a
                  href="https://console.groq.com/keys"
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
                placeholder="Paste Groq key (gsk_...)"
                className={`w-full rounded-xl px-3.5 py-2 text-xs font-mono border focus:outline-none ${theme.input}`}
              />
            </div>

            {/* SPOTIFY SYNC */}
            <div className="space-y-2 border-t pt-3 border-inherit">
              <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">
                Spotify Sync
              </label>
              <button
                onClick={() => redirectToSpotifyAuth(spotifyClientId)}
                className="w-full py-2 px-3 rounded-xl text-xs font-medium border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-3 h-3 text-emerald-500" /> Refresh Playlist Permissions
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowSettingsModal(false)} className="px-3 py-1.5 text-xs opacity-60 hover:opacity-100">
                Close
              </button>
              <button
                onClick={saveGeminiKey}
                className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-md ${theme.accentBtn}`}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SPOTIFY LOGIN MODAL */}
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