// ============================================================================
// CHAMELEON REALITY: LOCAL REAL-TIME WEATHER & TIME-OF-DAY ENGINE
// (Uses Open-Meteo API — 100% Free, Zero API Keys, Zero Cost)
// ============================================================================

export interface LocalWeatherReport {
  isDay: boolean;
  weatherCode: number;
  description: string;
  temperatureC: number;
  effect: 'none' | 'rain' | 'thunderstorm' | 'snow';
  recommendedBgUrl: string;
}

// Strictly Zero People, High-Contrast True Nature Landscapes
const WEATHER_WALLPAPERS = {
  // 1. Clear Sunny Day (Warm golden sunlight, lush green hills & blue sky — ZERO snow)
  dayClear:
    'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=80&w=1920&auto=format&fit=crop',

  // 2. Clear Starry Night (Deep midnight cosmos & silhouettes)
  nightClear:
    'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=1920&auto=format&fit=crop',

  // 3. Rain / Wet Streets (Reflective neon city rain)
  rain:
    'https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=1920&auto=format&fit=crop',

  // 4. Night Lightning Thunderstorm (Fork lightning across storm clouds)
  thunderstorm:
    'https://images.unsplash.com/photo-1431440869543-efaf3388c585?q=80&w=1920&auto=format&fit=crop',

  // 5. Alpine Snow Peaks & Frosty Pines (Only when it is actually snowing)
  snow:
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1920&auto=format&fit=crop',

  // 6. Overcast / Moody Mist
  fog:
    'https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=1920&auto=format&fit=crop',
};

export async function detectLocalWeather(): Promise<LocalWeatherReport> {
  const fallbackReport: LocalWeatherReport = {
    isDay: false,
    weatherCode: 0,
    description: 'Clear Night (18°C)',
    temperatureC: 18,
    effect: 'none',
    recommendedBgUrl: WEATHER_WALLPAPERS.nightClear,
  };

  try {
    const coords = await new Promise<{ lat: number; lon: number }>((resolve) => {
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve({ lat: 40.7128, lon: -74.006 }) // Default coordinates if denied
        );
      } else {
        resolve({ lat: 40.7128, lon: -74.006 });
      }
    });

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=weather_code,is_day,temperature_2m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return fallbackReport;

    const data = await res.json();
    const current = data.current;
    const isDay = current.is_day === 1; // 1 = day, 0 = night
    const code = current.weather_code;
    const temp = Math.round(current.temperature_2m);

    let effect: 'none' | 'rain' | 'thunderstorm' | 'snow' = 'none';
    let desc = 'Clear Sky';
    let bgUrl = isDay ? WEATHER_WALLPAPERS.dayClear : WEATHER_WALLPAPERS.nightClear;

    // Strict WMO Weather Code classifications
    if (code >= 95) {
      effect = 'thunderstorm';
      desc = 'Thunderstorm';
      bgUrl = WEATHER_WALLPAPERS.thunderstorm;
    } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
      effect = 'snow';
      desc = 'Snowing';
      bgUrl = WEATHER_WALLPAPERS.snow;
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      effect = 'rain';
      desc = 'Raining';
      bgUrl = WEATHER_WALLPAPERS.rain;
    } else if (code === 45 || code === 48) {
      desc = 'Foggy Mist';
      bgUrl = WEATHER_WALLPAPERS.fog;
    } else if (code >= 1 && code <= 3) {
      desc = isDay ? 'Sunny & Clear' : 'Clear Night';
    }

    return {
      isDay,
      weatherCode: code,
      description: `${desc} (${temp}°C)`,
      temperatureC: temp,
      effect,
      recommendedBgUrl: bgUrl,
    };
  } catch (err) {
    console.warn('Local weather detection failed, using fallback', err);
    return fallbackReport;
  }
}