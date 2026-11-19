#!/usr/bin/env node
/**
 * Servidor local para probar La Cesta sin dependencias.
 *
 * Uso:
 *   node tools/serve.mjs
 *   node tools/serve.mjs 8080
 *
 * También responde a /api/mercadona.php?action=catalog construyendo el
 * catálogo al vuelo (con caché de 12 horas en cache/mercadona-catalog.json),
 * para que el botón "Actualizar online" funcione en local.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { buildCatalog } from './catalog-builder.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_FILE = resolve(ROOT, 'cache', 'mercadona-catalog.json');
const CACHE_MAX_AGE = 12 * 60 * 60 * 1000;
const PORT = Number(process.argv[2] || process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function sendJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(body);
}

async function catalogResponse(response, force = false) {
  try {
    if (!force) {
      try {
        const info = await stat(CACHE_FILE);
        if (Date.now() - info.mtimeMs < CACHE_MAX_AGE) {
          const cached = await readFile(CACHE_FILE, 'utf8');
          response.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
          });
          response.end(cached);
          return;
        }
      } catch (error) {
        /* sin caché previa */
      }
    }

    console.log('  Construyendo catálogo desde la API de Mercadona…');
    const catalog = await buildCatalog({
      log: (message) => console.log(`  ${message}`),
      delayMs: 40,
    });
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(catalog), 'utf8');
    console.log(`  Catálogo listo: ${catalog.productos.length} productos.`);
    sendJson(response, 200, catalog);
  } catch (error) {
    console.error('  Error construyendo el catálogo:', error);
    sendJson(response, 502, { error: 'No se pudo construir el catálogo de Mercadona.' });
  }
}

async function serveStatic(request, response, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (error) {
    response.writeHead(400);
    response.end('Petición no válida');
    return;
  }

  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  let filePath = resolve(ROOT, relative);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
    response.writeHead(403);
    response.end('Prohibido');
    return;
  }

  try {
    let info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }
    if (!info.isFile()) throw new Error('No es un archivo');

    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(data);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No encontrado');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/mercadona.php') {
    if (url.searchParams.get('action') === 'catalog') {
      await catalogResponse(response, url.searchParams.get('force') === '1');
    } else {
      sendJson(response, 404, { error: 'Acción no encontrada.' });
    }
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Método no permitido');
    return;
  }

  if (request.method === 'HEAD') {
    response.writeHead(200);
    response.end();
    return;
  }

  await serveStatic(request, response, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  const addresses = [];
  const interfaces = networkInterfaces();
  Object.values(interfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    });
  });

  console.log('');
  console.log('  La Cesta — servidor local');
  console.log(`  Local:   http://localhost:${PORT}`);
  addresses.forEach((address) => console.log(`  Red:     http://${address}:${PORT}`));
  console.log('');
  console.log('  La instalación como PWA funciona en localhost (o con HTTPS).');
  console.log('  En el móvil, para instalarla, usa HTTPS o despliega la carpeta en tu servidor.');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya está en uso. Prueba: node tools/serve.mjs ${PORT + 1}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
