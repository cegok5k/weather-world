// Open-Meteo forecast client. Always fetches metric; UI converts on display.
export interface CurrentWeather {
  temperature: number; // °C
  apparentTemperature: number; // °C
  humidity: number; // %
  isDay: boolean;
  weatherCode: number;
  windSpeed: number; // km/h
  cloudCover: number; // %
}

export interface DailyForecast {
  date: string; // ISO yyyy-mm-dd
  weatherCode: number;
  tempMax: number; // °C
  tempMin: number; // °C
  precipProbability: number; // %
  precipSum: number; // mm
}

export interface WeatherData {
  current: CurrentWeather;
  daily: DailyForecast[];
}

const BASE = 'https://api.open-meteo.com/v1/forecast';

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,cloud_cover',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    forecast_days: '10',
    timezone: 'auto',
  });
  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`Weather API error ${res.status}`);
  const json = await res.json();

  const c = json.current;
  const d = json.daily;
  return {
    current: {
      temperature: c.temperature_2m,
      apparentTemperature: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      isDay: c.is_day === 1,
      weatherCode: c.weather_code,
      windSpeed: c.wind_speed_10m,
      cloudCover: c.cloud_cover,
    },
    daily: (d.time as string[]).map((date, i) => ({
      date,
      weatherCode: d.weather_code[i],
      tempMax: d.temperature_2m_max[i],
      tempMin: d.temperature_2m_min[i],
      precipProbability: d.precipitation_probability_max[i] ?? 0,
      precipSum: d.precipitation_sum[i] ?? 0,
    })),
  };
}
