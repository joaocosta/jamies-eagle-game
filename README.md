# Eagle Rider

A 3D flying game where you control an eagle, fly through hoops, and avoid obstacles.

## How to Play
1. Open the game in a browser.
2. Click "Start Game".
3. Use **Arrow Keys** or **WASD** to steer.
4. Hold **Space** to fly faster.
5. Fly through the golden hoops to score points.
6. Avoid walls, fans, and swinging logs.
7. Don't miss 3 hoops or crash!

## Building and Running Locally

This game uses Vite to bundle all code and assets into a single HTML file that can be run directly without a web server.

### Prerequisites
You need Node.js installed.

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the single-file game:
   ```bash
   npm run build
   ```

3. Run the game:
   Open `dist/index.html` in your web browser. You can double-click the file in your file explorer. No web server is required.

### Development
To develop with live reloading:
```bash
npx vite
```
This will start a local development server at http://localhost:5173.
