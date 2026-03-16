import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all envs instead of just those starting with `VITE_`.
  const env = loadEnv(mode, process.cwd(), '');

  const parseBackendUrl = () => {
    const configured = process.env.TRAININGS_BACKEND_URL?.trim();
    if (!configured) return 'http://localhost:8000';
    if (!/^https?:\/\//i.test(configured)) return 'http://localhost:8000';
    return configured.replace(/\/+$/, '');
  };

  const backendUrl = parseBackendUrl();

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        },
        '/uploads': {
          target: backendUrl,
          changeOrigin: true,
        }
      }
    },
  };
})
