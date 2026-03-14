import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Proxy /api → internal backend (URL never exposed to browser)
app.use('/api', createProxyMiddleware({
  target: process.env.TRAININGS_BACKEND_URL || 'http://localhost:8000',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
}));

// Serve static Vite build
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback — all routes return index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 80;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Trainings frontend running on port ${PORT}`);
});
