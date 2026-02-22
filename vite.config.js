import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'child_process'; // Import execSync

// Get Git commit hash
const commitHash = execSync('git rev-parse --short HEAD').toString().trim();

// Get build date/time
const buildDate = new Date().toLocaleString('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

export default defineConfig({
  base: './', // Use relative paths for deployment flexibility
  plugins: [viteSingleFile()],
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  build: {
    minify: false, // Optional: keep code readable for debugging if needed, but 'true' is better for file size
  },
});
