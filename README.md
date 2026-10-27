# LOST — A Space Narrative

An immersive, scroll-driven WebGL experience: one astronaut adrift above Earth, one fading signal. Built with **Three.js**, **GSAP**, **Lenis** and **Vite**.

![status](https://img.shields.io/badge/status-signal_lost-46e6ff) ![stack](https://img.shields.io/badge/three.js-%C2%B7_gsap_%C2%B7_lenis_%C2%B7_vite-4488ff)

## Features

- **Cinematic scroll choreography** — camera, Earth and astronaut are animated along a scrubbed GSAP + ScrollTrigger timeline synced to buttery-smooth Lenis inertia scrolling.
- **HDRI-lit scene** — an equirectangular space HDRI drives image-based lighting, reflections on the helmet, and a soft cosmic backdrop.
- **Physically-based Earth** — day/night/normal/roughness/cloud layers, a Fresnel atmosphere shader, and a custom `onBeforeCompile` mask so **city lights only glow on the night side**.
- **Layered particles** — distant additive starfield + drifting foreground dust for real depth.
- **Post-processing stack** — Unreal bloom, film grain, vignette, subtle chromatic aberration, ACES tone-mapping and SMAA (desktop).
- **Premium UI** — custom cursor, animated navigation, live HUD telemetry, count-up statistics, scroll progress, mission-log timeline and an optional WebAudio ambient drone.
- **Optimized 3D models** — the `~20 MB` source GLBs are compressed to `~3 MB` with meshopt + WebP textures.
- **Responsive & accessible** — quality scales down on mobile, and animations respect `prefers-reduced-motion`.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build -> dist/
npm run preview  # preview the production build locally
```

Requires Node.js 20+.

## Deployment

The project is a static Vite build and deploys as-is to **Vercel** or **Netlify** — configs are already included.

### Vercel

Import the repo and deploy. `vercel.json` sets the build command (`npm run build`), output directory (`dist`) and long-lived caching headers for assets. No extra configuration needed.

### Netlify

Import the repo and deploy. `netlify.toml` sets `npm run build` → `dist`, pins Node 20 and adds asset caching headers.

### Anywhere else

Run `npm run build` and serve the `dist/` folder from any static host. `base` is set to `./` so it works from any sub-path (e.g. GitHub Pages).

## Re-optimizing models

Optimized, web-ready assets live in `public/` (this is what ships). The original high-res source assets stay at the project root (`models/`, `textures/`, `hdri/`) and are **not** deployed. To regenerate the compressed GLBs:

```bash
npm run optimize:models
```

(Uses [`@gltf-transform/cli`](https://gltf-transform.dev) via `npx` — meshopt compression + WebP + texture resize.)

## Project structure

```
.
├── index.html            # markup, nav, HUD, narrative sections
├── src/
│   ├── main.js           # Three.js scene, post-fx, GSAP/Lenis choreography
│   └── style.css         # premium UI styling
├── public/               # web-ready static assets (served at /, deployed)
│   ├── models/           # meshopt-compressed GLB (~2 MB)
│   ├── textures/earth/   # Earth PBR maps
│   └── hdri/             # space environment map
├── models/               # original high-res source GLBs (not deployed)
├── textures/ · hdri/     # original source assets (not deployed)
├── vite.config.js
├── vercel.json
└── netlify.toml
```

## Credits

Earth textures, space HDRI and astronaut models are used for this demo experience. Built for the love of space.
