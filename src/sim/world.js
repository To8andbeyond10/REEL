// Clock and weather. Game time is in minutes since day 1, 00:00.
import { clamp, weightedPick } from './random.js';

export const WEATHER = {
  sunny: { label: 'Sunny', sky: [0.45, 0.68, 0.95], light: 1, fog: 0.004 },
  cloudy: { label: 'Overcast', sky: [0.62, 0.67, 0.72], light: 0.7, fog: 0.007 },
  rain: { label: 'Rain', sky: [0.46, 0.5, 0.55], light: 0.5, fog: 0.012 }
};

export function createWorld(rng, startMinute = 6 * 60) {
  return {
    minute: startMinute,
    weather: 'sunny',
    nextWeatherAt: startMinute + 180,
    airTemp: 21,
    rng
  };
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
    world.weather = weightedPick(world.rng, [
      { value: 'sunny', weight: world.weather === 'sunny' ? 3 : 2 },
      { value: 'cloudy', weight: 2 },
      { value: 'rain', weight: world.weather === 'rain' ? 1.5 : 0.8 }
    ]);
    world.nextWeatherAt = world.minute + 120 + world.rng() * 180;
  }
  const h = hourOf(world);
  const daily = 6 * Math.sin(((h - 9) / 24) * Math.PI * 2);
  world.airTemp = 19 + daily - (world.weather === 'rain' ? 3 : 0);
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
