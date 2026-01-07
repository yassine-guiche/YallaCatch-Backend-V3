/**
 * Simple Proxy Server for Vite
 * Contourne la limitation de allowedHosts de Vite
 */

import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({
  target: 'http://localhost:5173',
  ws: true,
  changeOrigin: true,
});

const server = http.createServer((req, res) => {
  // Ajouter les headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  proxy.web(req, res, (err) => {
    if (err) {
      console.error('Proxy error:', err);
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  });
});

// Gérer les WebSocket pour HMR
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Proxy server running on http://0.0.0.0:${PORT}`);
  console.log(`🔗 Forwarding to Vite on http://localhost:5173`);
});

