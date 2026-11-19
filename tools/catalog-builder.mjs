/**
 * Constructor del catálogo de Mercadona a partir de su API pública.
 * Lo usan tanto el script de actualización como el servidor local.
 */

const API = 'https://tienda.mercadona.es/api';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'LaCesta/1.0 (aplicación personal de lista de la compra)',
};

export const CATEGORY_META = {
  'Aceite, especias y salsas': ['🫒', '#7cb342'],
  'Agua y refrescos': ['💧', '#29b6f6'],
  Aperitivos: ['🥨', '#f59e0b'],
  'Arroz, legumbres y pasta': ['🍚', '#d4a373'],
  'Azúcar, caramelos y chocolate': ['🍫', '#8d6e63'],
  Bebé: ['👶', '#f8bbd0'],
  Bodega: ['🍷', '#8e244d'],
  'Cacao, café e infusiones': ['☕', '#6d4c41'],
  Carne: ['🥩', '#e57373'],
  'Cereales y galletas': ['🥣', '#c0a060'],
  'Charcutería y quesos': ['🧀', '#fbc02d'],
  Congelados: ['❄️', '#4fc3f7'],
  'Conservas, caldos y cremas': ['🥫', '#ef8354'],
  'Cuidado del cabello': ['🧴', '#9575cd'],
  'Cuidado facial y corporal': ['🧼', '#4db6ac'],
  'Fitoterapia y parafarmacia': ['💊', '#66bb6a'],
  'Fruta y verdura': ['🥦', '#43a047'],
  'Huevos, leche y mantequilla': ['🥚', '#fdd835'],
  'Limpieza y hogar': ['🧽', '#26a69a'],
  Maquillaje: ['💄', '#ec407a'],
  'Marisco y pescado': ['🐟', '#42a5f5'],
  Mascotas: ['🐾', '#a1887f'],
  'Panadería y pastelería': ['🥖', '#d7a86e'],
  'Pizzas y platos preparados': ['🍕', '#ff7043'],
  'Postres y yogures': ['🍦', '#ba68c8'],
  Zumos: ['🧃', '#ffa726'],
};

const UNIT_MAP = {
  l: 'L',
  ml: 'ml',
  cl: 'ml',
  kg: 'kg',
  g: 'g',
  ud: 'ud',
  u: 'ud',
  unidad: 'ud',
  unidades: 'ud',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, attempt = 1) {
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (attempt < 3) {
      await sleep(500 * attempt);
      return getJson(url, attempt + 1);
    }
    throw error;
  }
}

function clean(value) {
  if (typeof value !== 'string') return value ?? null;
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeUnit(product) {
  const info = product.price_instructions || {};
  const raw = String(info.size_format || '').toLowerCase();
  const unit = UNIT_MAP[raw] || 'ud';
  let amount = Number(info.unit_size);
  if (!Number.isFinite(amount) || amount <= 0) amount = 1;
  amount = Math.round(amount * 100) / 100;
  return { cantidad: amount, unidad: unit };
}

function normalizeProduct(product, categoryId, subcategoryName) {
  const { cantidad, unidad } = normalizeUnit(product);
  return {
    id: String(product.id),
    nombre: clean(product.display_name) || 'Producto de Mercadona',
    categoriaId: categoryId,
    subcategoria: clean(subcategoryName) || '',
    foto: product.thumbnail || '',
    cantidad,
    unidad,
    envase: clean(product.packaging) || '',
  };
}

/**
 * Descarga el catálogo completo y lo devuelve como objeto serializable.
 * @param {{ log?: (message: string) => void, delayMs?: number }} options
 */
export async function buildCatalog(options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 60;

  log('Leyendo categorías de Mercadona…');
  const tree = await getJson(`${API}/categories/`);
  const topCategories = (tree.results || []).slice().sort((a, b) => a.order - b.order);

  const categorias = [];
  const productos = [];
  const seenProducts = new Set();
  const subcategories = [];

  for (const top of topCategories) {
    const [emoji, color] = CATEGORY_META[top.name] || ['🛒', '#2e7d32'];
    const categoryId = `mc-${top.id}`;
    categorias.push({
      id: categoryId,
      nombre: clean(top.name),
      emoji,
      color,
      orden: top.order,
    });
    for (const sub of top.categories || []) {
      subcategories.push({ id: sub.id, name: clean(sub.name), categoryId });
    }
  }

  log(`${categorias.length} categorías y ${subcategories.length} subcategorías.`);

  let index = 0;
  for (const sub of subcategories) {
    index += 1;
    if (index % 10 === 0 || index === 1) log(`Descargando productos ${index}/${subcategories.length}…`);
    try {
      const data = await getJson(`${API}/categories/${sub.id}/`);
      const blocks = data.categories || [];
      for (const block of blocks) {
        for (const product of block.products || []) {
          if (!product || !product.id || seenProducts.has(String(product.id))) continue;
          if (product.published === false) continue;
          seenProducts.add(String(product.id));
          productos.push(normalizeProduct(product, sub.categoryId, block.name || sub.name));
        }
      }
    } catch (error) {
      log(`No se pudo leer "${sub.name}" (${sub.id}): ${error.message}`);
    }
    if (delayMs) await sleep(delayMs);
  }

  productos.sort((a, b) => {
    const catA = categorias.findIndex((category) => category.id === a.categoriaId);
    const catB = categorias.findIndex((category) => category.id === b.categoriaId);
    return catA - catB || a.nombre.localeCompare(b.nombre, 'es');
  });

  return {
    fuente: 'https://tienda.mercadona.es/api/',
    actualizado: new Date().toISOString(),
    categorias,
    productos,
  };
}
