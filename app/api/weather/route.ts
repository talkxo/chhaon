import { NextResponse } from "next/server";

type CachedWeather = {
  temperature: number;
  humidity: number;
  apparentTemp: number;
  windSpeed: number;
  weatherCode: number;
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
    // Fetch live temperature, humidity, apparent temp, wind speed, and weather code
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=28.4595&longitude=77.0266&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code",
      { next: { revalidate: 600 } }
    );

    if (!res.ok) throw new Error("Open-Meteo request failed");
    const data = await res.json();
    const current = data.current;

    if (current && typeof current.temperature_2m === "number") {
      const payload: CachedWeather = {
        temperature: current.temperature_2m,
        humidity: current.relative_humidity_2m ?? 40,
        apparentTemp: current.apparent_temperature ?? current.temperature_2m,
        windSpeed: current.wind_speed_10m ?? 12,
        weatherCode: current.weather_code ?? 0,
      };

      cachedWeather = payload;
      lastFetchTime = now;
      return NextResponse.json({ ...payload, source: "api" });
    }
    throw new Error("Invalid response format");
  } catch (err: any) {
    console.error("Failed to fetch live weather, using seasonal fallback:", err.message);
    const fallback: CachedWeather = {
      temperature: 40.5,
      humidity: 35,
      apparentTemp: 43.5,
      windSpeed: 10,
      weatherCode: 0,
    };
    return NextResponse.json({ ...fallback, source: "fallback", error: err.message });
  }
}
