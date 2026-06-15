// Local Supabase proxy server
// PostgREST for database, runs on :54321
// This script provides a simple HTTP server that:
// 1. Proxies /rest/v1/* to PostgREST at :54321/*
// 2. Provides minimal auth endpoint responses

const http = require('http');

const POSTGREST_PORT = 54321;
const PROXY_PORT = 54320;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PROXY_PORT}`);
  const path = url.pathname;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth endpoints - return minimal responses
  if (path.startsWith('/auth/v1/')) {
    res.setHeader('Content-Type', 'application/json');
    if (path.includes('/user')) {
      res.writeHead(200);
      res.end(JSON.stringify({ id: 'local-dev', aud: 'authenticated', role: 'authenticated' }));
    } else {
      res.writeHead(200);
      res.end(JSON.stringify({}));
    }
    return;
  }

  // Proxy to PostgREST
  if (path.startsWith('/rest/v1')) {
    const restPath = path.replace('/rest/v1', '') + url.search;
    const options = {
      hostname: 'localhost',
      port: POSTGREST_PORT,
      path: restPath,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${POSTGREST_PORT}` },
    };
    
    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'PostgREST unavailable', detail: err.message }));
    });
    
    req.pipe(proxyReq);
    return;
  }

  // Health check
  if (path === '/health' || path === '/') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'local-supabase' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PROXY_PORT, () => {
  console.log(`Local Supabase proxy running on http://localhost:${PROXY_PORT}`);
  console.log(`PostgREST at http://localhost:${POSTGREST_PORT}`);
  console.log(`Client URL: http://localhost:${PROXY_PORT}`);
});
