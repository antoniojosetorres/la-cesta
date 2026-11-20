/* La Cesta — lógica de la aplicación */
(function () {
  'use strict';

  const U = window.CestaUtils;
  const DB = window.CestaDB;
  const COLLATOR = new Intl.Collator('es', { sensitivity: 'base' });
  const VIEWS = ['lista', 'productos', 'catalogo', 'categorias'];
  const TITLES = {
    lista: 'Mi lista',
    productos: 'Mis productos',
    catalogo: 'Catálogo Mercadona',
    categorias: 'Categorías',
  };

  const UNIDADES = [
    'ud',
    'kg',
    'g',
    'L',
    'ml',
    'paquete',
    'bolsa',
    'bandeja',
    'bote',
    'lata',
    'botella',
    'caja',
    'docena',
    'mazo',
  ];

  const FALLBACK_CATEGORIES = [
    { id: 'cat-frutas', nombre: 'Fruta y verdura', emoji: '🥦', color: '#43a047', orden: 1 },
    { id: 'cat-lacteos', nombre: 'Lácteos y huevos', emoji: '🥛', color: '#fdd835', orden: 2 },
    { id: 'cat-carne', nombre: 'Carne y pescado', emoji: '🥩', color: '#e57373', orden: 3 },
    { id: 'cat-pan', nombre: 'Panadería', emoji: '🥖', color: '#d7a86e', orden: 4 },
    { id: 'cat-despensa', nombre: 'Despensa', emoji: '🥫', color: '#ef8354', orden: 5 },
    { id: 'cat-bebidas', nombre: 'Bebidas', emoji: '🥤', color: '#29b6f6', orden: 6 },
    { id: 'cat-limpieza', nombre: 'Limpieza y hogar', emoji: '🧽', color: '#26a69a', orden: 7 },
    { id: 'cat-otros', nombre: 'Otros', emoji: '🛒', color: '#8a9a90', orden: 8 },
  ];

  const state = {
    view: 'lista',
    products: [],
    categories: [],
    byId: new Map(),
    byCatalogo: new Map(),
    catMap: new Map(),
    categoryOrder: new Map(),
    catalog: { categorias: [], productos: [], actualizado: null, fuente: '' },
    catalogCatMap: new Map(),
    catalogSearch: new Map(),
    catalogCounts: new Map(),
    catalogSource: 'fallback',
    filters: {
      products: { q: '', cat: '', status: 'todos', sort: 'nombre', limit: 60 },
      catalog: { q: '', cat: '', limit: 60 },
    },
    editingProductId: null,
    editingCategoryId: null,
    tempPhoto: '',
    categoryFromProduct: false,
    installPrompt: null,
    swUpdateRequested: false,
  };

  let els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    cacheEls();
    bindEvents();
    state.view = getRoute();

    try {
      await loadCatalogFromStorage();
      await loadAll();
      await seedIfNeeded();
      await loadAll();
    } catch (error) {
      console.error(error);
      renderFatal(error);
      return;
    }

    render();
    updateInstallUI();
    registerServiceWorker();
    requestPersistence();
  }

  /* ------------------------------------------------------------------ */
  /* Referencias y eventos                                              */
  /* ------------------------------------------------------------------ */

  function cacheEls() {
    els = {
      app: document.getElementById('app'),
      fab: document.getElementById('fab'),
      navBadge: document.getElementById('nav-badge'),
      installBtn: document.getElementById('install-btn'),
      productDialog: document.getElementById('product-dialog'),
      productForm: document.getElementById('product-form'),
      productFormTitle: document.getElementById('product-form-title'),
      productFormEyebrow: document.getElementById('product-form-eyebrow'),
      productCategory: document.getElementById('product-category'),
      productUnit: document.getElementById('product-unit'),
      fechaHelp: document.getElementById('fecha-help'),
      photoPreview: document.getElementById('photo-preview'),
      photoPreviewImg: document.getElementById('photo-preview-img'),
      photoPlaceholder: document.getElementById('photo-placeholder'),
      photoPick: document.getElementById('photo-pick'),
      photoRemove: document.getElementById('photo-remove'),
      photoInput: document.getElementById('photo-input'),
      categoryDialog: document.getElementById('category-dialog'),
      categoryForm: document.getElementById('category-form'),
      categoryFormTitle: document.getElementById('category-form-title'),
      categoryFormEyebrow: document.getElementById('category-form-eyebrow'),
      detailDialog: document.getElementById('detail-dialog'),
      detailContent: document.getElementById('detail-content'),
      confirmDialog: document.getElementById('confirm-dialog'),
      confirmTitle: document.getElementById('confirm-title'),
      confirmMessage: document.getElementById('confirm-message'),
      confirmAccept: document.getElementById('confirm-accept'),
      confirmIcon: document.getElementById('confirm-icon'),
      settingsDialog: document.getElementById('settings-dialog'),
      settingsContent: document.getElementById('settings-content'),
      importInput: document.getElementById('import-input'),
      toastWrap: document.getElementById('toast-wrap'),
    };
  }

  function bindEvents() {
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    window.addEventListener('hashchange', handleHashChange);

    els.productForm.addEventListener('submit', handleProductSubmit);
    els.categoryForm.addEventListener('submit', handleCategorySubmit);

    els.photoPick.addEventListener('click', () => els.photoInput.click());
    els.photoPreview.addEventListener('click', () => els.photoInput.click());
    els.photoInput.addEventListener('change', handlePhotoChange);
    els.photoRemove.addEventListener('click', () => {
      state.tempPhoto = '';
      updatePhotoPreview();
    });
    els.photoPreviewImg.addEventListener('error', () => {
      els.photoPreviewImg.hidden = true;
      els.photoPlaceholder.hidden = false;
    });

    els.importInput.addEventListener('change', handleImportFile);

    [els.productDialog, els.categoryDialog, els.detailDialog, els.settingsDialog, els.confirmDialog].forEach((dialog) => {
      if (!dialog) return;
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    els.productDialog.addEventListener('close', () => {
      state.editingProductId = null;
      state.tempPhoto = '';
    });
    els.categoryDialog.addEventListener('close', () => {
      state.editingCategoryId = null;
      state.categoryFromProduct = false;
    });

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.installPrompt = event;
      updateInstallUI();
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      updateInstallUI();
      toast('La Cesta se ha instalado. Ya puedes abrirla desde tu pantalla de inicio.');
    });
  }

  async function handleDocumentClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const emojiButton = target.closest('[data-emoji]');
    if (emojiButton) {
      const emojiField = els.categoryForm.elements.namedItem('emoji');
      if (emojiField) emojiField.value = emojiButton.dataset.emoji || '🛒';
      return;
    }

    const actionEl = target.closest('[data-action]');
    if (!actionEl) return;
    if (actionEl.disabled) return;

    event.preventDefault();
    try {
      await handleAction(actionEl.dataset.action, actionEl);
    } catch (error) {
      console.error(error);
      toast(error && error.message ? error.message : 'Ha ocurrido un error. Inténtalo de nuevo.');
    }
  }

  async function handleAction(action, element) {
    switch (action) {
      case 'new-product':
        openProductForm(null);
        break;
      case 'open-detail':
        openProductDetail(element.dataset.id);
        break;
      case 'edit-product': {
        const product = findProduct(element.dataset.id);
        if (product) openProductForm(product);
        break;
      }
      case 'delete-product':
        await deleteProduct(element.dataset.id);
        break;
      case 'toggle-list':
        await toggleList(element.dataset.id);
        break;
      case 'toggle-bought':
        await toggleBought(element.dataset.id);
        break;
      case 'qty-step':
        await stepQuantity(element);
        break;
      case 'finalize-purchase':
        await finalizePurchase();
        break;
      case 'new-category':
        openCategoryForm();
        break;
      case 'new-category-from-product':
        openCategoryForm(null, { fromProduct: true });
        break;
      case 'edit-category': {
        const category = findCategory(element.dataset.id);
        if (category) openCategoryForm(category);
        break;
      }
      case 'delete-category':
        await deleteCategory(element.dataset.id);
        break;
      case 'open-catalog-detail':
        openCatalogDetail(element.dataset.catalogoId);
        break;
      case 'add-catalog':
        await addCatalogFromButton(element.dataset.catalogoId);
        break;
      case 'open-settings':
        openSettings();
        break;
      case 'close-dialog':
        closeDialog(element.dataset.dialog);
        break;
      case 'install':
        await installApp();
        break;
      case 'refresh-catalog':
        await refreshCatalog(element);
        break;
      case 'sync-categories':
        await syncCategories();
        break;
      case 'import-all-catalog':
        await importAllCatalog();
        break;
      case 'export-data':
        await exportData();
        break;
      case 'import-data':
        els.importInput.click();
        break;
      case 'reset-data':
        await resetData();
        break;
      case 'more-products':
        state.filters.products.limit += 60;
        renderProductsResults();
        break;
      case 'more-catalog':
        state.filters.catalog.limit += 60;
        renderCatalogResults();
        break;
      case 'filter-catalog-cat':
        setCatalogCategory(element.dataset.cat || '');
        break;
      case 'clear-products-search':
        state.filters.products.q = '';
        state.filters.products.limit = 60;
        renderProducts();
        break;
      case 'clear-catalog-search':
        state.filters.catalog.q = '';
        state.filters.catalog.limit = 60;
        renderCatalog();
        break;
      case 'clear-product-filters':
        state.filters.products = { q: '', cat: '', status: 'todos', sort: 'nombre', limit: 60 };
        renderProducts();
        break;
      case 'clear-catalog-filters':
        state.filters.catalog = { q: '', cat: '', limit: 60 };
        renderCatalog();
        break;
      case 'reload':
        window.location.reload();
        break;
      default:
        break;
    }
  }

  function handleInput(event) {
    const id = event.target.id;
    if (id === 'products-search') {
      state.filters.products.q = event.target.value;
      state.filters.products.limit = 60;
      toggleClearButton('products-search-clear', !!event.target.value);
      renderProductsResults();
    } else if (id === 'catalog-search') {
      state.filters.catalog.q = event.target.value;
      state.filters.catalog.limit = 60;
      toggleClearButton('catalog-search-clear', !!event.target.value);
      renderCatalogResults();
    }
  }

  async function handleChange(event) {
    const quantityField = event.target.closest('[data-qty-for]');
    if (quantityField) {
      const product = findProduct(quantityField.dataset.qtyFor);
      if (!product) return;
      const parsed = parseQuantity(quantityField.value);
      if (parsed === null) {
        quantityField.value = String(quantityOf(product));
        return;
      }
      const updated = await saveQuantityUnit(product, { cantidad: parsed });
      if (updated) quantityField.value = String(updated.cantidad);
      return;
    }

    const unitField = event.target.closest('[data-unit-for]');
    if (unitField) {
      const product = findProduct(unitField.dataset.unitFor);
      if (!product) return;
      const unit = String(unitField.value || 'ud').trim().slice(0, 20) || 'ud';
      await saveQuantityUnit(product, { unidad: unit });
      return;
    }

    const id = event.target.id;
    if (id === 'products-cat') {
      state.filters.products.cat = event.target.value;
      state.filters.products.limit = 60;
      renderProductsResults();
    } else if (id === 'products-status') {
      state.filters.products.status = event.target.value;
      state.filters.products.limit = 60;
      renderProductsResults();
    } else if (id === 'products-sort') {
      state.filters.products.sort = event.target.value;
      renderProductsResults();
    }
  }

  function toggleClearButton(id, visible) {
    const button = document.getElementById(id);
    if (button) button.hidden = !visible;
  }

  function handleHashChange() {
    state.view = getRoute();
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ------------------------------------------------------------------ */
  /* Carga de datos y catálogo                                          */
  /* ------------------------------------------------------------------ */

  async function loadCatalogFromStorage() {
    let stored = null;
    try {
      stored = await DB.metaGet('catalog');
    } catch (error) {
      console.warn('No se pudo leer el catálogo guardado', error);
    }
    const bundled = validCatalog(window.MERCADONA_CATALOG) ? window.MERCADONA_CATALOG : null;

    if (validCatalog(stored) && (!bundled || String(stored.actualizado || '') >= String(bundled.actualizado || ''))) {
      state.catalog = stored;
      state.catalogSource = 'stored';
    } else if (bundled) {
      state.catalog = bundled;
      state.catalogSource = 'bundled';
    } else {
      state.catalog = {
        categorias: FALLBACK_CATEGORIES.map((category) => ({ ...category })),
        productos: [],
        actualizado: null,
        fuente: '',
      };
      state.catalogSource = 'fallback';
    }
    buildCatalogIndex();
  }

  function validCatalog(catalog) {
    return !!(
      catalog &&
      typeof catalog === 'object' &&
      Array.isArray(catalog.categorias) &&
      Array.isArray(catalog.productos) &&
      catalog.productos.length > 0
    );
  }

  function buildCatalogIndex() {
    const categories = state.catalog.categorias || [];
    state.catalogCatMap = new Map(categories.map((category) => [String(category.id), category]));
    state.catalogSearch = new Map();
    state.catalogCounts = new Map();

    (state.catalog.productos || []).forEach((item) => {
      const id = String(item.id);
      const category = state.catalogCatMap.get(String(item.categoriaId));
      const searchable = U.normalize(
        [item.nombre, item.subcategoria, item.envase, category ? category.nombre : '']
          .filter(Boolean)
          .join(' ')
      );
      state.catalogSearch.set(id, searchable);
      const catKey = String(item.categoriaId || '');
      state.catalogCounts.set(catKey, (state.catalogCounts.get(catKey) || 0) + 1);
    });
  }

  async function loadAll() {
    const [products, categories] = await Promise.all([DB.getAll('products'), DB.getAll('categories')]);
    state.products = (products || []).filter((product) => product && product.id);
    state.categories = sortCategories((categories || []).filter((category) => category && category.id));
    rebuildProductIndexes();
    rebuildCategoryMaps();
  }

  function rebuildProductIndexes() {
    state.byId = new Map();
    state.byCatalogo = new Map();
    state.products.forEach((product) => {
      state.byId.set(product.id, product);
      if (product.catalogoId) state.byCatalogo.set(String(product.catalogoId), product);
    });
  }

  function rebuildCategoryMaps() {
    state.catMap = new Map(state.categories.map((category) => [String(category.id), category]));
    state.categoryOrder = new Map(state.categories.map((category, index) => [String(category.id), index]));
  }

  function sortCategories(categories) {
    return categories.slice().sort((a, b) => {
      const orderA = Number(a.orden);
      const orderB = Number(b.orden);
      const valueA = Number.isFinite(orderA) ? orderA : 9999;
      const valueB = Number.isFinite(orderB) ? orderB : 9999;
      return valueA - valueB || COLLATOR.compare(a.nombre || '', b.nombre || '');
    });
  }

  async function seedIfNeeded(force = false) {
    const seeded = await DB.metaGet('seeded');
    if (seeded && !force) return;

    const source =
      state.catalog.categorias && state.catalog.categorias.length
        ? state.catalog.categorias
        : FALLBACK_CATEGORIES;
    const existing = new Set(state.categories.map((category) => String(category.id)));
    const seen = new Set();
    const now = new Date().toISOString();
    const missing = [];

    source.forEach((category, index) => {
      if (!category || !category.nombre) return;
      const id = String(category.id || `cat-${U.uid()}`);
      if (existing.has(id) || seen.has(id)) return;
      seen.add(id);
      missing.push({
        id,
        nombre: String(category.nombre).slice(0, 50),
        emoji: category.emoji || '🛒',
        color: /^#[0-9a-f]{6}$/i.test(String(category.color || '')) ? category.color : '#2e7d32',
        orden: Number.isFinite(Number(category.orden)) ? Number(category.orden) : index + 1,
        creado: now,
      });
    });

    if (missing.length) await DB.bulkPut('categories', missing);
    await DB.metaSet('seeded', true);
    if (state.catalog.actualizado) {
      await DB.metaSet('catalogUpdatedAt', state.catalog.actualizado);
    }

    state.categories = sortCategories(await DB.getAll('categories'));
    rebuildCategoryMaps();
  }

  /* ------------------------------------------------------------------ */
  /* Router y render principal                                          */
  /* ------------------------------------------------------------------ */

  function getRoute() {
    const raw = String(window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return VIEWS.includes(raw) ? raw : 'lista';
  }

  function render() {
    document.querySelectorAll('.view').forEach((view) => {
      view.hidden = view.dataset.view !== state.view;
    });
    document.querySelectorAll('[data-nav]').forEach((link) => {
      const active = link.dataset.nav === state.view;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    updateBadge();
    if (els.fab) els.fab.hidden = !['lista', 'productos'].includes(state.view);

    if (state.view === 'lista') renderList();
    else if (state.view === 'productos') renderProducts();
    else if (state.view === 'catalogo') renderCatalog();
    else renderCategories();

    document.title = `${TITLES[state.view]} · La Cesta`;
  }

  function updateBadge() {
    if (!els.navBadge) return;
    const pending = state.products.filter((product) => product.enLista && !product.comprado).length;
    els.navBadge.hidden = pending === 0;
    els.navBadge.textContent = pending > 99 ? '99+' : String(pending);
  }

  function viewEl(name) {
    return document.querySelector(`.view[data-view="${name}"]`);
  }

  function renderFatal(error) {
    if (!els.app) return;
    els.app.innerHTML = `
      <div class="view-narrow">
        <div class="empty">
          <div class="empty-icon"><svg class="icon"><use href="#i-warning"/></svg></div>
          <h2>No se pudo abrir La Cesta</h2>
          <p>${esc(error && error.message ? error.message : 'Error desconocido')}</p>
          <p class="settings-note">Si has abierto el archivo directamente, prueba a servir la carpeta con <code>node tools/serve.mjs</code> y entra en <strong>http://localhost:5173</strong>.</p>
          <div class="empty-actions">
            <button type="button" class="btn btn-primary" data-action="reload">Reintentar</button>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Helpers de productos y categorías                                  */
  /* ------------------------------------------------------------------ */

  function categoryOf(id) {
    return (
      state.catMap.get(String(id)) || {
        id: '',
        nombre: 'Sin categoría',
        emoji: '🛒',
        color: '#8a9a90',
      }
    );
  }

  function catalogCategoryOf(id) {
    return (
      state.catalogCatMap.get(String(id)) ||
      state.catMap.get(String(id)) || {
        id: '',
        nombre: 'Sin categoría',
        emoji: '🛒',
        color: '#8a9a90',
      }
    );
  }

  function findProduct(id) {
    return state.byId.get(String(id)) || null;
  }

  function findCategory(id) {
    return state.catMap.get(String(id)) || null;
  }

  function upsertProduct(product) {
    const index = state.products.findIndex((item) => item.id === product.id);
    if (index >= 0) state.products[index] = product;
    else state.products.push(product);
    state.byId.set(product.id, product);
    if (product.catalogoId) state.byCatalogo.set(String(product.catalogoId), product);
  }

  function dropProductFromState(id) {
    const product = state.byId.get(String(id));
    state.products = state.products.filter((item) => item.id !== String(id));
    state.byId.delete(String(id));
    if (product && product.catalogoId) state.byCatalogo.delete(String(product.catalogoId));
  }

  function upsertCategory(category) {
    const index = state.categories.findIndex((item) => item.id === category.id);
    if (index >= 0) state.categories[index] = category;
    else state.categories.push(category);
    state.categories = sortCategories(state.categories);
    rebuildCategoryMaps();
  }

  function productDateLabel(product) {
    return product.fechaUltimaCompra
      ? `Última compra: ${U.formatDateSmart(product.fechaUltimaCompra)}`
      : `En lista desde: ${U.formatDateSmart(product.fechaAlta)}`;
  }

  function thumbMarkup(product) {
    const category = categoryOf(product.categoriaId);
    const src = U.safePhotoUrl(product.foto);
    return `<span class="thumb"><span class="thumb-emoji">${esc(category.emoji)}</span>${
      src
        ? `<img src="${attr(src)}" alt="" loading="lazy" data-photo-for="${attr(product.id)}" onerror="this.remove()">`
        : ''
    }</span>`;
  }

  function chevronMarkup() {
    return `<span class="row-chevron" aria-hidden="true"><svg class="icon"><use href="#i-chevron"/></svg></span>`;
  }

  function quantityOf(product) {
    const value = Number(product && product.cantidad);
    return Number.isFinite(value) ? value : 1;
  }

  function parseQuantity(raw) {
    const value = String(raw == null ? '' : raw).trim().replace(',', '.');
    if (!value) return 1;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0) return null;
    return Math.round(quantity * 100) / 100;
  }

  function unitOptionsMarkup(selected) {
    const value = String(selected || 'ud');
    const units = UNIDADES.includes(value) ? UNIDADES : UNIDADES.concat(value);
    return units
      .map((unit) => `<option value="${attr(unit)}"${unit === value ? ' selected' : ''}>${esc(unit)}</option>`)
      .join('');
  }

  function qtyEditorMarkup(product) {
    const id = attr(product.id);
    const name = attr(product.nombre);
    return `
      <div class="qty-editor" role="group" aria-label="Cantidad y unidad de ${name}">
        <button type="button" class="qty-step" data-action="qty-step" data-id="${id}" data-step="-1" aria-label="Reducir cantidad de ${name}">−</button>
        <input class="qty-input" type="number" inputmode="decimal" min="0" step="0.01" value="${attr(String(quantityOf(product)))}" data-qty-for="${id}" aria-label="Cantidad de ${name}">
        <select class="unit-select" data-unit-for="${id}" aria-label="Unidad de ${name}">${unitOptionsMarkup(product.unidad)}</select>
        <button type="button" class="qty-step" data-action="qty-step" data-id="${id}" data-step="1" aria-label="Aumentar cantidad de ${name}">+</button>
      </div>`;
  }

  async function stepQuantity(button) {
    const product = findProduct(button.dataset.id);
    if (!product) return;
    const delta = Number(button.dataset.step) || 0;
    const next = Math.max(0, Math.round((quantityOf(product) + delta) * 100) / 100);
    const updated = await saveQuantityUnit(product, { cantidad: next });
    if (!updated) return;
    const input = button.closest('.product-row') && button.closest('.product-row').querySelector('[data-qty-for]');
    if (input) input.value = String(updated.cantidad);
  }

  async function saveQuantityUnit(product, patch) {
    const previous = { ...product };
    const updated = { ...product, ...patch, actualizado: new Date().toISOString() };
    upsertProduct(updated);
    try {
      await DB.put('products', updated);
      return updated;
    } catch (error) {
      console.error(error);
      upsertProduct(previous);
      toast('No se ha podido actualizar la cantidad.');
      render();
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Vista: lista                                                       */
  /* ------------------------------------------------------------------ */

  function renderList() {
    const el = viewEl('lista');
    if (!el) return;

    const inList = state.products.filter((product) => product.enLista);
    const pending = inList.filter((product) => !product.comprado);
    const bought = inList.filter((product) => product.comprado);

    let html = '<div class="view-narrow">';
    if (inList.length === 0) {
      html += emptyListMarkup();
      const suggestions = state.products
        .filter((product) => !product.enLista)
        .sort((a, b) => {
          const dateA = a.fechaUltimaCompra || '';
          const dateB = b.fechaUltimaCompra || '';
          if (dateA && dateB) return dateB.localeCompare(dateA);
          if (dateA) return -1;
          if (dateB) return 1;
          return COLLATOR.compare(a.nombre || '', b.nombre || '');
        })
        .slice(0, 5);
      if (suggestions.length) html += suggestionsMarkup(suggestions);
    } else {
      html += heroMarkup(pending, bought);
      html += pendingGroupsMarkup(pending);
      if (bought.length) html += boughtBlockMarkup(bought);
    }
    html += '</div>';
    el.innerHTML = html;
  }

  function heroMarkup(pending, bought) {
    const total = pending.length + bought.length;
    const percent = total ? Math.round((bought.length / total) * 100) : 0;
    return `
      <section class="hero" aria-label="Resumen de la lista">
        <div class="hero-content">
          <p class="hero-kicker">${bought.length ? 'Compra en curso' : 'Tu lista de la compra'}</p>
          <div class="hero-count">
            <strong>${U.formatNumber(pending.length)}</strong>
            <span>${pending.length === 1 ? 'producto pendiente' : 'productos pendientes'}</span>
          </div>
          <div class="hero-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Progreso de la compra">
            <i style="width:${percent}%"></i>
          </div>
          <div class="hero-foot">
            <div class="hero-stats">
              <span><b>${U.formatNumber(bought.length)}</b> ${bought.length === 1 ? 'comprado' : 'comprados'}</span>
              <span><b>${U.formatNumber(total)}</b> en la lista</span>
            </div>
            <div class="hero-actions">
              <button type="button" class="btn btn-light" data-action="new-product">
                <svg class="icon"><use href="#i-plus"/></svg>Añadir
              </button>
              ${
                bought.length
                  ? `<button type="button" class="btn btn-outline-light" data-action="finalize-purchase">
                       <svg class="icon"><use href="#i-check"/></svg>Finalizar compra
                     </button>`
                  : `<a class="btn btn-outline-light" href="#/catalogo">
                       <svg class="icon"><use href="#i-grid"/></svg>Catálogo
                     </a>`
              }
            </div>
          </div>
        </div>
      </section>`;
  }

  function pendingGroupsMarkup(pending) {
    if (!pending.length) return '';
    const groups = new Map();
    pending.forEach((product) => {
      const key = String(product.categoriaId || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    });

    const sorted = Array.from(groups.entries()).sort((a, b) => {
      const orderA = state.categoryOrder.has(a[0]) ? state.categoryOrder.get(a[0]) : 9999;
      const orderB = state.categoryOrder.has(b[0]) ? state.categoryOrder.get(b[0]) : 9999;
      return orderA - orderB;
    });

    return sorted
      .map(([categoryId, items]) => {
        const category = categoryOf(categoryId);
        items.sort((a, b) => COLLATOR.compare(a.nombre || '', b.nombre || ''));
        return `
          <div class="list-group">
            <div class="list-group-head">
              <h3><span class="emoji" aria-hidden="true">${esc(category.emoji)}</span>${esc(category.nombre)}</h3>
              <span class="count">${items.length}</span>
            </div>
            ${items.map(listRowMarkup).join('')}
          </div>`;
      })
      .join('');
  }

  function listRowMarkup(product) {
    const category = categoryOf(product.categoriaId);
    const isBought = !!product.comprado;
    const actionLabel = isBought
      ? `Desmarcar como comprado: ${product.nombre}`
      : `Marcar como comprado: ${product.nombre}`;
    return `
      <article class="product-row${isBought ? ' is-bought' : ''}" data-id="${attr(product.id)}">
        <button type="button" class="check" data-action="toggle-bought" data-id="${attr(product.id)}"
          aria-pressed="${isBought}" aria-label="${attr(actionLabel)}">
          <svg class="icon"><use href="#i-check"/></svg>
        </button>
        <button type="button" class="row-main" data-action="open-detail" data-id="${attr(product.id)}">
          ${thumbMarkup(product)}
          <span class="row-text">
            <span class="row-title">${esc(product.nombre)}</span>
            <span class="row-meta">${esc(category.emoji)} ${esc(category.nombre)}</span>
            ${product.comentario ? `<span class="row-comment">${esc(product.comentario)}</span>` : ''}
            <span class="row-date">${esc(productDateLabel(product))}</span>
          </span>
          ${chevronMarkup()}
        </button>
        ${qtyEditorMarkup(product)}
      </article>`;
  }

  function boughtBlockMarkup(bought) {
    return `
      <section class="bought-block" aria-label="Productos comprados">
        <div class="list-group-head">
          <h3><span class="emoji" aria-hidden="true">✅</span>Comprados</h3>
          <button type="button" class="btn btn-sm btn-soft" data-action="finalize-purchase">Finalizar compra</button>
        </div>
        ${bought.map(listRowMarkup).join('')}
      </section>`;
  }

  function suggestionsMarkup(suggestions) {
    return `
      <div class="list-group">
        <div class="list-group-head">
          <h3><span class="emoji" aria-hidden="true">🕘</span>De tu última compra</h3>
        </div>
        ${suggestions
          .map(
            (product) => `
          <article class="product-row">
            <button type="button" class="check check-add" data-action="toggle-list" data-id="${attr(product.id)}"
              aria-label="Añadir a la lista: ${attr(product.nombre)}">
              <svg class="icon"><use href="#i-plus"/></svg>
            </button>
            <button type="button" class="row-main" data-action="open-detail" data-id="${attr(product.id)}">
              ${thumbMarkup(product)}
              <span class="row-text">
                <span class="row-title">${esc(product.nombre)}</span>
                <span class="row-meta">${esc(U.formatQty(product.cantidad))} ${esc(product.unidad)} · ${esc(categoryOf(product.categoriaId).nombre)}</span>
                <span class="row-date">${esc(productDateLabel(product))}</span>
              </span>
              ${chevronMarkup()}
            </button>
          </article>`
          )
          .join('')}
      </div>`;
  }

  function emptyListMarkup() {
    if (!state.products.length) {
      return `
        <div class="empty">
          <div class="empty-icon"><svg class="icon"><use href="#i-cart"/></svg></div>
          <h2>Tu cesta está lista para llenarse</h2>
          <p>Añade productos del catálogo de Mercadona o crea los tuyos. Todo se guarda solo en este dispositivo, así que puedes consultarlo cuando quieras.</p>
          <div class="empty-actions">
            <a class="btn btn-primary" href="#/catalogo"><svg class="icon"><use href="#i-grid"/></svg>Explorar catálogo</a>
            <button type="button" class="btn btn-ghost" data-action="new-product"><svg class="icon"><use href="#i-plus"/></svg>Crear producto</button>
          </div>
        </div>`;
    }
    return `
      <div class="empty">
        <div class="empty-icon"><svg class="icon"><use href="#i-cart"/></svg></div>
        <h2>Tu lista está vacía</h2>
        <p>Tienes ${U.plural(state.products.length, 'producto guardado', 'productos guardados')}. Añade los que necesites para la próxima compra o repite alguno de tu última compra.</p>
        <div class="empty-actions">
          <a class="btn btn-primary" href="#/catalogo"><svg class="icon"><use href="#i-grid"/></svg>Explorar catálogo</a>
          <a class="btn btn-ghost" href="#/productos"><svg class="icon"><use href="#i-package"/></svg>Mis productos</a>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Vista: productos                                                   */
  /* ------------------------------------------------------------------ */

  function renderProducts() {
    const el = viewEl('productos');
    if (!el) return;
    const filter = state.filters.products;
    const inList = state.products.filter((product) => product.enLista).length;

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Mis productos</h1>
          <p>${U.plural(state.products.length, 'guardado', 'guardados')}${inList ? ` · ${U.formatNumber(inList)} en la lista` : ''}</p>
        </div>
        <div class="page-head-actions">
          <button type="button" class="btn btn-primary" data-action="new-product">
            <svg class="icon"><use href="#i-plus"/></svg><span class="btn-label">Nuevo producto</span>
          </button>
        </div>
      </div>

      <div class="toolbar">
        <div class="search">
          <svg class="icon"><use href="#i-search"/></svg>
          <input id="products-search" type="search" value="${attr(filter.q)}" placeholder="Buscar por nombre, nota o categoría…" autocomplete="off" aria-label="Buscar en mis productos">
          <button type="button" class="search-clear" id="products-search-clear" data-action="clear-products-search" aria-label="Limpiar búsqueda" ${filter.q ? '' : 'hidden'}>
            <svg class="icon"><use href="#i-x"/></svg>
          </button>
        </div>
        <div class="filters">
          <select class="select" id="products-cat" aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            ${state.categories
              .map(
                (category) =>
                  `<option value="${attr(category.id)}" ${String(filter.cat) === String(category.id) ? 'selected' : ''}>${esc(category.emoji)} ${esc(category.nombre)}</option>`
              )
              .join('')}
          </select>
          <select class="select" id="products-status" aria-label="Filtrar por estado">
            <option value="todos" ${filter.status === 'todos' ? 'selected' : ''}>Todos</option>
            <option value="lista" ${filter.status === 'lista' ? 'selected' : ''}>En la lista</option>
            <option value="comprados" ${filter.status === 'comprados' ? 'selected' : ''}>Comprados</option>
            <option value="guardados" ${filter.status === 'guardados' ? 'selected' : ''}>Guardados</option>
          </select>
          <select class="select" id="products-sort" aria-label="Ordenar productos">
            <option value="nombre" ${filter.sort === 'nombre' ? 'selected' : ''}>Nombre</option>
            <option value="recientes" ${filter.sort === 'recientes' ? 'selected' : ''}>Más recientes</option>
            <option value="compra" ${filter.sort === 'compra' ? 'selected' : ''}>Última compra</option>
            <option value="categoria" ${filter.sort === 'categoria' ? 'selected' : ''}>Categoría</option>
          </select>
        </div>
      </div>

      <div class="results-bar" id="products-count"></div>
      <div class="grid" id="products-grid"></div>
      <div class="load-more" id="products-more"></div>`;

    renderProductsResults();
  }

  function filteredProducts() {
    const filter = state.filters.products;
    const query = U.normalize(filter.q);
    let list = state.products.filter((product) => {
      if (filter.cat && String(product.categoriaId || '') !== String(filter.cat)) return false;
      if (filter.status === 'lista' && !(product.enLista && !product.comprado)) return false;
      if (filter.status === 'comprados' && !product.comprado) return false;
      if (filter.status === 'guardados' && product.enLista) return false;
      if (query) {
        const category = categoryOf(product.categoriaId);
        const haystack = U.normalize(
          [product.nombre, product.comentario, category.nombre, product.unidad].filter(Boolean).join(' ')
        );
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    if (filter.sort === 'recientes') {
      list.sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')));
    } else if (filter.sort === 'compra') {
      list.sort((a, b) => {
        const dateA = a.fechaUltimaCompra || '';
        const dateB = b.fechaUltimaCompra || '';
        if (dateA && dateB) return dateB.localeCompare(dateA);
        if (dateA) return -1;
        if (dateB) return 1;
        return COLLATOR.compare(a.nombre || '', b.nombre || '');
      });
    } else if (filter.sort === 'categoria') {
      list.sort((a, b) => {
        const orderA = state.categoryOrder.has(String(a.categoriaId || '')) ? state.categoryOrder.get(String(a.categoriaId || '')) : 9999;
        const orderB = state.categoryOrder.has(String(b.categoriaId || '')) ? state.categoryOrder.get(String(b.categoriaId || '')) : 9999;
        return orderA - orderB || COLLATOR.compare(a.nombre || '', b.nombre || '');
      });
    } else {
      list.sort((a, b) => COLLATOR.compare(a.nombre || '', b.nombre || ''));
    }
    return list;
  }

  function renderProductsResults() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    const filter = state.filters.products;
    const list = filteredProducts();
    const shown = list.slice(0, filter.limit);
    const countEl = document.getElementById('products-count');
    const moreEl = document.getElementById('products-more');

    if (countEl) {
      const hasFilters = !!(filter.q || filter.cat || filter.status !== 'todos');
      countEl.innerHTML = `
        <span><strong>${U.formatNumber(list.length)}</strong> ${list.length === 1 ? 'producto' : 'productos'}${
          list.length !== state.products.length ? ` de ${U.formatNumber(state.products.length)}` : ''
        }</span>
        ${hasFilters ? '<button type="button" class="chip" data-action="clear-product-filters">Quitar filtros</button>' : ''}`;
    }

    if (!shown.length) {
      grid.innerHTML = emptyProductsMarkup();
    } else {
      grid.innerHTML = shown.map(productCardMarkup).join('');
    }

    if (moreEl) {
      const remaining = list.length - shown.length;
      moreEl.innerHTML = remaining > 0
        ? `<button type="button" class="btn btn-ghost" data-action="more-products">Mostrar más (${U.formatNumber(remaining)})</button>`
        : '';
    }
  }

  function emptyProductsMarkup() {
    if (!state.products.length) {
      return `
        <div class="empty" style="grid-column:1/-1">
          <div class="empty-icon"><svg class="icon"><use href="#i-package"/></svg></div>
          <h2>Aún no tienes productos</h2>
          <p>Empieza con el catálogo de Mercadona o crea un producto a mano con su foto, cantidad y comentarios.</p>
          <div class="empty-actions">
            <a class="btn btn-primary" href="#/catalogo"><svg class="icon"><use href="#i-grid"/></svg>Explorar catálogo</a>
            <button type="button" class="btn btn-ghost" data-action="new-product">Crear producto</button>
          </div>
        </div>`;
    }
    return `
      <div class="empty" style="grid-column:1/-1;padding:32px 18px">
        <h2>Sin resultados</h2>
        <p>No hay productos que coincidan con estos filtros.</p>
        <button type="button" class="btn btn-ghost" data-action="clear-product-filters">Limpiar filtros</button>
      </div>`;
  }

  function productCardMarkup(product) {
    const category = categoryOf(product.categoriaId);
    const src = U.safePhotoUrl(product.foto);
    const status = product.comprado
      ? { cls: 'badge-bought', label: 'Comprado' }
      : product.enLista
        ? { cls: '', label: 'En la lista' }
        : { cls: 'badge-saved', label: 'Guardado' };
    const actionLabel = product.enLista ? 'Quitar de la lista' : 'Añadir a la lista';

    return `
      <article class="p-card" data-id="${attr(product.id)}">
        <div class="p-card-media">
          <span class="thumb-emoji" aria-hidden="true">${esc(category.emoji)}</span>
          ${src ? `<img src="${attr(src)}" alt="" loading="lazy" data-photo-for="${attr(product.id)}" onerror="this.remove()">` : ''}
          <span class="p-card-badge ${status.cls}">${status.label}</span>
          <button type="button" class="p-card-action ${product.enLista ? 'is-on' : ''} ${product.comprado ? 'is-bought' : ''}"
            data-action="toggle-list" data-id="${attr(product.id)}" aria-label="${attr(actionLabel)}: ${attr(product.nombre)}"
            title="${attr(actionLabel)}">
            <svg class="icon"><use href="${product.enLista ? '#i-check' : '#i-plus'}"/></svg>
          </button>
        </div>
        <div class="p-card-body">
          <span class="p-card-cat">${esc(category.emoji)} ${esc(category.nombre)}</span>
          <span class="p-card-name">${esc(product.nombre)}</span>
          <span class="p-card-meta">${esc(U.formatQty(product.cantidad))} ${esc(product.unidad)}</span>
          <span class="p-card-date">${esc(productDateLabel(product))}</span>
        </div>
        <button type="button" class="p-card-open" data-action="open-detail" data-id="${attr(product.id)}" aria-label="Ver ${attr(product.nombre)}"></button>
      </article>`;
  }

  /* ------------------------------------------------------------------ */
  /* Vista: catálogo                                                    */
  /* ------------------------------------------------------------------ */

  function renderCatalog() {
    const el = viewEl('catalogo');
    if (!el) return;
    const filter = state.filters.catalog;
    const catalog = state.catalog;
    const total = (catalog.productos || []).length;
    const updated = catalog.actualizado ? U.formatDate(catalog.actualizado) : '';
    const categories = (catalog.categorias && catalog.categorias.length ? catalog.categorias : state.categories)
      .slice()
      .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || COLLATOR.compare(a.nombre || '', b.nombre || ''));

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Catálogo Mercadona</h1>
          <p>Productos listos para añadir a tu lista con un toque.</p>
        </div>
        <div class="page-head-actions">
          <button type="button" class="btn btn-ghost" data-action="open-settings">
            <svg class="icon"><use href="#i-settings"/></svg><span class="btn-label">Ajustes</span>
          </button>
        </div>
      </div>

      <div class="catalog-banner">
        <span class="mark" aria-hidden="true"><svg class="icon"><use href="#i-cart"/></svg></span>
        <div class="banner-copy">
          <h2>Datos públicos de Mercadona</h2>
          <p><strong>${U.formatNumber(total)}</strong> productos${updated ? ` · actualizado el ${esc(updated)}` : ''} · Añádelos a tu cesta cuando quieras</p>
        </div>
      </div>

      <div class="toolbar">
        <div class="search">
          <svg class="icon"><use href="#i-search"/></svg>
          <input id="catalog-search" type="search" value="${attr(filter.q)}" placeholder="Buscar en el catálogo…" autocomplete="off" aria-label="Buscar en el catálogo">
          <button type="button" class="search-clear" id="catalog-search-clear" data-action="clear-catalog-search" aria-label="Limpiar búsqueda" ${filter.q ? '' : 'hidden'}>
            <svg class="icon"><use href="#i-x"/></svg>
          </button>
        </div>
      </div>

      <div class="chips" id="catalog-chips" aria-label="Filtrar por categoría">
        <button type="button" class="chip ${!filter.cat ? 'active' : ''}" data-action="filter-catalog-cat" data-cat="">
          Todas <span class="num">${U.formatNumber(total)}</span>
        </button>
        ${categories
          .map((category) => {
            const count = state.catalogCounts.get(String(category.id)) || 0;
            return `<button type="button" class="chip ${String(filter.cat) === String(category.id) ? 'active' : ''}"
              data-action="filter-catalog-cat" data-cat="${attr(category.id)}">
              <span class="emoji" aria-hidden="true">${esc(category.emoji || '🛒')}</span>${esc(category.nombre)}
              ${count ? `<span class="num">${U.formatNumber(count)}</span>` : ''}
            </button>`;
          })
          .join('')}
      </div>

      <div class="results-bar" id="catalog-count"></div>
      <div class="grid" id="catalog-grid"></div>
      <div class="load-more" id="catalog-more"></div>`;

    renderCatalogResults();
  }

  function filteredCatalog() {
    const filter = state.filters.catalog;
    const query = U.normalize(filter.q);
    return (state.catalog.productos || []).filter((item) => {
      if (filter.cat && String(item.categoriaId || '') !== String(filter.cat)) return false;
      if (query) {
        const haystack = state.catalogSearch.get(String(item.id)) || U.normalize(item.nombre || '');
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }

  function renderCatalogResults() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;
    const filter = state.filters.catalog;
    const list = filteredCatalog();
    const shown = list.slice(0, filter.limit);
    const countEl = document.getElementById('catalog-count');
    const moreEl = document.getElementById('catalog-more');
    const hasFilters = !!(filter.q || filter.cat);

    if (countEl) {
      countEl.innerHTML = `
        <span><strong>${U.formatNumber(list.length)}</strong> ${list.length === 1 ? 'producto' : 'productos'}</span>
        ${hasFilters ? '<button type="button" class="chip" data-action="clear-catalog-filters">Quitar filtros</button>' : ''}`;
    }

    grid.innerHTML = shown.length ? shown.map(catalogCardMarkup).join('') : emptyCatalogMarkup();

    if (moreEl) {
      const remaining = list.length - shown.length;
      moreEl.innerHTML = remaining > 0
        ? `<button type="button" class="btn btn-ghost" data-action="more-catalog">Mostrar más (${U.formatNumber(remaining)})</button>`
        : '';
    }
  }

  function emptyCatalogMarkup() {
    if (!(state.catalog.productos || []).length) {
      return `
        <div class="empty" style="grid-column:1/-1">
          <div class="empty-icon"><svg class="icon"><use href="#i-grid"/></svg></div>
          <h2>Catálogo no disponible</h2>
          <p>No se ha podido cargar el catálogo de Mercadona. Puedes intentar actualizarlo online o seguir creando productos manualmente.</p>
          <div class="empty-actions">
            <button type="button" class="btn btn-primary" data-action="refresh-catalog">Actualizar catálogo</button>
            <button type="button" class="btn btn-ghost" data-action="new-product">Crear producto</button>
          </div>
        </div>`;
    }
    return `
      <div class="empty" style="grid-column:1/-1;padding:32px 18px">
        <h2>Sin resultados</h2>
        <p>No hay productos que coincidan con la búsqueda o la categoría elegida.</p>
        <button type="button" class="btn btn-ghost" data-action="clear-catalog-filters">Limpiar filtros</button>
      </div>`;
  }

  function catalogCardMarkup(item) {
    const category = catalogCategoryOf(item.categoriaId);
    const src = U.safePhotoUrl(item.foto);
    const existing = state.byCatalogo.get(String(item.id));
    const inList = !!(existing && existing.enLista);
    const label = inList ? 'Ya está en la lista' : 'Añadir a la lista';

    let badge = '';
    if (existing) {
      badge = inList
        ? `<span class="p-card-badge ${existing.comprado ? 'badge-bought' : ''}">${existing.comprado ? 'Comprado' : 'En la lista'}</span>`
        : '<span class="p-card-badge badge-saved">Guardado</span>';
    }

    return `
      <article class="p-card" data-catalogo-id="${attr(item.id)}">
        <div class="p-card-media">
          <span class="thumb-emoji" aria-hidden="true">${esc(category.emoji)}</span>
          ${src ? `<img src="${attr(src)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
          ${badge}
          <button type="button" class="p-card-action ${inList ? 'is-on' : ''}" data-action="add-catalog"
            data-catalogo-id="${attr(item.id)}" aria-label="${attr(label)}: ${attr(item.nombre)}" title="${attr(label)}">
            <svg class="icon"><use href="${inList ? '#i-check' : '#i-plus'}"/></svg>
          </button>
        </div>
        <div class="p-card-body">
          <span class="p-card-cat">${esc(category.emoji)} ${esc(category.nombre)}</span>
          <span class="p-card-name">${esc(item.nombre)}</span>
          <span class="p-card-meta">${esc(U.formatQty(item.cantidad))} ${esc(item.unidad)}${item.envase ? ` · ${esc(item.envase)}` : ''}</span>
          <span class="p-card-date">${esc(item.subcategoria || 'Mercadona')}</span>
        </div>
        <button type="button" class="p-card-open" data-action="open-catalog-detail" data-catalogo-id="${attr(item.id)}" aria-label="Ver ${attr(item.nombre)}"></button>
      </article>`;
  }

  function setCatalogCategory(categoryId) {
    state.filters.catalog.cat = categoryId;
    state.filters.catalog.limit = 60;
    document.querySelectorAll('#catalog-chips .chip').forEach((chip) => {
      chip.classList.toggle('active', String(chip.dataset.cat || '') === String(categoryId || ''));
    });
    renderCatalogResults();
  }

  /* ------------------------------------------------------------------ */
  /* Vista: categorías                                                  */
  /* ------------------------------------------------------------------ */

  function renderCategories() {
    const el = viewEl('categorias');
    if (!el) return;
    const counts = new Map();
    const listCounts = new Map();
    state.products.forEach((product) => {
      const key = String(product.categoriaId || '');
      counts.set(key, (counts.get(key) || 0) + 1);
      if (product.enLista) listCounts.set(key, (listCounts.get(key) || 0) + 1);
    });

    const orphans = state.products.filter(
      (product) => !product.categoriaId || !state.catMap.has(String(product.categoriaId))
    );

    let cards = state.categories
      .map((category) => {
        const total = counts.get(String(category.id)) || 0;
        const inList = listCounts.get(String(category.id)) || 0;
        return `
          <article class="cat-card">
            <span class="cat-emoji" style="background:${U.hexToRgba(category.color || '#2e7d32', 0.14)}" aria-hidden="true">${esc(category.emoji || '🛒')}</span>
            <div class="cat-copy">
              <strong>${esc(category.nombre)}</strong>
              <span>${U.plural(total, 'producto', 'productos')}${inList ? ` · ${inList} en la lista` : ''}</span>
            </div>
            <div class="cat-actions">
              <button type="button" class="icon-btn" data-action="edit-category" data-id="${attr(category.id)}" aria-label="Editar ${attr(category.nombre)}" title="Editar">
                <svg class="icon"><use href="#i-edit"/></svg>
              </button>
              <button type="button" class="icon-btn danger" data-action="delete-category" data-id="${attr(category.id)}" aria-label="Eliminar ${attr(category.nombre)}" title="Eliminar">
                <svg class="icon"><use href="#i-trash"/></svg>
              </button>
            </div>
          </article>`;
      })
      .join('');

    if (orphans.length) {
      cards += `
        <article class="cat-card">
          <span class="cat-emoji" style="background:${U.hexToRgba('#8a9a90', 0.14)}" aria-hidden="true">🛒</span>
          <div class="cat-copy">
            <strong>Sin categoría</strong>
            <span>${U.plural(orphans.length, 'producto', 'productos')}</span>
          </div>
        </article>`;
    }

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Categorías</h1>
          <p>Organiza tu cesta y tu catálogo personal.</p>
        </div>
        <div class="page-head-actions">
          <button type="button" class="btn btn-primary" data-action="new-category">
            <svg class="icon"><use href="#i-plus"/></svg><span class="btn-label">Nueva categoría</span>
          </button>
        </div>
      </div>
      <p class="settings-note" style="margin:-4px 2px 16px">Al eliminar una categoría, sus productos se conservan y pasan a “Sin categoría”.</p>
      ${state.categories.length || orphans.length
        ? `<div class="cat-grid">${cards}</div>`
        : `<div class="empty">
             <div class="empty-icon"><svg class="icon"><use href="#i-tag"/></svg></div>
             <h2>Aún no hay categorías</h2>
             <p>Crea categorías como “Frutas”, “Lácteos” o “Limpieza” para encontrar tus productos más rápido.</p>
             <div class="empty-actions"><button type="button" class="btn btn-primary" data-action="new-category">Crear categoría</button></div>
           </div>`}`;
  }

  /* ------------------------------------------------------------------ */
  /* Detalle de producto                                                */
  /* ------------------------------------------------------------------ */

  function openProductDetail(id) {
    const product = findProduct(id);
    if (!product) {
      toast('Ese producto ya no existe.');
      return;
    }
    const category = categoryOf(product.categoriaId);
    const src = U.safePhotoUrl(product.foto);
    const status = product.comprado
      ? { cls: 'bought', label: 'Comprado' }
      : product.enLista
        ? { cls: '', label: 'En la lista' }
        : { cls: 'saved', label: 'Guardado' };
    const dateLabel = product.fechaUltimaCompra ? 'Última compra' : 'En lista desde';
    const dateValue = U.formatDate(product.fechaUltimaCompra || product.fechaAlta);

    els.detailContent.innerHTML = `
      <div class="detail-hero">
        ${src ? `<img src="${attr(src)}" alt="" onerror="this.remove()">` : `<span class="detail-placeholder" aria-hidden="true">${esc(category.emoji)}</span>`}
        <div class="detail-hero-copy">
          <h2 id="detail-title">${esc(product.nombre)}</h2>
          <p>${esc(category.emoji)} ${esc(category.nombre)}</p>
          <span class="detail-status ${status.cls}">${status.label}</span>
        </div>
        <button type="button" class="icon-btn detail-close" data-action="close-dialog" data-dialog="detail-dialog" aria-label="Cerrar">
          <svg class="icon"><use href="#i-x"/></svg>
        </button>
      </div>
      <div class="detail-body">
        <div class="detail-grid">
          <div class="detail-item">
            <span>Cantidad</span>
            <strong>${esc(U.formatQty(product.cantidad))} ${esc(product.unidad)}</strong>
          </div>
          <div class="detail-item">
            <span>${dateLabel}</span>
            <strong>${esc(dateValue)}</strong>
          </div>
          <div class="detail-item" style="grid-column:1/-1">
            <span>Categoría</span>
            <strong>${esc(category.emoji)} ${esc(category.nombre)}</strong>
          </div>
        </div>
        ${product.comentario ? `<p class="detail-comment-label">Comentario</p><div class="detail-comment">${esc(product.comentario)}</div>` : ''}
        <div class="detail-actions">
          <button type="button" class="btn ${product.enLista ? 'btn-ghost' : 'btn-primary'}" data-action="toggle-list" data-id="${attr(product.id)}">
            <svg class="icon"><use href="${product.enLista ? '#i-x' : '#i-plus'}"/></svg>${product.enLista ? 'Quitar de la lista' : 'Añadir a la lista'}
          </button>
          <button type="button" class="btn ${product.comprado ? 'btn-ghost' : 'btn-soft'}" data-action="toggle-bought" data-id="${attr(product.id)}">
            <svg class="icon"><use href="#i-check"/></svg>${product.comprado ? 'Desmarcar comprado' : 'Marcar comprado'}
          </button>
          <button type="button" class="btn btn-ghost" data-action="edit-product" data-id="${attr(product.id)}">
            <svg class="icon"><use href="#i-edit"/></svg>Editar
          </button>
          <button type="button" class="btn btn-danger-soft" data-action="delete-product" data-id="${attr(product.id)}">
            <svg class="icon"><use href="#i-trash"/></svg>Eliminar
          </button>
        </div>
      </div>`;
    showDialog(els.detailDialog);
  }

  function openCatalogDetail(catalogoId) {
    const item = (state.catalog.productos || []).find((product) => String(product.id) === String(catalogoId));
    if (!item) {
      toast('Ese producto no está en el catálogo.');
      return;
    }
    const category = catalogCategoryOf(item.categoriaId);
    const src = U.safePhotoUrl(item.foto);
    const existing = state.byCatalogo.get(String(item.id));
    const inList = !!(existing && existing.enLista);

    els.detailContent.innerHTML = `
      <div class="detail-hero">
        ${src ? `<img src="${attr(src)}" alt="" onerror="this.remove()">` : `<span class="detail-placeholder" aria-hidden="true">${esc(category.emoji)}</span>`}
        <div class="detail-hero-copy">
          <h2 id="detail-title">${esc(item.nombre)}</h2>
          <p>${esc(category.emoji)} ${esc(category.nombre)}</p>
          <span class="detail-status">Catálogo Mercadona</span>
        </div>
        <button type="button" class="icon-btn detail-close" data-action="close-dialog" data-dialog="detail-dialog" aria-label="Cerrar">
          <svg class="icon"><use href="#i-x"/></svg>
        </button>
      </div>
      <div class="detail-body">
        <div class="detail-grid">
          <div class="detail-item">
            <span>Cantidad</span>
            <strong>${esc(U.formatQty(item.cantidad))} ${esc(item.unidad)}</strong>
          </div>
          <div class="detail-item">
            <span>Formato</span>
            <strong>${esc(item.envase || item.subcategoria || '—')}</strong>
          </div>
          <div class="detail-item">
            <span>Sección</span>
            <strong>${esc(item.subcategoria || '—')}</strong>
          </div>
          <div class="detail-item">
            <span>Origen</span>
            <strong>Mercadona</strong>
          </div>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn ${inList ? 'btn-ghost' : 'btn-primary'} span-2" data-action="add-catalog" data-catalogo-id="${attr(item.id)}">
            <svg class="icon"><use href="${inList ? '#i-check' : '#i-plus'}"/></svg>${inList ? 'Ya está en tu lista' : 'Añadir a la lista'}
          </button>
          ${existing ? `<button type="button" class="btn btn-ghost span-2" data-action="open-detail" data-id="${attr(existing.id)}"><svg class="icon"><use href="#i-package"/></svg>Ver mi producto</button>` : ''}
        </div>
      </div>`;
    showDialog(els.detailDialog);
  }

  /* ------------------------------------------------------------------ */
  /* Formulario de producto                                             */
  /* ------------------------------------------------------------------ */

  function openProductForm(product) {
    if (els.detailDialog.open) els.detailDialog.close();
    state.editingProductId = product ? product.id : null;
    state.tempPhoto = product ? product.foto || '' : '';

    const form = els.productForm;
    form.reset();
    fillProductCategoryOptions(product ? product.categoriaId : '');
    fillProductUnitOptions(product ? product.unidad : 'ud');

    form.elements.namedItem('nombre').value = product ? product.nombre : '';
    form.elements.namedItem('cantidad').value = product ? String(product.cantidad ?? 1) : '1';
    form.elements.namedItem('comentario').value = product ? product.comentario || '' : '';
    form.elements.namedItem('fechaCompra').value = product && product.fechaUltimaCompra ? product.fechaUltimaCompra : '';
    form.elements.namedItem('enLista').checked = product ? !!product.enLista : true;

    els.productFormTitle.textContent = product ? 'Editar producto' : 'Añadir a La Cesta';
    els.productFormEyebrow.textContent = product ? 'Producto guardado' : 'Nuevo producto';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = product ? 'Guardar cambios' : 'Guardar producto';

    updateDateHelp(product);
    updatePhotoPreview();
    showDialog(els.productDialog);
    window.setTimeout(() => form.elements.namedItem('nombre').focus(), 80);
  }

  function fillProductCategoryOptions(selectedId) {
    const options = ['<option value="">Sin categoría</option>'];
    state.categories.forEach((category) => {
      options.push(
        `<option value="${attr(category.id)}">${esc(category.emoji || '🛒')} ${esc(category.nombre)}</option>`
      );
    });
    els.productCategory.innerHTML = options.join('');
    els.productCategory.value = selectedId && state.catMap.has(String(selectedId)) ? String(selectedId) : '';
  }

  function fillProductUnitOptions(unit) {
    els.productUnit.innerHTML = unitOptionsMarkup(unit);
  }

  function updateDateHelp(product) {
    if (!els.fechaHelp) return;
    if (product && product.fechaUltimaCompra) {
      els.fechaHelp.textContent = `Última compra registrada el ${U.formatDate(product.fechaUltimaCompra)}.`;
    } else if (product) {
      els.fechaHelp.textContent = `Aún no lo has comprado. Entró en la lista el ${U.formatDate(product.fechaAlta)}.`;
    } else {
      els.fechaHelp.textContent = 'Si aún no lo has comprado, se usará la fecha de entrada en la lista.';
    }
  }

  function updatePhotoPreview() {
    const src = U.safePhotoUrl(state.tempPhoto);
    if (src) {
      els.photoPreviewImg.src = src;
      els.photoPreviewImg.hidden = false;
      els.photoPlaceholder.hidden = true;
      els.photoRemove.hidden = false;
    } else {
      els.photoPreviewImg.removeAttribute('src');
      els.photoPreviewImg.hidden = true;
      els.photoPlaceholder.hidden = false;
      els.photoRemove.hidden = true;
    }
  }

  async function handlePhotoChange() {
    const file = els.photoInput.files && els.photoInput.files[0];
    if (!file) return;
    try {
      state.tempPhoto = await U.resizeImage(file);
      updatePhotoPreview();
    } catch (error) {
      toast(error.message || 'No se ha podido procesar la imagen.');
    } finally {
      els.photoInput.value = '';
    }
  }

  async function handleProductSubmit(event) {
    event.preventDefault();
    const form = els.productForm;
    const name = String(form.elements.namedItem('nombre').value || '').trim();
    if (!name) {
      toast('Ponle un nombre al producto.');
      form.elements.namedItem('nombre').focus();
      return;
    }

    const existing = findProduct(state.editingProductId);
    const now = new Date().toISOString();
    const rawQuantity = String(form.elements.namedItem('cantidad').value || '').trim().replace(',', '.');
    const parsedQuantity = rawQuantity ? Number(rawQuantity) : 1;
    const quantity = Number.isFinite(parsedQuantity) ? Math.max(0, parsedQuantity) : 1;
    const enLista = !!form.elements.namedItem('enLista').checked;
    const categoryId = form.elements.namedItem('categoriaId').value;
    const purchaseDate = form.elements.namedItem('fechaCompra').value || null;

    const product = {
      id: existing ? existing.id : U.uid(),
      nombre: name.slice(0, 90),
      categoriaId: state.catMap.has(String(categoryId)) ? String(categoryId) : '',
      foto: U.safePhotoUrl(state.tempPhoto),
      comentario: String(form.elements.namedItem('comentario').value || '').trim().slice(0, 500),
      cantidad: quantity,
      unidad: form.elements.namedItem('unidad').value || 'ud',
      fechaAlta: existing && existing.fechaAlta ? existing.fechaAlta : U.todayISO(),
      fechaUltimaCompra: purchaseDate,
      enLista,
      comprado: enLista ? !!(existing && existing.comprado) : false,
      compradoEn: enLista && existing ? existing.compradoEn || null : null,
      catalogoId: existing ? existing.catalogoId || null : null,
      origen: existing ? existing.origen || 'manual' : 'manual',
      creado: existing ? existing.creado || now : now,
      actualizado: now,
    };

    if (product.comprado && existing.fechaCompraAnterior !== undefined) {
      product.fechaCompraAnterior = existing.fechaCompraAnterior;
    }

    try {
      await DB.put('products', product);
      upsertProduct(product);
      closeDialog('product-dialog');
      render();
      toast(existing ? 'Producto actualizado.' : 'Producto añadido a tu cesta.');
    } catch (error) {
      console.error(error);
      toast('No se ha podido guardar el producto.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Formulario de categoría                                            */
  /* ------------------------------------------------------------------ */

  function openCategoryForm(category, options = {}) {
    state.editingCategoryId = category ? category.id : null;
    state.categoryFromProduct = !!options.fromProduct;

    const form = els.categoryForm;
    form.reset();
    form.elements.namedItem('nombre').value = category ? category.nombre : '';
    form.elements.namedItem('emoji').value = category ? category.emoji || '🛒' : '🛒';
    form.elements.namedItem('color').value = category && /^#[0-9a-f]{6}$/i.test(category.color || '') ? category.color : '#2e7d32';

    els.categoryFormTitle.textContent = category ? 'Editar categoría' : 'Crear categoría';
    els.categoryFormEyebrow.textContent = category ? 'Categoría' : 'Nueva categoría';
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.textContent = category ? 'Guardar cambios' : 'Guardar categoría';

    showDialog(els.categoryDialog);
    window.setTimeout(() => form.elements.namedItem('nombre').focus(), 80);
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();
    const form = els.categoryForm;
    const name = String(form.elements.namedItem('nombre').value || '').trim();
    if (!name) {
      toast('La categoría necesita un nombre.');
      form.elements.namedItem('nombre').focus();
      return;
    }

    const existing = findCategory(state.editingCategoryId);
    const fromProduct = state.categoryFromProduct;
    const now = new Date().toISOString();
    const maxOrder = state.categories.reduce((max, category) => Math.max(max, Number(category.orden) || 0), 0);
    const category = {
      id: existing ? existing.id : `cat-${U.uid()}`,
      nombre: name.slice(0, 50),
      emoji: String(form.elements.namedItem('emoji').value || '🛒').trim().slice(0, 4) || '🛒',
      color: form.elements.namedItem('color').value || '#2e7d32',
      orden: existing ? existing.orden : maxOrder + 1,
      creado: existing ? existing.creado || now : now,
      actualizado: now,
    };

    try {
      await DB.put('categories', category);
      upsertCategory(category);

      if (fromProduct) {
        state.categoryFromProduct = false;
        refreshProductCategoryOptions(category.id);
        closeDialog('category-dialog');
        render();
        toast(existing ? 'Categoría actualizada.' : 'Categoría creada.');
        return;
      }

      closeDialog('category-dialog');
      render();
      toast(existing ? 'Categoría actualizada.' : 'Categoría creada.');
    } catch (error) {
      console.error(error);
      toast('No se ha podido guardar la categoría.');
    }
  }

  function refreshProductCategoryOptions(selectedId) {
    if (!els.productDialog.open) return;
    fillProductCategoryOptions(selectedId);
  }

  /* ------------------------------------------------------------------ */
  /* Operaciones CRUD                                                   */
  /* ------------------------------------------------------------------ */

  async function toggleList(id) {
    const product = findProduct(id);
    if (!product) return;
    const wasBought = !!product.comprado;
    const enLista = !product.enLista;
    const updated = {
      ...product,
      enLista,
      comprado: enLista ? !!product.comprado : false,
      compradoEn: enLista ? product.compradoEn || null : null,
      actualizado: new Date().toISOString(),
    };
    if (!enLista) {
      if (wasBought && product.fechaCompraAnterior !== undefined) {
        updated.fechaUltimaCompra = product.fechaCompraAnterior;
      }
      delete updated.fechaCompraAnterior;
    }
    try {
      await DB.put('products', updated);
      upsertProduct(updated);
      if (els.detailDialog.open) els.detailDialog.close();
      render();
      toast(enLista ? 'Añadido a la lista.' : 'Quitado de la lista.');
    } catch (error) {
      console.error(error);
      toast('No se ha podido actualizar el producto.');
    }
  }

  async function toggleBought(id) {
    const product = findProduct(id);
    if (!product) return;
    const bought = !product.comprado;
    const updated = {
      ...product,
      comprado: bought,
      compradoEn: bought ? new Date().toISOString() : null,
      enLista: bought ? true : product.enLista,
      actualizado: new Date().toISOString(),
    };

    if (bought) {
      updated.fechaCompraAnterior = product.fechaUltimaCompra || null;
      updated.fechaUltimaCompra = U.todayISO();
    } else {
      updated.fechaUltimaCompra =
        product.fechaCompraAnterior !== undefined ? product.fechaCompraAnterior : product.fechaUltimaCompra;
      delete updated.fechaCompraAnterior;
    }

    try {
      await DB.put('products', updated);
      upsertProduct(updated);
      if (els.detailDialog.open) els.detailDialog.close();
      render();
      toast(bought ? 'Marcado como comprado.' : 'Desmarcado.');
    } catch (error) {
      console.error(error);
      toast('No se ha podido actualizar el producto.');
    }
  }

  async function finalizePurchase() {
    const bought = state.products.filter((product) => product.enLista && product.comprado);
    if (!bought.length) return;
    const now = new Date().toISOString();
    const snapshot = bought.map((product) => ({ ...product }));
    const updated = bought.map((product) => {
      const { fechaCompraAnterior, ...rest } = product;
      return {
        ...rest,
        enLista: false,
        comprado: false,
        compradoEn: null,
        actualizado: now,
      };
    });

    try {
      await DB.bulkPut('products', updated);
      updated.forEach(upsertProduct);
      if (els.detailDialog.open) els.detailDialog.close();
      render();
      toast(`Compra finalizada · ${U.plural(updated.length, 'producto guardado', 'productos guardados')}.`, {
        actionLabel: 'Deshacer',
        timeout: 8000,
        onAction: async () => {
          await DB.bulkPut('products', snapshot);
          snapshot.forEach(upsertProduct);
          render();
          toast('Compra restaurada.');
        },
      });
    } catch (error) {
      console.error(error);
      toast('No se ha podido finalizar la compra.');
    }
  }

  async function deleteProduct(id) {
    const product = findProduct(id);
    if (!product) return;
    const confirmed = await confirmAction({
      title: 'Eliminar producto',
      message: `“${product.nombre}” se eliminará de tus productos y de tu lista. Podrás deshacerlo justo después.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await DB.remove('products', product.id);
      dropProductFromState(product.id);
      if (els.detailDialog.open) els.detailDialog.close();
      render();
      toast('Producto eliminado.', {
        actionLabel: 'Deshacer',
        timeout: 8000,
        onAction: async () => {
          await DB.put('products', product);
          upsertProduct(product);
          render();
          toast('Producto restaurado.');
        },
      });
    } catch (error) {
      console.error(error);
      toast('No se ha podido eliminar el producto.');
    }
  }

  async function deleteCategory(id) {
    const category = findCategory(id);
    if (!category) return;
    const affected = state.products.filter((product) => String(product.categoriaId || '') === String(id));
    const message = affected.length
      ? `“${category.nombre}” tiene ${U.plural(affected.length, 'producto', 'productos')}. Se eliminará la categoría y esos productos pasarán a “Sin categoría”.`
      : `Se eliminará la categoría “${category.nombre}”.`;

    const confirmed = await confirmAction({
      title: 'Eliminar categoría',
      message,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!confirmed) return;

    try {
      if (affected.length) {
        const now = new Date().toISOString();
        const updated = affected.map((product) => ({
          ...product,
          categoriaId: '',
          actualizado: now,
        }));
        await DB.bulkPut('products', updated);
        updated.forEach(upsertProduct);
      }
      await DB.remove('categories', category.id);
      state.categories = state.categories.filter((item) => item.id !== category.id);
      rebuildCategoryMaps();
      render();
      toast('Categoría eliminada.');
    } catch (error) {
      console.error(error);
      toast('No se ha podido eliminar la categoría.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Catálogo → mi cesta                                                */
  /* ------------------------------------------------------------------ */

  async function addCatalogFromButton(catalogoId) {
    const result = await addCatalogItem(catalogoId);
    if (!result) return;
    if (result.already) {
      toast('Ya está en tu lista.');
      return;
    }
    if (els.detailDialog.open) els.detailDialog.close();
    if (state.view === 'catalogo') renderCatalogResults();
    else render();
    updateBadge();
    toast('Añadido a tu lista.');
  }

  async function addCatalogItem(catalogoId) {
    const item = (state.catalog.productos || []).find((product) => String(product.id) === String(catalogoId));
    if (!item) {
      toast('Ese producto no está en el catálogo.');
      return null;
    }

    const existing = state.byCatalogo.get(String(item.id));
    const now = new Date().toISOString();

    if (existing) {
      if (existing.enLista) return { product: existing, already: true };
      const updated = {
        ...existing,
        enLista: true,
        comprado: false,
        compradoEn: null,
        actualizado: now,
      };
      delete updated.fechaCompraAnterior;
      await DB.put('products', updated);
      upsertProduct(updated);
      return { product: updated, already: false };
    }

    const product = {
      id: U.uid(),
      nombre: item.nombre,
      categoriaId: state.catMap.has(String(item.categoriaId)) ? String(item.categoriaId) : '',
      foto: U.safePhotoUrl(item.foto),
      comentario: '',
      cantidad: Number.isFinite(Number(item.cantidad)) ? Math.max(0, Number(item.cantidad)) : 1,
      unidad: item.unidad || 'ud',
      fechaAlta: U.todayISO(),
      fechaUltimaCompra: null,
      enLista: true,
      comprado: false,
      compradoEn: null,
      catalogoId: String(item.id),
      origen: 'catalogo',
      creado: now,
      actualizado: now,
    };

    await DB.put('products', product);
    upsertProduct(product);
    cacheCatalogPhoto(product.id, item.foto);
    return { product, already: false };
  }

  async function cacheCatalogPhoto(productId, photoUrl) {
    const url = U.safePhotoUrl(photoUrl);
    if (!url || url.startsWith('data:')) return;
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/') || blob.size > 500 * 1024) return;
      const dataUrl = await U.blobToDataURL(blob);
      const product = findProduct(productId);
      if (!product || product.foto !== url) return;
      const updated = { ...product, foto: dataUrl, actualizado: new Date().toISOString() };
      await DB.put('products', updated);
      upsertProduct(updated);
      document.querySelectorAll('img[data-photo-for]').forEach((img) => {
        if (img.dataset.photoFor === productId) img.src = dataUrl;
      });
    } catch (error) {
      /* Si la imagen no se puede cachear, se mantiene la URL remota. */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ajustes                                                            */
  /* ------------------------------------------------------------------ */

  function openSettings() {
    renderSettingsContent();
    showDialog(els.settingsDialog);
  }

  function renderSettingsContent() {
    const catalog = state.catalog;
    const total = (catalog.productos || []).length;
    const updated = catalog.actualizado ? U.formatDate(catalog.actualizado) : 'sin fecha';
    const standalone = isStandalone();
    const ios = isIOS();
    const sourceLabel =
      state.catalogSource === 'online'
        ? 'Actualizado online.'
        : state.catalogSource === 'stored'
          ? 'Guardado en este dispositivo.'
          : 'Incluido con la aplicación.';

    let installHtml;
    if (standalone) {
      installHtml = `
        <div class="settings-card">
          <p><strong>La Cesta ya está instalada.</strong> Abre el icono del carrito desde tu pantalla de inicio para usarla como una app.</p>
        </div>`;
    } else if (state.installPrompt) {
      installHtml = `
        <div class="settings-card">
          <p>Instálala en tu dispositivo para abrirla a pantalla completa y usarla sin conexión.</p>
          <div class="settings-row">
            <button type="button" class="btn btn-primary btn-sm" data-action="install">
              <svg class="icon"><use href="#i-install"/></svg>Instalar La Cesta
            </button>
          </div>
        </div>`;
    } else {
      installHtml = `
        <div class="settings-card">
          <p>Para instalarla en tu dispositivo:</p>
          <ol class="install-steps">
            ${
              ios
                ? '<li>Abre esta página en Safari.</li><li>Toca el botón <strong>Compartir</strong>.</li><li>Elige <strong>Añadir a pantalla de inicio</strong>.</li>'
                : '<li>Abre el menú del navegador (⋮).</li><li>Elige <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.</li><li>Confirma la instalación.</li>'
            }
          </ol>
          <p class="settings-note">Si no aparece la opción, abre la app desde una dirección <strong>https://</strong> o <strong>http://localhost</strong>.</p>
        </div>`;
    }

    els.settingsContent.innerHTML = `
      <header class="sheet-head">
        <div>
          <p class="eyebrow">La Cesta</p>
          <h2 id="settings-title">Ajustes</h2>
        </div>
        <button type="button" class="icon-btn" data-action="close-dialog" data-dialog="settings-dialog" aria-label="Cerrar">
          <svg class="icon"><use href="#i-x"/></svg>
        </button>
      </header>
      <div class="sheet-body" style="padding:0;gap:0">
        <section class="settings-section">
          <h3>Instalación</h3>
          ${installHtml}
        </section>

        <section class="settings-section">
          <h3>Catálogo</h3>
          <div class="settings-card">
            <p><strong>${U.formatNumber(total)} productos</strong> de Mercadona.<br>
              Actualizado: ${esc(updated)}. ${esc(sourceLabel)}</p>
            <p class="settings-note">El catálogo incluido procede de la API pública de tienda.mercadona.es. Para actualizarlo online, la app necesita el backend incluido: <code>api/mercadona.php</code> en PHP o el servidor Node de <code>tools/serve.mjs</code>. También puedes ejecutar <code>node tools/update-catalog.mjs</code> y volver a desplegar la app.</p>
            <div class="settings-row">
              <button type="button" class="btn btn-soft btn-sm" data-action="refresh-catalog">
                <svg class="icon"><use href="#i-refresh"/></svg>Actualizar online
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="sync-categories">Sincronizar categorías</button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-action="import-all-catalog">Importar todo a Mis productos</button>
          </div>
        </section>

        <section class="settings-section">
          <h3>Datos</h3>
          <div class="settings-card">
            <p>Tus productos, fotos y categorías se guardan <strong>solo en este navegador</strong>. Exporta una copia si quieres moverlos a otro dispositivo.</p>
            <div class="settings-row">
              <button type="button" class="btn btn-soft btn-sm" data-action="export-data">
                <svg class="icon"><use href="#i-download"/></svg>Exportar copia
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="import-data">
                <svg class="icon"><use href="#i-install"/></svg>Importar copia
              </button>
            </div>
            <button type="button" class="btn btn-danger-soft btn-sm" data-action="reset-data">
              <svg class="icon"><use href="#i-trash"/></svg>Borrar todos los datos
            </button>
          </div>
        </section>

        <section class="settings-section">
          <h3>Acerca de</h3>
          <div class="settings-version">
            <span class="brand-mark"><svg class="icon"><use href="#i-cart"/></svg></span>
            <div>
              <strong>La Cesta</strong>
              <span>Versión 1.0 · Uso personal</span>
            </div>
          </div>
          <p class="settings-note">Mercadona es una marca registrada de sus propietarios. Esta aplicación no está afiliada a Mercadona; utiliza datos públicos de su tienda online. Tus datos no se envían a ningún servidor.</p>
        </section>
      </div>`;
  }

  async function exportData() {
    try {
      const meta = await DB.metaGetAll();
      const payload = {
        app: 'La Cesta',
        version: 1,
        exportedAt: new Date().toISOString(),
        categories: state.categories,
        products: state.products,
        meta: {
          catalogUpdatedAt: meta.catalogUpdatedAt || state.catalog.actualizado || null,
        },
      };
      U.downloadFile(`la-cesta-copia-${U.todayISO()}.json`, JSON.stringify(payload, null, 2));
      toast('Copia exportada. Guárdala en un lugar seguro.');
    } catch (error) {
      console.error(error);
      toast('No se ha podido exportar la copia.');
    }
  }

  async function handleImportFile() {
    const file = els.importInput.files && els.importInput.files[0];
    els.importInput.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.products)) {
        throw new Error('El archivo no parece una copia de La Cesta.');
      }

      const now = new Date().toISOString();
      let categories = Array.isArray(data.categories) ? data.categories.map(sanitizeCategory).filter(Boolean) : [];
      if (!categories.length) categories = state.categories.map((category) => ({ ...category }));
      const categoryIds = new Set(categories.map((category) => String(category.id)));
      const products = data.products.map((product) => sanitizeProduct(product, categoryIds, now)).filter(Boolean);
      if (!products.length && data.products.length) {
        throw new Error('La copia no contiene productos válidos.');
      }

      const confirmed = await confirmAction({
        title: 'Importar copia de seguridad',
        message: `Se sustituirán tus ${U.plural(state.products.length, 'producto actual', 'productos actuales')} y tus categorías por los de la copia. Exporta antes una copia si quieres conservar los datos actuales.`,
        confirmLabel: 'Importar',
        danger: true,
      });
      if (!confirmed) return;

      const currentMeta = await DB.metaGetAll();
      const meta = {
        seeded: true,
        catalogUpdatedAt: (data.meta && data.meta.catalogUpdatedAt) || currentMeta.catalogUpdatedAt || null,
      };
      if (currentMeta.catalog) meta.catalog = currentMeta.catalog;

      await DB.replaceAll({ products, categories, meta });
      await loadAll();
      closeDialog('settings-dialog');
      render();
      toast(`Copia importada · ${U.plural(products.length, 'producto', 'productos')}.`);
    } catch (error) {
      console.error(error);
      toast(error && error.message ? error.message : 'No se ha podido importar la copia.', { timeout: 6000 });
    }
  }

  function sanitizeCategory(raw) {
    if (!raw || !raw.id || !raw.nombre) return null;
    return {
      id: String(raw.id),
      nombre: String(raw.nombre).slice(0, 50),
      emoji: String(raw.emoji || '🛒').slice(0, 4),
      color: /^#[0-9a-f]{6}$/i.test(String(raw.color || '')) ? raw.color : '#2e7d32',
      orden: Number.isFinite(Number(raw.orden)) ? Number(raw.orden) : 0,
      creado: raw.creado || new Date().toISOString(),
      actualizado: new Date().toISOString(),
    };
  }

  function sanitizeProduct(raw, categoryIds, now) {
    if (!raw || !raw.id || !raw.nombre) return null;
    return {
      id: String(raw.id),
      nombre: String(raw.nombre).slice(0, 90),
      categoriaId: categoryIds.has(String(raw.categoriaId || '')) ? String(raw.categoriaId) : '',
      foto: U.safePhotoUrl(raw.foto),
      comentario: String(raw.comentario || '').slice(0, 500),
      cantidad: Number.isFinite(Number(raw.cantidad)) ? Math.max(0, Number(raw.cantidad)) : 1,
      unidad: String(raw.unidad || 'ud').slice(0, 20),
      fechaAlta: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.fechaAlta || '')) ? raw.fechaAlta : U.todayISO(),
      fechaUltimaCompra: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.fechaUltimaCompra || '')) ? raw.fechaUltimaCompra : null,
      enLista: !!raw.enLista,
      comprado: !!raw.comprado,
      compradoEn: raw.compradoEn || null,
      catalogoId: raw.catalogoId ? String(raw.catalogoId) : null,
      origen: raw.origen === 'catalogo' ? 'catalogo' : 'manual',
      creado: raw.creado || now,
      actualizado: now,
    };
  }

  async function resetData() {
    const confirmed = await confirmAction({
      title: 'Borrar todos los datos',
      message: 'Se eliminarán todos tus productos, fotos, categorías y compras guardadas de este navegador. Esta acción no se puede deshacer.',
      confirmLabel: 'Borrar todo',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await DB.clearAll();
      state.products = [];
      state.categories = [];
      state.byId = new Map();
      state.byCatalogo = new Map();
      state.catMap = new Map();
      state.categoryOrder = new Map();
      state.filters.products = { q: '', cat: '', status: 'todos', sort: 'nombre', limit: 60 };
      state.filters.catalog = { q: '', cat: '', limit: 60 };
      await seedIfNeeded(true);
      await loadAll();
      closeDialog('settings-dialog');
      render();
      toast('Datos borrados. La cesta vuelve a estar vacía.');
    } catch (error) {
      console.error(error);
      toast('No se han podido borrar los datos.');
    }
  }

  async function syncCategories(options = {}) {
    const { silent = false, refreshSettings = true } = options;
    const categories = state.catalog.categorias || [];
    if (!categories.length) {
      if (!silent) toast('No hay categorías en el catálogo.');
      return;
    }
    const existing = new Set(state.categories.map((category) => String(category.id)));
    const seen = new Set();
    const now = new Date().toISOString();
    const missing = [];

    categories.forEach((category, index) => {
      if (!category || !category.nombre) return;
      const id = category.id ? String(category.id) : '';
      if (!id || existing.has(id) || seen.has(id)) return;
      seen.add(id);
      missing.push({
        id,
        nombre: String(category.nombre).slice(0, 50),
        emoji: category.emoji || '🛒',
        color: /^#[0-9a-f]{6}$/i.test(String(category.color || '')) ? category.color : '#2e7d32',
        orden: Number.isFinite(Number(category.orden)) ? Number(category.orden) : index + 1,
        creado: now,
      });
    });

    if (!missing.length) {
      if (!silent) toast('Tus categorías ya están sincronizadas.');
      return;
    }

    try {
      await DB.bulkPut('categories', missing);
      state.categories = sortCategories(await DB.getAll('categories'));
      rebuildCategoryMaps();
      if (state.view === 'categorias') renderCategories();
      if (refreshSettings && els.settingsDialog.open) renderSettingsContent();
      if (!silent) toast(`${U.plural(missing.length, 'categoría añadida', 'categorías añadidas')}.`);
    } catch (error) {
      console.error(error);
      if (!silent) toast('No se han podido sincronizar las categorías.');
    }
  }

  async function refreshCatalog(button) {
    const original = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Actualizando…';
    }

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 120000);
      let response;
      try {
        response = await fetch('api/mercadona.php?action=catalog', {
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
      } finally {
        window.clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!validCatalog(data)) throw new Error('El catálogo recibido no es válido.');

      state.catalog = data;
      state.catalogSource = 'online';
      buildCatalogIndex();
      await DB.metaSet('catalog', data);
      await DB.metaSet('catalogUpdatedAt', data.actualizado || new Date().toISOString());
      await syncCategories({ silent: true, refreshSettings: false });

      if (state.view === 'catalogo') renderCatalog();
      if (els.settingsDialog.open) renderSettingsContent();
      toast(`Catálogo actualizado · ${U.formatNumber(data.productos.length)} productos.`);
    } catch (error) {
      console.error(error);
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
      toast(
        'No se pudo actualizar online. Comprueba que la app se sirve con el backend de catálogo (PHP o Node) o actualiza el catálogo con tools/update-catalog.mjs.',
        { timeout: 8000 }
      );
    }
  }

  async function importAllCatalog() {
    const catalog = state.catalog.productos || [];
    if (!catalog.length) {
      toast('No hay catálogo cargado.');
      return;
    }
    const existing = new Set(state.products.map((product) => product.catalogoId).filter(Boolean).map(String));
    const missing = catalog.filter((item) => !existing.has(String(item.id)));
    if (!missing.length) {
      toast('Ya tienes todos los productos del catálogo en Mis productos.');
      return;
    }

    const addition = missing.length === 1
      ? 'Se añadirá 1 producto'
      : `Se añadirán ${U.formatNumber(missing.length)} productos`;
    const confirmed = await confirmAction({
      title: 'Importar catálogo completo',
      message: `${addition} a Mis productos, sin ${missing.length === 1 ? 'añadirlo' : 'añadirlos'} a la lista. Los que ya tengas del catálogo no se duplican.`,
      confirmLabel: 'Importar',
      danger: false,
    });
    if (!confirmed) return;

    const now = new Date().toISOString();
    const today = U.todayISO();
    const products = missing.map((item) => ({
      id: U.uid(),
      nombre: item.nombre,
      categoriaId: state.catMap.has(String(item.categoriaId)) ? String(item.categoriaId) : '',
      foto: U.safePhotoUrl(item.foto),
      comentario: '',
      cantidad: Number.isFinite(Number(item.cantidad)) ? Math.max(0, Number(item.cantidad)) : 1,
      unidad: item.unidad || 'ud',
      fechaAlta: today,
      fechaUltimaCompra: null,
      enLista: false,
      comprado: false,
      compradoEn: null,
      catalogoId: String(item.id),
      origen: 'catalogo',
      creado: now,
      actualizado: now,
    }));

    try {
      toast('Importando catálogo…', { timeout: 3000 });
      await DB.bulkPut('products', products);
      state.products = state.products.concat(products);
      rebuildProductIndexes();
      closeDialog('settings-dialog');
      render();
      toast(`${U.plural(products.length, 'producto importado', 'productos importados')}.`);
    } catch (error) {
      console.error(error);
      toast('No se ha podido importar el catálogo. Puede que no haya espacio suficiente.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Instalación / PWA                                                  */
  /* ------------------------------------------------------------------ */

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIOS() {
    return (
      /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
    );
  }

  function updateInstallUI() {
    if (!els.installBtn) return;
    const standalone = isStandalone();
    const canShow = !standalone && (!!state.installPrompt || isIOS());
    els.installBtn.hidden = !canShow;
  }

  async function installApp() {
    if (!state.installPrompt) {
      openSettings();
      return;
    }
    const prompt = state.installPrompt;
    state.installPrompt = null;
    try {
      prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice && choice.outcome === 'accepted') toast('Instalando La Cesta…');
    } catch (error) {
      console.warn('No se pudo mostrar el instalador', error);
    }
    updateInstallUI();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;

    const register = () => {
      navigator.serviceWorker
        .register('sw.js')
        .then((registration) => {
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                toast('Hay una nueva versión de La Cesta.', {
                  actionLabel: 'Actualizar',
                  timeout: 12000,
                  onAction: () => {
                    state.swUpdateRequested = true;
                    worker.postMessage({ type: 'SKIP_WAITING' });
                  },
                });
              }
            });
          });
        })
        .catch((error) => console.warn('Service worker no registrado', error));
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (state.swUpdateRequested) {
        state.swUpdateRequested = false;
        window.location.reload();
      }
    });
  }

  function requestPersistence() {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }
  }

  /* ------------------------------------------------------------------ */
  /* Toasts, confirmaciones y diálogos                                  */
  /* ------------------------------------------------------------------ */

  function showDialog(dialog) {
    if (dialog && !dialog.open) {
      try {
        dialog.showModal();
      } catch (error) {
        dialog.setAttribute('open', '');
      }
    }
  }

  function closeDialog(id) {
    if (!id) return;
    const dialog = document.getElementById(id);
    if (dialog && dialog.open) dialog.close();
  }

  function toast(message, options = {}) {
    if (!els.toastWrap) return;
    const { actionLabel, onAction, timeout = 3800 } = options;
    const previous = els.toastWrap.querySelector('.toast');
    if (previous) previous.remove();

    const element = document.createElement('div');
    element.className = 'toast';
    const text = document.createElement('span');
    text.textContent = message;
    element.appendChild(text);

    let timer;
    const hide = () => {
      element.classList.add('leaving');
      window.setTimeout(() => element.remove(), 190);
    };

    if (actionLabel && typeof onAction === 'function') {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast-action';
      action.textContent = actionLabel;
      action.addEventListener('click', async () => {
        window.clearTimeout(timer);
        hide();
        try {
          await onAction();
        } catch (error) {
          console.error(error);
          toast(error && error.message ? error.message : 'No se ha podido deshacer.');
        }
      });
      element.appendChild(action);
    }

    els.toastWrap.appendChild(element);
    timer = window.setTimeout(hide, timeout);
  }

  function confirmAction(options) {
    const { title, message, confirmLabel = 'Aceptar', danger = true } = options;
    return new Promise((resolve) => {
      if (!els.confirmDialog) {
        resolve(window.confirm(message));
        return;
      }
      els.confirmTitle.textContent = title;
      els.confirmMessage.textContent = message;
      els.confirmAccept.textContent = confirmLabel;
      els.confirmAccept.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
      els.confirmDialog.returnValue = 'cancel';
      const onClose = () => {
        els.confirmDialog.removeEventListener('close', onClose);
        resolve(els.confirmDialog.returnValue === 'confirm');
      };
      els.confirmDialog.addEventListener('close', onClose);
      showDialog(els.confirmDialog);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Alias cortos                                                       */
  /* ------------------------------------------------------------------ */

  function esc(value) {
    return U.escapeHtml(value);
  }

  function attr(value) {
    return U.escapeAttr(value);
  }
})();
