// Clock and weather. Game time is in minutes since day 1, 00:00.
import { clamp, weightedPick } from './random.js';

export const WEATHER = {
  sunny: { label: 'Sunny', light: 1, fog: 0.004, overcast: 0, waves: 1 },
  cloudy: { label: 'Overcast', light: 0.7, fog: 0.007, overcast: 0.7, waves: 1.3 },
  rain: { label: 'Rain', light: 0.5, fog: 0.012, overcast: 0.85, waves: 1.8, precip: 'rain' },
  storm: { label: 'Thunderstorm', light: 0.32, fog: 0.016, overcast: 1, waves: 3, precip: 'rain', lightning: true },
  fog: { label: 'Fog', light: 0.55, fog: 0.05, overcast: 0.8, waves: 0.5 },
  snow: { label: 'Snow', light: 0.6, fog: 0.018, overcast: 0.8, waves: 1.1, precip: 'snow' }
};

const DEFAULT_WEIGHTS = { sunny: 3, cloudy: 2, rain: 0.8 };

export function createWorld(rng, startMinute = 6 * 60) {
  return {
    minute: startMinute,
    weather: 'sunny',
    next: 'cloudy',
    nextWeatherAt: startMinute + 180,
    weights: DEFAULT_WEIGHTS,
    tempBase: 19,
    airTemp: 21,
    rng
  };
}

function pickWeather(world, hour) {
  const w = world.weights;
  const options = Object.entries(w).map(([value, weight]) => ({
    value,
    // Weather tends to persist; fog only forms in the early morning.
    weight: (value === world.next ? weight * 1.3 : weight) * (value === 'fog' && (hour < 3 || hour > 9) ? 0 : 1)
  }));
  return weightedPick(world.rng, options) || 'cloudy';
}

// Called when you arrive at a new water: its own weather and temperature.
export function setClimate(world, weights, tempBase) {
  world.weights = weights;
  world.tempBase = tempBase;
  const h = (world.minute / 60) % 24;
  world.weather = pickWeather(world, h);
  world.next = pickWeather(world, (h + 3) % 24);
  world.nextWeatherAt = world.minute + 90 + world.rng() * 150;
  updateTemp(world);
}

// Minutes until the forecast weather arrives.
export const forecastIn = (world) => Math.max(0, world.nextWeatherAt - world.minute);

function updateTemp(world) {
  const h = hourOf(world);
  const daily = 6 * Math.sin(((h - 9) / 24) * Math.PI * 2);
  const wet = world.weather === 'rain' || world.weather === 'storm' ? 3 : world.weather === 'snow' ? 2 : 0;
  world.airTemp = world.tempBase + daily - wet;
}

export const hourOf = (world) => (world.minute / 60) % 24;
export const dayOf = (world) => Math.floor(world.minute / 1440) + 1;

export function clockLabel(world) {
  const total = Math.floor(world.minute % 1440);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function stepWorld(world, minutes) {
  world.minute += minutes;
  if (world.minute >= world.nextWeatherAt) {
    world.weather = world.next;
    if (world.weather === 'fog' && (hourOf(world) < 3 || hourOf(world) > 10)) world.weather = 'cloudy';
    world.next = pickWeather(world, (hourOf(world) + 3) % 24);
    // Storms and fog pass faster than settled weather.
    const short = world.weather === 'storm' || world.weather === 'fog';
    world.nextWeatherAt = world.minute + (short ? 50 + world.rng() * 50 : 120 + world.rng() * 180);
  }
  updateTemp(world);
}

const smoothPeak = (h, center, width) => {
  let d = Math.abs(h - center);
  d = Math.min(d, 24 - d);
  return Math.exp(-(d * d) / (2 * width * width));
};

// How actively a species feeds at a given hour (roughly 0.15 to 1.3).
export function timeMultiplier(curve, hour) {
  const night = hour < 5 || hour > 21;
  switch (curve) {
    case 'day':
      return 0.25 + 0.95 * smoothPeak(hour, 13, 4.5);
    case 'morning':
      return 0.25 + 1 * smoothPeak(hour, 8, 2.5) + 0.3 * smoothPeak(hour, 18, 2);
    case 'dawnDusk':
      return 0.2 + 1.1 * Math.max(smoothPeak(hour, 6.5, 1.6), smoothPeak(hour, 19.5, 1.6));
    case 'night':
      return night ? 1.3 : 0.2 + 0.8 * smoothPeak(hour, 22, 3);
    default:
      return 1;
  }
}

// Sun elevation angle in radians: rises 05:30, sets 20:00.
export const sunAngle = (hour) => ((hour - 5.5) / 14.5) * Math.PI;

// 0 at night, 1 for most of the day: drives the sky and light.
export function daylight(hour) {
  return clamp((Math.sin(sunAngle(hour)) + 0.06) * 2.2, 0, 1);
}
