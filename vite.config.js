import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    minify: false, // Optional: keep code readable for debugging if needed, but 'true' is better for file size
  },
});
