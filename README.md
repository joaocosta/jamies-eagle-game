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

## Running Locally

Since this game uses ES6 modules, you need to run it via a local web server (to avoid CORS errors with local files).

### Using Python
If you have Python installed, run:
```bash
python3 -m http.server
```
Then open [http://localhost:8000](http://localhost:8000) in your browser.

### Using Node.js
If you have Node.js, you can install `http-server`:
```bash
npx http-server .
```
Then open the URL shown in the terminal.
