import { redis } from '../redis';
import axios from 'axios';

const JAKARTA_LAT = -6.2088;
const JAKARTA_LNG = 106.8456;

// Open-Meteo API doesn't require keys and is great for general weather tracking
const WEATHER_API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${JAKARTA_LAT}&longitude=${JAKARTA_LNG}&current=temperature_2m,precipitation,rain,weather_code&timezone=Asia%2FJakarta`;

export const fetchAndStoreWeather = async () => {
  try {
    const response = await axios.get(WEATHER_API_URL);
    const current = response.data.current;
    
    // WMO Weather interpretation codes (WW)
    // 0: Clear sky
    // 1, 2, 3: Mainly clear, partly cloudy, and overcast
    // 51, 53, 55: Drizzle: Light, moderate, and dense intensity
    // 61, 63, 65: Rain: Slight, moderate and heavy intensity
    // 80, 81, 82: Rain showers: Slight, moderate, and violent
    // 95: Thunderstorm: Slight or moderate
    // 96, 99: Thunderstorm with slight and heavy hail

    let isBadWeather = false;
    let surgeMultiplier = 0;
    const code = current.weather_code;

    if (code >= 51 && code <= 55) {
      // Drizzle
      isBadWeather = true;
      surgeMultiplier = 0.10; // 10% surge
    } else if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) {
      // Rain
      isBadWeather = true;
      surgeMultiplier = 0.25; // 25% surge
    } else if (code >= 95) {
      // Thunderstorm
      isBadWeather = true;
      surgeMultiplier = 0.50; // 50% surge
    }

    const weatherData = {
      timestamp: new Date().toISOString(),
      temperature: current.temperature_2m,
      precipitation: current.precipitation,
      code: current.weather_code,
      isBadWeather,
      surgeMultiplier
    };

    // Store in redis with 15 mins expiry
    await redis.setex('current_weather_surge', 900, JSON.stringify(weatherData));
    console.log(`[Weather Worker] Updated weather: Code ${code}, Surge ${surgeMultiplier * 100}%`);
  } catch (error) {
    console.error('[Weather Worker] Failed to fetch weather:', error);
  }
};

export const startWeatherWorker = () => {
  console.log('[Weather Worker] Started');
  // Fetch immediately
  fetchAndStoreWeather();
  // Fetch every 10 minutes
  setInterval(fetchAndStoreWeather, 10 * 60 * 1000);
};
