import { NextResponse } from "next/server";

type CachedWeather = {
  temperature: number;
  humidity: number;
  apparentTemp: number;
  windSpeed: number;
  weatherCode: number;
  pm25: number;
  aqi: number;
};

let cachedWeather: CachedWeather | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes cache

export async function GET() {
  const now = Date.now();
  if (cachedWeather && now - lastFetchTime < CACHE_DURATION) {
    return NextResponse.json({ ...cachedWeather, source: "cache" });
  }

  try {
    // Fetch live weather and air quality in parallel — both are free, no-key Open-Meteo endpoints
    const [weatherRes, airRes] = await Promise.all([
      fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=28.4595&longitude=77.0266&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code",
        { next: { revalidate: 600 } },
      ),
      fetch(
        "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=28.4595&longitude=77.0266&current=pm2_5,us_aqi",
        { next: { revalidate: 600 } },
      ),
    ]);

    if (!weatherRes.ok) throw new Error("Open-Meteo weather request failed");
    const data = await weatherRes.json();
    const current = data.current;
    if (!current || typeof current.temperature_2m !== "number") throw new Error("Invalid weather response format");

    let pm25 = 45;
    let aqi = 116;
    if (airRes.ok) {
      const airData = await airRes.json();
      if (typeof airData.current?.pm2_5 === "number") pm25 = airData.current.pm2_5;
      if (typeof airData.current?.us_aqi === "number") aqi = airData.current.us_aqi;
    }

    const payload: CachedWeather = {
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m ?? 40,
      apparentTemp: current.apparent_temperature ?? current.temperature_2m,
      windSpeed: current.wind_speed_10m ?? 12,
      weatherCode: current.weather_code ?? 0,
      pm25,
      aqi,
    };

    cachedWeather = payload;
    lastFetchTime = now;
    return NextResponse.json({ ...payload, source: "api" });
  } catch (err: any) {
    console.error("Failed to fetch live weather, using seasonal fallback:", err.message);
    const fallback: CachedWeather = {
      temperature: 40.5,
      humidity: 35,
      apparentTemp: 43.5,
      windSpeed: 10,
      weatherCode: 0,
      pm25: 45,
      aqi: 116,
    };
    return NextResponse.json({ ...fallback, source: "fallback", error: err.message });
  }
}
