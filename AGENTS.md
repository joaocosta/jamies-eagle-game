# Jamie's Eagle Game - AGENTS.md

## Project Overview
This is a 3D flying game where the player controls an eagle to fly through hoops and avoid obstacles.
- **Type:** Browser-based 3D Game
- **Engine:** Three.js (v0.160.0)
- **Language:** Vanilla JavaScript (ES6 Modules)
- **Build System:** Vite (bundled with `vite-plugin-singlefile`)

## Tech Stack & Dependencies
- **Three.js:** Installed via npm (`npm install three`).
- **Audio:** Web Audio API (Native). No external audio files; all sound is procedurally generated.
- **Physics:** Simple bounding box/sphere collision detection (custom implementation).

## Coding Style Guidelines

### General
- **Simplicity:** Code must be beginner-friendly. Avoid complex one-liners or obscure ES6 features if a simpler alternative exists.
- **Documentation:** **Every function must have a JSDoc comment** explaining what it does, its parameters, and return value.
- **Formatting:** 4 spaces for indentation. Semicolons are required.

### Naming Conventions
- **Variables & Functions:** `camelCase` (e.g., `createEagle`, `playerSpeed`).
- **Constants:** `UPPER_CASE` (e.g., `CONFIG.PLAYER_SPEED_MAX`).
- **Classes:** `PascalCase` (e.g., `AudioController`).
- **File Names:** `kebab-case` or `snake_case` (currently `game.js`, `audio.js`).

### Architecture Patterns

#### 1. Game Logic (`game.js`)
- **Pattern:** Functional / Procedural.
- **State:** Use a single global `state` object for mutable data (score, speed, flags).
- **Config:** Use a `CONFIG` object for tuning constants.
- **Loop:** Use `requestAnimationFrame` recursively in an `animate()` function.
- **DOM:** Update UI elements directly using `document.getElementById('id').innerText = ...`.

#### 2. Audio Logic (`audio.js`)
- **Pattern:** Object-Oriented.
- **Structure:** Encapsulate audio logic within the `AudioController` class.
- **Method:** Use procedural generation (Oscillators) rather than loading MP3/WAV files.

### Specific Rules for AI Agents
1.  **Build Tools:** Use `npm run dev` to serve the game, and `npm run build` to create a standalone HTML file.
2.  **Three.js Version:** Stick to v0.160.0 syntax. Do not use deprecated features (like `Geometry` - use `BufferGeometry` primitives which are standard in modern Three.js).
3.  **Imports:** Always use the full relative path for local imports (e.g., `import ... from './audio.js';`) including the `.js` extension.
4.  **Assets:** Prefer creating geometry programmatically (Box, Sphere, Cone) over loading external 3D models (GLTF/OBJ) to keep the project self-contained.

## Common Commands
To develop the game locally:
```bash
# Start development server
npm run dev

# Build for production
npm run build
```
