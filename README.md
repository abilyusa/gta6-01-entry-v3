# SOLMAR: Neon Heist — gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/abilyusa/gta6-01-entry-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/abilyusa/gta6-01-entry-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Entry for the make.fun competition [`gta6-01`](https://make.fun/bounty/gta6-01) — a GTA-style open-world browser game set in Solmar, a neon city that never sleeps. You play **Dario Vega**, a wheelman with one last night of jobs ahead of him.

## How to play

Open `index.html` in any modern browser (or serve the folder with any static server). Click **START ENGINE**.

## Controls

- **WASD / Arrow keys** — walk on foot, drive when in a car
- **E** — steal the nearest car / exit your car; hold **E** at the bank to crack the safe
- **Mouse click** — shoot (on foot only)
- **R** — restart after being busted or wasted

## The three jobs

1. **Neon Pickup** — steal a car, reach the pink marker, bring the package back to the garage (+$500).
2. **Getaway** — the heat is on: lose your wanted stars, then reach the yellow safehouse (+$800).
3. **The Big Score** — reach the bank, hold E to crack the safe while the cops close in, then escape to the yacht (+$5,000).

## Systems

- **Wanted stars (0–5):** carjacking, running people over, crashing and shooting all raise the heat. Stay out of police sight and the stars cool off one by one.
- **Police:** cop cars chase and ram you; foot cops chase and punch. A cop car touching you on foot means BUSTED. Losing all health means WASTED.
- **City:** a procedural neon grid with traffic, pedestrians, parked cars, palm trees and a live minimap.
- **Sound:** WebAudio engine hum, police sirens, gunshots, crashes and cash chimes — no audio files needed.

## Tech

Pure HTML5 Canvas + vanilla JavaScript + WebAudio. No assets, no dependencies, no build step. `game.js` is a single self-contained file (~800 lines).

## License

MIT — see `LICENSE`.
