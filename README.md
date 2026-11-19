# La Cesta

Lista de la compra personal, mobile-first e instalable, con catálogo de Mercadona incluido. Todo se guarda en el propio navegador: no hay cuentas, servidor de usuarios ni sincronización en la nube.

## Funciones

- Lista de la compra con productos pendientes y comprados.
- Marcar productos como comprados, finalizar la compra y deshacer.
- CRUD de productos: nombre, categoría, foto, comentario, cantidad, unidad y fecha de la última compra.
- CRUD de categorías con emoji y color.
- Catálogo de Mercadona incluido: 4.395 productos y 26 categorías.
- Búsqueda y filtros por categoría en el catálogo.
- Añadir productos del catálogo a la lista, guardarlos o crear productos propios.
- Ajustes con exportación/importación JSON, reinicio de datos y actualización del catálogo.
- Diseño responsive, navegación inferior en móvil, iconos de carrito y colores corporativos.
- PWA instalable con funcionamiento offline después de la primera visita.
- Datos en IndexedDB; las fotos propias se reducen antes de guardarse.

## Requisitos

- Un navegador moderno con IndexedDB y JavaScript.
- Para probar por HTTP: Node.js 18 o superior, o cualquier servidor estático.
- Para instalar la PWA: servirla desde `localhost` o por HTTPS. En HTTP desde una IP de la red local el navegador no permite instalar ni usar el service worker.
- Opcional para la actualización online en producción: PHP 7.4+ con cURL y permiso de escritura en `cache/`.

## Inicio rápido

Desde la carpeta `la-cesta`:

```powershell
node tools/serve.mjs
```

Abre <http://localhost:5173>. El servidor no tiene dependencias y también responde a:

```text
http://localhost:5173/api/mercadona.php?action=catalog
```

Para cambiar el puerto:

```powershell
node tools/serve.mjs 8080
```

También puedes usar otro servidor estático, por ejemplo:

```powershell
python -m http.server 5173
```

o, si tienes PHP:

```powershell
php -S localhost:5173
```

> No abras `index.html` con doble clic (`file://`). El navegador bloquea IndexedDB y el service worker en ese contexto. Usa siempre HTTP o HTTPS.

## Instalación como app

### Android / Chrome / Edge

1. Abre la app en `localhost` o HTTPS.
2. Espera a que cargue y usa el menú del navegador → **Instalar aplicación** (o el botón de instalación de los Ajustes).
3. En algunos navegadores el aviso de instalación aparece tras la primera visita y una recarga.

### iPhone / iPad

1. Abre la app en Safari.
2. Comparte → **Añadir a pantalla de inicio**.

La app avisa de las actualizaciones del service worker. Si cambias archivos estáticos, sube la versión de caché en `sw.js`:

```js
const VERSION = 'lacesta-v1.0.1';
```

## Uso

- **Lista**: añade productos con el botón flotante, marca el círculo de un producto para comprarlo y usa **Finalizar compra** para archivar los comprados. El aviso permite deshacer.
- **Productos**: busca, filtra, abre la ficha, edita, cambia la foto o elimina. El botón de la esquina añade o quita el producto de la lista.
- **Catálogo**: busca por nombre, filtra por categoría y añade un producto con el botón `+`. Si ya está en la lista, el botón se marca como **En la lista**.
- **Categorías**: crea, edita y elimina categorías. Si eliminas una, sus productos aparecen como **Sin categoría**.
- **Ajustes** (icono de rueda): exportar copia de seguridad, importar JSON, reinstalar catálogo completo, sincronizar categorías, actualizar el catálogo online y borrar todos los datos.

La fecha de última compra se rellena al marcar el producto como comprado. Si nunca se ha comprado, se muestra la fecha de alta.

## Catálogo de Mercadona

El catálogo incluido está en:

- `data/catalog.js`: lo carga la aplicación (`window.MERCADONA_CATALOG`).
- `data/catalog.json`: misma información en JSON, útil para revisiones o para otros usos.

Para regenerarlo desde la API pública de Mercadona:

```powershell
node tools/update-catalog.mjs
```

El comando descarga categorías y subcategorías, normaliza productos, actualiza ambos archivos y la fecha `actualizado`. Necesita conexión a Internet y tarda unos segundos.

### Actualización online desde la app

La opción **Actualizar catálogo** de los Ajustes hace una petición a `api/mercadona.php?action=catalog`.

- **Con el servidor Node**: la ruta está implementada y usa una caché de 12 horas en `cache/`.
- **Con PHP**: `api/mercadona.php` descarga el catálogo con cURL, lo guarda en `cache/mercadona-catalog.json` durante 12 horas y lo devuelve.
- **Sin backend**: la app sigue funcionando con el catálogo incluido; solo falla la actualización online.

