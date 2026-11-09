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
  Image as ImageIcon,
  Upload,
  Sliders,
  CloudRain,
  Zap,
  Flame,
  Snowflake,
  Tv,
  Layers,
  Sparkle,
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

type LayoutPreset = 'studio' | 'cinema';
type ColorPreset = 'dark' | 'light' | 'neon' | 'aqua' | 'amber' | 'oled';
type BgMode = 'album' | 'preset' | 'custom';
type WeatherEffect = 'none' | 'rain' | 'thunderstorm' | 'embers' | 'snow' | 'scanlines';
type AtmosphereTab = 'vibes' | 'effects' | 'wallpaper' | 'appearance';

// Curated All-In-One Vibe Packs (Wallpapers + Weather FX + Color Palettes + Blur/Dim)
const VIBE_PACKS = [
  {
    id: 'thunderstorm',
    name: 'Midnight Thunderstorm',
    tagline: 'Moody rain with distant lightning flashes',
    url: 'https://images.unsplash.com/photo-1511289081-d06dda19034d?q=80&w=1920&auto=format&fit=crop',
    effect: 'thunderstorm' as WeatherEffect,
    color: 'dark' as ColorPreset,
    blur: 6,
    dim: 50,
  },
  {
    id: 'tokyo-rain',
    name: 'Tokyo Lo-Fi Drizzle',
    tagline: 'Neon night city with falling rain streaks',
    url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=1920&auto=format&fit=crop',
    effect: 'rain' as WeatherEffect,
    color: 'neon' as ColorPreset,
    blur: 8,
    dim: 55,
  },
  {
    id: 'blizzard',
    name: 'Alpine Blizzard',
    tagline: 'Snowy misty pines with gentle flakes',
    url: 'https://images.unsplash.com/photo-1491555103944-7c647fd857e6?q=80&w=1920&auto=format&fit=crop',
    effect: 'snow' as WeatherEffect,
    color: 'oled' as ColorPreset,
    blur: 10,
    dim: 45,
  },
  {
    id: 'hearth',
    name: 'Cozy Hearth & Embers',
    tagline: 'Warm fireplace with rising golden embers',
    url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1920&auto=format&fit=crop',
    effect: 'embers' as WeatherEffect,
    color: 'amber' as ColorPreset,
    blur: 10,
    dim: 55,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Alley',
    tagline: 'Neon city with retro CRT scanlines',
    url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?q=80&w=1920&auto=format&fit=crop',
    effect: 'scanlines' as WeatherEffect,
    color: 'neon' as ColorPreset,
    blur: 12,
    dim: 60,
  },
  {
    id: 'nebula',
    name: 'Deep Cosmos Nebula',
    tagline: 'Floating star dust across deep space',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1920&auto=format&fit=crop',
    effect: 'snow' as WeatherEffect,
    color: 'aqua' as ColorPreset,
    blur: 14,
    dim: 50,
  },
];

