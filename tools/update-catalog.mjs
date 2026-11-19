#!/usr/bin/env node
/**
 * Actualiza el catálogo de La Cesta desde la API pública de Mercadona.
 *
 * Uso:
 *   node tools/update-catalog.mjs
 *
 * Genera:
 *   data/catalog.js   (cargado por la app; funciona también con file://)
 *   data/catalog.json (copia en JSON, útil para otros usos)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from './catalog-builder.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const catalog = await buildCatalog({ log: (message) => console.log(message) });

  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  const json = JSON.stringify(catalog);
  const banner = `/* Catálogo generado automáticamente desde la API pública de Mercadona.
   Fecha: ${catalog.actualizado}
   No editar a mano: ejecuta "node tools/update-catalog.mjs" para actualizarlo. */
`;
  await writeFile(resolve(ROOT, 'data', 'catalog.js'), `${banner}window.MERCADONA_CATALOG = ${json};\n`, 'utf8');
  await writeFile(resolve(ROOT, 'data', 'catalog.json'), JSON.stringify(catalog, null, 2), 'utf8');

  const size = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  console.log(`\n✓ Catálogo listo: ${catalog.productos.length} productos, ${catalog.categorias.length} categorías (${size} MB).`);
  console.log(`  ${resolve(ROOT, 'data', 'catalog.js')}`);
}

main().catch((error) => {
  console.error('\n✗ Error actualizando el catálogo:', error);
  process.exitCode = 1;
});
