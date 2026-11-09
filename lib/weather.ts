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

// ============================================================================
// HOW TO EDIT: Curated Wallpapers for Weather States (Strictly Zero People)
// ============================================================================
const WEATHER_WALLPAPERS = {
  // 1. Clear Sunny Day
  dayClear:
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1920&auto=format&fit=crop',

  // 2. Clear / Starry Night
  nightClear:
    'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1920&auto=format&fit=crop',

  // 3. Rain / Wet Streets
  rain:
    'https://images.unsplash.com/photo-1514565131-fce0801e5785?q=80&w=1920&auto=format&fit=crop',

  // 4. Night Lightning Thunderstorm
  thunderstorm:
    'https://images.unsplash.com/photo-1431440869543-efaf3388c585?q=80&w=1920&auto=format&fit=crop',

  // 5. Alpine Snow Peaks & Pines
  snow:
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=1920&auto=format&fit=crop',

  // 6. Overcast / Foggy Forest
  fog:
    'https://images.unsplash.com/photo-1448375240586-882707db888b?q=80&w=1920&auto=format&fit=crop',
};

// ============================================================================
// MAIN FUNCTION: DETECT REAL-TIME LOCAL WEATHER
// ============================================================================
export async function detectLocalWeather(): Promise<LocalWeatherReport> {
  // Sensible default fallback if user blocks location permissions
  const fallbackReport: LocalWeatherReport = {
    isDay: false,
    weatherCode: 0,
    description: 'Clear Night (18°C)',
    temperatureC: 18,
    effect: 'none',
    recommendedBgUrl: WEATHER_WALLPAPERS.nightClear,
  };

  try {
    // 1. Get User's Real-World Coordinates (Browser Geolocation API)
    const coords = await new Promise<{ lat: number; lon: number }>((resolve) => {
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          () => resolve({ lat: 40.7128, lon: -74.006 }) // Default coordinates if denied (NYC)
        );
      } else {
        resolve({ lat: 40.7128, lon: -74.006 });
      }
    });

    // 2. Fetch Live Weather Data from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=weather_code,is_day,temperature_2m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return fallbackReport;

    const data = await res.json();
    const current = data.current;
    const isDay = current.is_day === 1; // 1 = daytime, 0 = night
    const code = current.weather_code;
    const temp = Math.round(current.temperature_2m);

    let effect: 'none' | 'rain' | 'thunderstorm' | 'snow' = 'none';
    let desc = 'Clear Sky';
    let bgUrl = isDay ? WEATHER_WALLPAPERS.dayClear : WEATHER_WALLPAPERS.nightClear;

    // 3. Map WMO Weather Codes to Real-Time Effects & Wallpapers
    if (code >= 95) {
      // Thunderstorm
      effect = 'thunderstorm';
      desc = 'Thunderstorm';
      bgUrl = WEATHER_WALLPAPERS.thunderstorm;
    } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
      // Snow & Blizzard
      effect = 'snow';
      desc = 'Snowing';
      bgUrl = WEATHER_WALLPAPERS.snow;
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      // Drizzle & Rain
      effect = 'rain';
      desc = 'Raining';
      bgUrl = WEATHER_WALLPAPERS.rain;
    } else if (code === 45 || code === 48) {
      // Fog / Mist
      desc = 'Misty Fog';
      bgUrl = WEATHER_WALLPAPERS.fog;
    } else if (code >= 1 && code <= 3) {
      // Partly Cloudy
      desc = isDay ? 'Partly Cloudy' : 'Cloudy Night';
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