El catálogo es informativo: no incluye precios ni stock y puede cambiar en Mercadona. La app no está afiliada a Mercadona; usa datos públicos de su tienda online para uso personal.

### Sincronizar categorías

Si el catálogo incorpora categorías nuevas, **Ajustes → Sincronizar categorías** las añade sin borrar las tuyas. Los productos del catálogo usan identificadores `mc-<id>` para relacionarse con esas categorías.

## Datos y copias de seguridad

- Base de datos local: IndexedDB `la-cesta`, almacenes `products`, `categories` y `meta`.
- Los datos son por navegador y perfil. No se sincronizan entre dispositivos.
- El modo privado/incógnito puede borrar los datos al cerrar.
- **Exportar** descarga un JSON con productos, categorías y metadatos.
- **Importar** reemplaza los datos actuales por los del JSON. Haz una exportación antes de importar.
- Las fotos de productos propios se reducen a un máximo de 900 px y se guardan como JPEG dentro del propio registro.
- Las fotos del catálogo se intentan cachear en local; si la descarga falla, se usa la URL remota.

## Despliegue en un servidor o en Joomla

1. Copia la carpeta `la-cesta` completa en el servidor, por ejemplo en `public_html/la-cesta/`.
2. Comprueba que se puede abrir `https://tu-dominio/la-cesta/`.
3. Conserva `.htaccess` si usas Apache: declara el tipo MIME de `.webmanifest` y evita cachear en exceso `sw.js` y `manifest.webmanifest`.
4. Si usas la actualización online, verifica que `api/mercadona.php` se ejecuta y que la carpeta `cache/` es escribible por PHP.
5. Si Joomla intercepta las rutas, excluye `la-cesta/` de las reglas de reescritura o publica la app en un subdominio independiente.

La app usa rutas relativas, así que funciona tanto en la raíz como en un subdirectorio. El service worker se registra con el ámbito de la carpeta desde la que se sirve.

### Seguridad y privacidad

- Los datos personales de la lista no salen del navegador.
- El proxy de catálogo no requiere autenticación y solo devuelve datos públicos. Si lo publicas en abierto, considera limitar el acceso o añadir un rate limit en el servidor.
- No hay analíticas ni cookies de terceros.

## Estructura

```text
la-cesta/
├─ index.html
├─ manifest.webmanifest
├─ sw.js
├─ .htaccess
├─ css/
│  └─ app.css
├─ js/
│  ├─ utils.js
│  ├─ db.js
│  └─ app.js
├─ data/
│  ├─ catalog.js
│  └─ catalog.json
├─ icons/
│  └─ icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png, favicon-32.png
├─ api/
│  └─ mercadona.php
└─ tools/
   ├─ serve.mjs
   ├─ catalog-builder.mjs
   ├─ update-catalog.mjs
   └─ make-icons.ps1
```

## Comprobaciones de desarrollo

```powershell
node --check js/app.js
node --check js/utils.js
node --check js/db.js
node --check sw.js
node --check tools/serve.mjs
node --check tools/catalog-builder.mjs
node --check tools/update-catalog.mjs
```

Si tienes PHP:

```powershell
php -l api/mercadona.php
```

Prueba manual recomendada:

1. Añadir un producto propio con foto, cantidad y categoría.
2. Marcarlo como comprado, finalizar la compra y deshacer.
3. Buscar en el catálogo, añadir un producto y abrir su ficha.
4. Crear una categoría y asignarla a un producto.
5. Exportar, borrar datos e importar la copia.
6. Reducir la ventana a tamaño móvil y comprobar la navegación inferior.
7. Recargar sin conexión después de la primera visita.
8. Instalar la PWA desde `localhost` o HTTPS.

## Problemas frecuentes

**La página aparece en blanco o no guarda datos**  
Abre la consola del navegador. Comprueba que estás usando `http://localhost` o HTTPS y no `file://`.

**El catálogo no carga**  
Verifica que `data/catalog.js` existe y que `window.MERCADONA_CATALOG` aparece en la consola. Si lo regeneraste, ejecuta `node tools/update-catalog.mjs`.

**La actualización online falla**  
Con Node, comprueba que `node tools/serve.mjs` sigue ejecutándose. Con PHP, revisa cURL, `allow_url_fopen` y los permisos de `cache/`. Sin backend, usa el catálogo incluido.

**No aparece la opción de instalar**  
La PWA necesita `localhost` o HTTPS, manifest válido, iconos y service worker. Recarga tras la primera visita y revisa la pestaña Application de DevTools.

**Veo una versión antigua**  
Sube `VERSION` en `sw.js`, recarga y acepta la actualización. Como alternativa, borra los datos del sitio desde DevTools → Application.

**Una categoría no aparece**  
Usa **Ajustes → Sincronizar categorías** para volver a crearla desde el catálogo. No se borran las categorías propias.
