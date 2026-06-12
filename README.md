# 🌍 Weather World

A free, toony 3D weather globe. Spin the earth, search a city (or just click anywhere), and watch the camera fly in to show the current weather as cartoonish 3D effects — fluffy clouds, chunky raindrops, a beaming sun — plus a floating 10-day forecast.

The fluffy clouds scattered across the globe are real: they're driven by live cloud-cover data sampled on a global grid.

## Data sources (all free, no API keys)

- [Open-Meteo](https://open-meteo.com/) — current weather, 10-day forecast, global cloud-cover grid, and city search (free for non-commercial use)
- [BigDataCloud](https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api) — reverse geocoding for globe clicks
- NASA Blue Marble earth texture (public domain), posterized at runtime into flat cartoon colors

## Tech

[Globe.gl](https://globe.gl/) (three.js) · Vite · TypeScript · no framework, no backend. Deployed to GitHub Pages via GitHub Actions.

## Develop

```sh
npm install
npm run dev
```

Dev helper: force a weather effect with `?effect=rain|snow|thunder|clear|cloudy|fog`.

## Deploy

Push to `main` — the GitHub Actions workflow builds and publishes to GitHub Pages (set the repo's Pages source to "GitHub Actions" once).
