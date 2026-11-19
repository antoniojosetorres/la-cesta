<?php
/**
 * Proxy de actualización del catálogo de Mercadona para La Cesta.
 *
 * Uso: /api/mercadona.php?action=catalog
 *
 * Descarga el catálogo desde la API pública de Mercadona en el servidor
 * (evitando el bloqueo CORS del navegador), lo cachea 12 horas y lo devuelve
 * en el mismo formato que data/catalog.json.
 *
 * Requiere PHP 7.4+ con cURL (recomendado) o allow_url_fopen.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Access-Control-Allow-Origin: *');

const API = 'https://tienda.mercadona.es/api';
const CACHE_TTL = 43200; // 12 horas

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
if ($action !== 'catalog') {
    http_response_code(404);
    echo json_encode(['error' => 'Acción no encontrada.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$cacheDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'cache';
$cacheFile = $cacheDir . DIRECTORY_SEPARATOR . 'mercadona-catalog.json';

if (is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < CACHE_TTL) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false && $cached !== '') {
        echo $cached;
        exit;
    }
}

@set_time_limit(180);
ignore_user_abort(true);

try {
    $catalog = build_catalog();
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0775, true);
    }
    $json = json_encode($catalog, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('No se pudo serializar el catálogo.');
    }
    @file_put_contents($cacheFile, $json, LOCK_EX);
    echo $json;
} catch (Throwable $error) {
    http_response_code(502);
    echo json_encode(
        ['error' => 'No se pudo construir el catálogo de Mercadona.', 'detail' => $error->getMessage()],
        JSON_UNESCAPED_UNICODE
    );
}

function build_catalog(): array
{
    $categoryMeta = [
        'Aceite, especias y salsas' => ['🫒', '#7cb342'],
        'Agua y refrescos' => ['💧', '#29b6f6'],
        'Aperitivos' => ['🥨', '#f59e0b'],
        'Arroz, legumbres y pasta' => ['🍚', '#d4a373'],
        'Azúcar, caramelos y chocolate' => ['🍫', '#8d6e63'],
        'Bebé' => ['👶', '#f8bbd0'],
        'Bodega' => ['🍷', '#8e244d'],
        'Cacao, café e infusiones' => ['☕', '#6d4c41'],
        'Carne' => ['🥩', '#e57373'],
        'Cereales y galletas' => ['🥣', '#c0a060'],
        'Charcutería y quesos' => ['🧀', '#fbc02d'],
        'Congelados' => ['❄️', '#4fc3f7'],
        'Conservas, caldos y cremas' => ['🥫', '#ef8354'],
        'Cuidado del cabello' => ['🧴', '#9575cd'],
        'Cuidado facial y corporal' => ['🧼', '#4db6ac'],
        'Fitoterapia y parafarmacia' => ['💊', '#66bb6a'],
        'Fruta y verdura' => ['🥦', '#43a047'],
        'Huevos, leche y mantequilla' => ['🥚', '#fdd835'],
        'Limpieza y hogar' => ['🧽', '#26a69a'],
        'Maquillaje' => ['💄', '#ec407a'],
        'Marisco y pescado' => ['🐟', '#42a5f5'],
        'Mascotas' => ['🐾', '#a1887f'],
        'Panadería y pastelería' => ['🥖', '#d7a86e'],
        'Pizzas y platos preparados' => ['🍕', '#ff7043'],
        'Postres y yogures' => ['🍦', '#ba68c8'],
        'Zumos' => ['🧃', '#ffa726'],
    ];

    $unitMap = [
        'l' => 'L',
        'ml' => 'ml',
        'cl' => 'ml',
        'kg' => 'kg',
        'g' => 'g',
        'ud' => 'ud',
        'u' => 'ud',
        'unidad' => 'ud',
        'unidades' => 'ud',
    ];

    $tree = fetch_json(API . '/categories/');
    if (!isset($tree['results']) || !is_array($tree['results'])) {
        throw new RuntimeException('Respuesta de categorías no válida.');
    }

    $topCategories = $tree['results'];
    usort($topCategories, static function ($a, $b) {
        return ((int) ($a['order'] ?? 0)) <=> ((int) ($b['order'] ?? 0));
    });

    $categories = [];
    $subcategories = [];
    foreach ($topCategories as $top) {
        $name = clean_text($top['name'] ?? '');
        if ($name === '') {
            continue;
        }
        $categoryId = 'mc-' . (string) ($top['id'] ?? '');
        $meta = $categoryMeta[$name] ?? ['🛒', '#2e7d32'];
        $categories[] = [
            'id' => $categoryId,
            'nombre' => $name,
            'emoji' => $meta[0],
            'color' => $meta[1],
            'orden' => (int) ($top['order'] ?? 0),
        ];
        foreach (($top['categories'] ?? []) as $sub) {
            $subcategories[] = [
                'id' => (int) ($sub['id'] ?? 0),
                'name' => clean_text($sub['name'] ?? ''),
                'categoryId' => $categoryId,
            ];
        }
    }

    $urls = [];
    foreach ($subcategories as $index => $sub) {
        if ($sub['id'] > 0) {
            $urls[$index] = API . '/categories/' . $sub['id'] . '/';
        }
    }

    $responses = fetch_many($urls);
    $products = [];
    $seen = [];

    foreach ($subcategories as $index => $sub) {
        if (!isset($responses[$index])) {
            continue;
        }
        $data = json_decode($responses[$index], true);
        if (!is_array($data)) {
            continue;
        }
        foreach (($data['categories'] ?? []) as $block) {
            $subcategoryName = clean_text($block['name'] ?? $sub['name']);
            foreach (($block['products'] ?? []) as $product) {
                if (!is_array($product) || empty($product['id'])) {
                    continue;
                }
                if (isset($product['published']) && $product['published'] === false) {
                    continue;
                }
                $id = (string) $product['id'];
                if (isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;

                $info = isset($product['price_instructions']) && is_array($product['price_instructions'])
                    ? $product['price_instructions']
                    : [];
                $format = strtolower((string) ($info['size_format'] ?? ''));
                $unit = $unitMap[$format] ?? 'ud';
                $amount = isset($info['unit_size']) ? (float) $info['unit_size'] : 1.0;
                if ($amount <= 0) {
                    $amount = 1.0;
                }
                $amount = round($amount, 2);

                $products[] = [
                    'id' => $id,
                    'nombre' => clean_text($product['display_name'] ?? 'Producto de Mercadona'),
                    'categoriaId' => $sub['categoryId'],
                    'subcategoria' => $subcategoryName,
                    'foto' => (string) ($product['thumbnail'] ?? ''),
                    'cantidad' => $amount,
                    'unidad' => $unit,
                    'envase' => clean_text($product['packaging'] ?? ''),
                ];
            }
        }
    }

    $categoryOrder = [];
    foreach ($categories as $index => $category) {
        $categoryOrder[$category['id']] = $index;
    }
    usort($products, static function ($a, $b) use ($categoryOrder) {
        $orderA = $categoryOrder[$a['categoriaId']] ?? 9999;
        $orderB = $categoryOrder[$b['categoriaId']] ?? 9999;
        if ($orderA !== $orderB) {
            return $orderA <=> $orderB;
        }
        return strcasecmp($a['nombre'], $b['nombre']);
    });

    return [
        'fuente' => API . '/',
        'actualizado' => gmdate('c'),
        'categorias' => $categories,
        'productos' => $products,
    ];
}

function clean_text($value): string
{
    if (!is_string($value)) {
        return '';
    }
    $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $value = preg_replace('/\s+/u', ' ', $value);
    return trim((string) $value);
}

function fetch_json(string $url): array
{
    $body = fetch_url($url);
    $data = json_decode($body, true);
    if (!is_array($data)) {
        throw new RuntimeException('Respuesta JSON no válida de Mercadona.');
    }
    return $data;
}

function fetch_url(string $url): string
{
    $headers = [
        'Accept: application/json',
        'User-Agent: LaCesta/1.0 (aplicación personal de lista de la compra)',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_ENCODING => '',
        ]);
        $body = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($body === false || $code >= 400) {
            throw new RuntimeException('Error descargando Mercadona: ' . ($error !== '' ? $error : 'HTTP ' . $code));
        }
        return (string) $body;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => implode("\r\n", $headers),
            'timeout' => 60,
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        throw new RuntimeException('No se pudo descargar el catálogo (cURL no disponible).');
    }
    return $body;
}

/**
 * Descarga varias URLs con cURL en paralelo (máx. 8 a la vez).
 * Si no hay cURL, las descarga secuencialmente.
 *
 * @param array<int, string> $urls
 * @return array<int, string>
 */
