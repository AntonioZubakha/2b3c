import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger } from './logger';

const app = express();
const PORT = process.env.PROXY_PORT || 3001;

/** When set, requests (except /health) must send this value in X-Proxy-Token or Authorization: Bearer. */
const PROXY_SECRET_TOKEN = process.env.PROXY_SECRET_TOKEN?.trim();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Proxy-Token');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (PROXY_SECRET_TOKEN) {
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/health/') {
      return next();
    }
    const headerToken = req.headers['x-proxy-token'];
    const fromHeader = typeof headerToken === 'string' ? headerToken : Array.isArray(headerToken) ? headerToken[0] : '';
    const auth = req.headers.authorization;
    const fromBearer =
      typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';
    const token = fromHeader || fromBearer;
    if (token !== PROXY_SECRET_TOKEN) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  });
}

const etherealProxy = createProxyMiddleware({
  target: 'https://etherealdiamond.com',
  changeOrigin: true,
  secure: true,
  timeout: 600000,
  proxyTimeout: 600000,
  onError: (err, req, res) => {
    logger.error('[PROXY] Proxy error', { path: req.url, message: err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy error', message: err.message });
    }
  },
  onProxyReq: (proxyReq, req) => {
    logger.debug('[PROXY] Outgoing', {
      host: proxyReq.getHeader('host'),
      path: proxyReq.path,
      method: proxyReq.method,
    });
  },
  onProxyRes: (proxyRes, req) => {
    logger.debug('[PROXY] Response', {
      status: proxyRes.statusCode,
      path: req.url,
      contentLength: proxyRes.headers['content-length'],
      contentType: proxyRes.headers['content-type'],
    });
  },
});

app.use('/', etherealProxy);

export const startProxyServer = () => {
  app.listen(PORT, () => {
    logger.info(`Proxy server started on port ${PORT}`);
    logger.info('Proxying requests to: https://etherealdiamond.com');
    if (PROXY_SECRET_TOKEN) {
      logger.info('[PROXY] X-Proxy-Token / Bearer authentication is enabled');
    }
  });
};

export default app;