export default function HomePage() {
  const [layout, setLayout] = useState<LayoutPreset>('studio');
  const [colorTheme, setColorTheme] = useState<ColorPreset>('dark');
  const [activeTab, setActiveTab] = useState<AtmosphereTab>('vibes');

  // Background Customization
  const [bgMode, setBgMode] = useState<BgMode>('preset');
  const [bgPresetUrl, setBgPresetUrl] = useState(VIBE_PACKS[0].url);
  const [bgCustomUrl, setBgCustomUrl] = useState('');
  const [bgBlur, setBgBlur] = useState<number>(8);
  const [bgDim, setBgDim] = useState<number>(50);
  const [bgPosY, setBgPosY] = useState<number>(50);
  const [bgScale, setBgScale] = useState<number>(105);

  // Weather FX State & Sliders
  const [weatherFx, setWeatherFx] = useState<WeatherEffect>('thunderstorm');
  const [fxDensity, setFxDensity] = useState<number>(50); // 1 - 100
  const [fxSpeed, setFxSpeed] = useState<number>(50); // 1 - 100

  // Modals
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Collections
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

  // 1. Initial Load & Hydration
  useEffect(() => {
    const savedLayout = (localStorage.getItem('trackdeck_layout') as LayoutPreset) || 'studio';
    setLayout(savedLayout === 'studio' || savedLayout === 'cinema' ? savedLayout : 'studio');

    const savedColor = (localStorage.getItem('trackdeck_color_theme') as ColorPreset) || 'dark';
    setColorTheme(savedColor);

    const savedBgMode = (localStorage.getItem('trackdeck_bg_mode') as BgMode) || 'preset';
    setBgMode(savedBgMode);

    const savedBgPreset = localStorage.getItem('trackdeck_bg_preset') || VIBE_PACKS[0].url;
    setBgPresetUrl(savedBgPreset);

    const savedBgCustom = localStorage.getItem('trackdeck_bg_custom') || '';
    setBgCustomUrl(savedBgCustom);

    const savedFx = (localStorage.getItem('trackdeck_weather_fx') as WeatherEffect) || 'thunderstorm';
    setWeatherFx(savedFx);

    const savedDensity = Number(localStorage.getItem('trackdeck_fx_density') ?? 50);
    setFxDensity(savedDensity);

    const savedSpeed = Number(localStorage.getItem('trackdeck_fx_speed') ?? 50);
    setFxSpeed(savedSpeed);

    const savedBlur = Number(localStorage.getItem('trackdeck_bg_blur') ?? 8);
    setBgBlur(savedBlur);

    const savedDim = Number(localStorage.getItem('trackdeck_bg_dim') ?? 50);
    setBgDim(savedDim);

    const savedPosY = Number(localStorage.getItem('trackdeck_bg_pos_y') ?? 50);
    setBgPosY(savedPosY);

    const savedScale = Number(localStorage.getItem('trackdeck_bg_scale') ?? 105);
    setBgScale(savedScale);

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

  function applyVibePack(pack: typeof VIBE_PACKS[0]) {
    setBgMode('preset');
    setBgPresetUrl(pack.url);
    setWeatherFx(pack.effect);
    setColorTheme(pack.color);
    setBgBlur(pack.blur);
    setBgDim(pack.dim);

    localStorage.setItem('trackdeck_bg_mode', 'preset');
    localStorage.setItem('trackdeck_bg_preset', pack.url);
    localStorage.setItem('trackdeck_weather_fx', pack.effect);
    localStorage.setItem('trackdeck_color_theme', pack.color);
    localStorage.setItem('trackdeck_bg_blur', String(pack.blur));
    localStorage.setItem('trackdeck_bg_dim', String(pack.dim));
  }

  function changeLayout(newLayout: LayoutPreset) {
    setLayout(newLayout);
    localStorage.setItem('trackdeck_layout', newLayout);
  }

  function changeColorTheme(newTheme: ColorPreset) {
    setColorTheme(newTheme);
    localStorage.setItem('trackdeck_color_theme', newTheme);
  }

  function changeWeatherFx(fx: WeatherEffect) {
    setWeatherFx(fx);
    localStorage.setItem('trackdeck_weather_fx', fx);
  }

  function updateParam(key: string, val: string | number) {
    localStorage.setItem(key, String(val));
  }

  // Local Image Upload with Canvas Auto-Compression
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1280;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, w, h);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);

        setBgCustomUrl(compressedBase64);
        setBgMode('custom');
        localStorage.setItem('trackdeck_bg_custom', compressedBase64);
        localStorage.setItem('trackdeck_bg_mode', 'custom');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // ========================================================
  // REAL-TIME CANVAS WEATHER ENGINE (ZERO MOIRÉ / ZERO ARTIFACTS)
  // ========================================================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || weatherFx === 'none' || weatherFx === 'scanlines') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle setup based on sliders
    const count = Math.floor(100 * (fxDensity / 50));
    const speedMult = fxSpeed / 50;

    interface Particle {
      x: number;
      y: number;
      l: number;
      xs: number;
      ys: number;
      size: number;
      opacity: number;
    }

    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        l: Math.random() * 20 + 10,
        xs: -2 + Math.random() * 0.5,
        ys: (Math.random() * 10 + 10) * speedMult,
        size: Math.random() * 2.5 + 1,
        opacity: Math.random() * 0.5 + 0.2,
      });
    }

    // Lightning Flash Timer
    let lightningOpacity = 0;
    let nextLightning = Date.now() + Math.random() * 6000 + 4000;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. THUNDERSTORM / LIGHTNING FLASH
      if (weatherFx === 'thunderstorm') {
        const now = Date.now();
        if (now > nextLightning) {
          lightningOpacity = 0.75;
          nextLightning = now + Math.random() * 10000 + 6000;
        }

        if (lightningOpacity > 0.01) {
          ctx.fillStyle = `rgba(220, 235, 255, ${lightningOpacity})`;
          ctx.fillRect(0, 0, width, height);
          lightningOpacity *= 0.88; // Smooth fade out
        }
      }

      // 2. RAIN / THUNDERSTORM STREAKS
      if (weatherFx === 'rain' || weatherFx === 'thunderstorm') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const p of particles) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.xs * 1.5, p.y + p.l);
        }
        ctx.stroke();

        for (const p of particles) {
          p.x += p.xs;
          p.y += p.ys;
          if (p.y > height) {
            p.y = -p.l;
            p.x = Math.random() * width;
          }
        }
      }

      // 3. FLOATING EMBERS
      if (weatherFx === 'embers') {
        for (const p of particles) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, ${Math.floor(Math.random() * 120 + 80)}, 0, ${p.opacity})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ff6600';
          ctx.fill();

          p.y -= (p.ys * 0.25);
          p.x += Math.sin(p.y * 0.02) * 0.8;
          if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
        }
      }

      // 4. SOFT DRIFTING SNOW
      if (weatherFx === 'snow') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 0;
        for (const p of particles) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 1.2, 0, Math.PI * 2);
          ctx.fill();

          p.y += p.ys * 0.2;
          p.x += Math.sin(p.y * 0.01) * 0.5;
          if (p.y > height) {
            p.y = -5;
            p.x = Math.random() * width;
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [weatherFx, fxDensity, fxSpeed]);

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

  // Scrub Bar Ticking
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

  // Theme styling definitions
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

  const activeBgImage =
    bgMode === 'custom' && bgCustomUrl
      ? bgCustomUrl
      : bgMode === 'preset'
      ? bgPresetUrl
      : playback?.albumArt || '';

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col font-sans select-none transition-colors duration-500 ${theme.root}`}
    >
      {/* ======================================================== */}
      {/* 0. DYNAMIC BACKGROUND & REAL-TIME WEATHER CANVAS         */}
      {/* ======================================================== */}
      {activeBgImage && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          {/* Background Wallpaper with Smooth Blur & Crop */}
          <div
            className="absolute inset-0 transition-all duration-700"
            style={{
              backgroundImage: `url(${activeBgImage})`,
              backgroundPosition: `center ${bgPosY}%`,
              backgroundSize: `${bgScale}%`,
              backgroundRepeat: 'no-repeat',
              filter: `blur(${bgBlur}px)`,
              transform: 'scale(1.1)',
            }}
          />

          {/* Darkness Tint Layer for HUD Readability */}
          <div
            className="absolute inset-0 transition-opacity duration-500"
            style={{
              backgroundColor: colorTheme === 'light' ? '#ffffff' : '#000000',
              opacity: bgDim / 100,
            }}
          />

          {/* THE CLEAN CANVAS SHADER: RAIN, THUNDERSTORM, EMBERS, SNOW */}
          <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />

          {/* CRT Scanline Overlay */}
          {weatherFx === 'scanlines' && (
            <div
              className="absolute inset-0 pointer-events-none opacity-25"
              style={{
                backgroundImage: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)',
                backgroundSize: '100% 4px',
              }}
            />
          )}
        </div>
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
            title="Atmosphere Studio & FX"
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
      {/* 2. MAIN WORKSPACE (STUDIO vs CINEMA)                     */}
      {/* ======================================================== */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        
        {/* LEFT WING: PLAYLISTS (Studio only) */}
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

        {/* CENTER STAGE */}
        <main
          className={`flex-1 flex flex-col justify-between overflow-hidden transition-all duration-500 ${
            layout === 'cinema' ? 'px-8 py-6 max-w-4xl mx-auto' : 'px-6 py-4'
          }`}
        >
          {/* UPPER DECK */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <div
              className={`flex flex-col items-center text-center transition-all duration-500 ${
                layout === 'cinema' ? 'w-full max-w-lg' : 'w-full max-w-md'
              }`}
            >
              {/* Album Art */}
              <div
                className={`relative aspect-square rounded-3xl overflow-hidden border shadow-2xl mb-4 group flex items-center justify-center transition-all duration-500 ${
                  layout === 'cinema'
                    ? 'w-64 md:w-80 shadow-[0_25px_60px_rgba(0,0,0,0.9)]'
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
                    layout === 'cinema' ? 'text-2xl' : 'text-lg'
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
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={handlePrev}
                  disabled={!playback}
                  className="p-2 opacity-70 hover:opacity-100 active:scale-90 disabled:opacity-30 transition-all"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!playback}
                  className={`p-4 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-30 ${theme.accentBtn}`}
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
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* LOWER DECK: WIDE CHAT */}
          <div
            className={`w-full mx-auto border rounded-2xl backdrop-blur-2xl flex flex-col justify-between p-3 shrink-0 shadow-lg h-[20vh] max-w-3xl transition-all duration-300 ${theme.panel}`}
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

        {/* RIGHT WING: QUEUE (Studio only) */}
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
      {/* ATMOSPHERE STUDIO MODAL (TABBED FIGMA/APPLE GRADE UX)    */}
      {/* ======================================================== */}
      {showAtmosphereModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-5 border max-h-[90vh] flex flex-col ${theme.modal}`}>
            {/* Header & Close */}
            <div className="flex items-center justify-between border-b pb-3 border-inherit shrink-0">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="font-bold text-sm">Atmosphere & Deck Studio</h3>
                  <p className="text-[10px] opacity-60">Personalize vibes, shaders, and deck layout</p>
                </div>
              </div>
              <button onClick={() => setShowAtmosphereModal(false)} className="opacity-50 hover:opacity-100 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TAB SELECTOR BAR */}
            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-2xl border border-inherit shrink-0">
              <button
                onClick={() => setActiveTab('vibes')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'vibes' ? theme.accentBtn : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Sparkle className="w-3.5 h-3.5" /> All-In-One Vibes
              </button>

              <button
                onClick={() => setActiveTab('effects')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'effects' ? theme.accentBtn : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> Live Weather FX
              </button>

              <button
                onClick={() => setActiveTab('wallpaper')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'wallpaper' ? theme.accentBtn : 'opacity-70 hover:opacity-100'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" /> Wallpaper
              </button>

              <button
                onClick={() => setActiveTab('appearance')}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'appearance' ? theme.accentBtn : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Deck & Colors
              </button>
            </div>

            {/* TAB CONTENT (SCROLLABLE) */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              
              {/* TAB 1: ALL-IN-ONE VIBE PACKS */}
              {activeTab === 'vibes' && (
                <div className="space-y-2">
                  <p className="text-xs opacity-60">One click sets wallpaper, real-time weather shaders, and matching colors.</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {VIBE_PACKS.map((pack) => (
                      <button
                        key={pack.id}
                        onClick={() => applyVibePack(pack)}
                        className={`group p-2.5 rounded-2xl border text-left flex gap-3 items-center transition-all ${
                          bgPresetUrl === pack.url && weatherFx === pack.effect
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                            : 'border-white/10 hover:border-white/25 hover:bg-white/5'
                        }`}
                      >
                        <img src={pack.url} alt={pack.name} className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-md group-hover:scale-105 transition-transform" />
                        <div className="truncate flex-1">
                          <p className="font-bold text-xs truncate">{pack.name}</p>
                          <p className="text-[10px] opacity-60 leading-tight line-clamp-2 mt-0.5">{pack.tagline}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: LIVE WEATHER FX & PARTICLE SLIDERS */}
              {activeTab === 'effects' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">Choose Active Weather Shader</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => changeWeatherFx('none')}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          weatherFx === 'none' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                        }`}
                      >
                        None
                      </button>
                      <button
                        onClick={() => changeWeatherFx('rain')}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          weatherFx === 'rain' ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-white/10'
                        }`}
                      >
                        <CloudRain className="w-3.5 h-3.5" /> Rain Streaks
                      </button>
                      <button
                        onClick={() => changeWeatherFx('thunderstorm')}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          weatherFx === 'thunderstorm' ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-white/10'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" /> Storm + Flash
                      </button>
                      <button
                        onClick={() => changeWeatherFx('embers')}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          weatherFx === 'embers' ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-white/10'
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" /> Embers
                      </button>
                      <button
                        onClick={() => changeWeatherFx('snow')}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          weatherFx === 'snow' ? 'border-sky-300 bg-sky-300/10 text-sky-200' : 'border-white/10'
                        }`}
                      >
                        <Snowflake className="w-3.5 h-3.5" /> Snow
                      </button>
                      <button
                        onClick={() => changeWeatherFx('scanlines')}
                        className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          weatherFx === 'scanlines' ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300' : 'border-white/10'
                        }`}
                      >
                        <Tv className="w-3.5 h-3.5" /> CRT Scanlines
                      </button>
                    </div>
                  </div>

                  {/* SLIDERS FOR SPEED & DENSITY */}
                  {weatherFx !== 'none' && weatherFx !== 'scanlines' && (
                    <div className="space-y-3.5 border-t pt-4 border-inherit">
                      <label className="text-[11px] font-mono uppercase tracking-wider opacity-60 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5" /> Particle Physics Sliders
                      </label>

                      {/* Density Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Particle Density / Intensity</span>
                          <span className="font-mono opacity-60">{fxDensity}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={fxDensity}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFxDensity(val);
                            updateParam('trackdeck_fx_density', val);
                          }}
                          className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>

                      {/* Speed Slider */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span>Wind & Fall Speed</span>
                          <span className="font-mono opacity-60">{fxSpeed}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={fxSpeed}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFxSpeed(val);
                            updateParam('trackdeck_fx_speed', val);
                          }}
                          className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: WALLPAPER & CAMERA SLIDERS */}
              {activeTab === 'wallpaper' && (
                <div className="space-y-4">
                  {/* Wallpaper Source */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">Wallpaper Source</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => {
                          setBgMode('preset');
                          updateParam('trackdeck_bg_mode', 'preset');
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          bgMode === 'preset' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                        }`}
                      >
                        Curated Scenes
                      </button>
                      <button
                        onClick={() => {
                          setBgMode('album');
                          updateParam('trackdeck_bg_mode', 'album');
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          bgMode === 'album' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                        }`}
                      >
                        Album Glow
                      </button>
                      <button
                        onClick={() => {
                          setBgMode('custom');
                          updateParam('trackdeck_bg_mode', 'custom');
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          bgMode === 'custom' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                        }`}
                      >
                        Upload Photo
                      </button>
                    </div>
                  </div>

                  {/* Custom Upload */}
                  {bgMode === 'custom' && (
                    <div className="pt-1 space-y-2">
                      <label className="border-2 border-dashed border-white/20 hover:border-emerald-500 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/[0.02]">
                        <Upload className="w-6 h-6 text-emerald-500 mb-1" />
                        <span className="text-xs font-semibold">Upload Photo from Chromebook</span>
                        <span className="text-[10px] opacity-50">Auto-compressed into browser storage</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                      {bgCustomUrl && <p className="text-[10px] text-emerald-400 font-mono text-center">✓ Photo active</p>}
                    </div>
                  )}

                  {/* SLIDERS FOR BLUR, DIM, CROP & SCALE */}
                  <div className="space-y-3.5 border-t pt-3 border-inherit">
                    <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">Wallpaper Adjustment Controls</label>

                    {/* Blur */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Blur Intensity</span>
                        <span className="font-mono opacity-60">{bgBlur}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={bgBlur}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBgBlur(val);
                          updateParam('trackdeck_bg_blur', val);
                        }}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>

                    {/* Darkness Tint */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Darkness Tint (HUD Contrast)</span>
                        <span className="font-mono opacity-60">{bgDim}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={bgDim}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBgDim(val);
                          updateParam('trackdeck_bg_dim', val);
                        }}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>

                    {/* Vertical Crop Focus */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Vertical Framing / Crop</span>
                        <span className="font-mono opacity-60">
                          {bgPosY < 35 ? 'Top' : bgPosY > 65 ? 'Bottom' : 'Center'} ({bgPosY}%)
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={bgPosY}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBgPosY(val);
                          updateParam('trackdeck_bg_pos_y', val);
                        }}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>

                    {/* Scale */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span>Zoom / Scale</span>
                        <span className="font-mono opacity-60">{bgScale}%</span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="150"
                        value={bgScale}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBgScale(val);
                          updateParam('trackdeck_bg_scale', val);
                        }}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DECK THEME & LAYOUT */}
              {activeTab === 'appearance' && (
                <div className="space-y-4">
                  {/* Layout Mode */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">Layout View</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={() => changeLayout('studio')}
                        className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                          layout === 'studio'
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <p className="font-bold text-xs flex items-center justify-between">
                          Studio Deck <LayoutGrid className="w-3.5 h-3.5 opacity-60" />
                        </p>
                        <p className="text-[10px] opacity-60 leading-tight">3-column command center with playlists & queue.</p>
                      </button>

                      <button
                        onClick={() => changeLayout('cinema')}
                        className={`p-3 rounded-2xl border text-left space-y-1 transition-all ${
                          layout === 'cinema'
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-500/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <p className="font-bold text-xs flex items-center justify-between">
                          Cinema Focus <Maximize2 className="w-3.5 h-3.5 opacity-60" />
                        </p>
                        <p className="text-[10px] opacity-60 leading-tight">Sidebars hidden. Grand album art centerpiece.</p>
                      </button>
                    </div>
                  </div>

                  {/* Color Swatches */}
                  <div className="space-y-2 border-t pt-4 border-inherit">
                    <label className="text-[11px] font-mono uppercase tracking-wider opacity-60">Accent Palette</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => changeColorTheme('dark')}
                        className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                          colorTheme === 'dark' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" /> Obsidian
                      </button>
                      <button
                        onClick={() => changeColorTheme('light')}
                        className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                          colorTheme === 'light' ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-zinc-200 border border-zinc-400 shrink-0" /> Pearl Light
                      </button>
                      <button
                        onClick={() => changeColorTheme('neon')}
                        className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                          colorTheme === 'neon' ? 'border-pink-500 bg-pink-500/10' : 'border-white/10'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-pink-500 shrink-0" /> Cyber Neon
                      </button>
                      <button
                        onClick={() => changeColorTheme('aqua')}
                        className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                          colorTheme === 'aqua' ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-cyan-400 shrink-0" /> Ocean Aqua
                      </button>
                      <button
                        onClick={() => changeColorTheme('amber')}
                        className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                          colorTheme === 'amber' ? 'border-amber-500 bg-amber-500/10' : 'border-white/10'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" /> Sunset Amber
                      </button>
                      <button
                        onClick={() => changeColorTheme('oled')}
                        className={`p-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                          colorTheme === 'oled' ? 'border-white bg-white/10' : 'border-white/10'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-black border border-white shrink-0" /> OLED Zero
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-end pt-3 border-t border-inherit shrink-0">
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