function fetch_many(array $urls): array
{
    if (!function_exists('curl_multi_init')) {
        $results = [];
        foreach ($urls as $key => $url) {
            try {
                $results[$key] = fetch_url($url);
            } catch (Throwable $error) {
                // Se omite la subcategoría que falle.
            }
        }
        return $results;
    }

    $results = [];
    $total = count($urls);
    $headers = [
        'Accept: application/json',
        'User-Agent: LaCesta/1.0 (aplicación personal de lista de la compra)',
    ];

    for ($offset = 0; $offset < $total; $offset += 8) {
        $batch = array_slice($urls, $offset, 8, true);
        $multi = curl_multi_init();
        $handles = [];

        foreach ($batch as $key => $url) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_CONNECTTIMEOUT => 15,
                CURLOPT_TIMEOUT => 60,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_ENCODING => '',
            ]);
            curl_multi_add_handle($multi, $ch);
            $handles[$key] = $ch;
        }

        do {
            $status = curl_multi_exec($multi, $active);
            if ($active) {
                curl_multi_select($multi, 0.3);
            }
        } while ($active && $status === CURLM_OK);

        foreach ($handles as $key => $ch) {
            $body = curl_multi_getcontent($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            if ($body !== false && $code === 200) {
                $results[$key] = (string) $body;
            }
            curl_multi_remove_handle($multi, $ch);
            curl_close($ch);
        }
        curl_multi_close($multi);
    }

    return $results;
}
