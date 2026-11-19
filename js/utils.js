/* La Cesta — utilidades compartidas */
(function () {
  'use strict';

  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function normalize(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toISODate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function parseDate(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T12:00:00`);
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const DATE_FORMAT_NO_YEAR = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  function formatDate(value, withYear = true) {
    const d = parseDate(value);
    if (!d) return '';
    return (withYear ? DATE_FORMAT : DATE_FORMAT_NO_YEAR).format(d);
  }

  function daysAgo(value) {
    const d = parseDate(value);
    if (!d) return null;
    const today = new Date();
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((b - a) / 86400000);
  }

  function formatDateSmart(value) {
    const diff = daysAgo(value);
    if (diff === null) return '';
    if (diff === 0) return 'hoy';
    if (diff === 1) return 'ayer';
    if (diff > 1 && diff < 7) return `hace ${diff} días`;
    const d = parseDate(value);
    const now = new Date();
    return formatDate(value, d.getFullYear() !== now.getFullYear());
  }

  function formatDateTime(value) {
    const d = parseDate(value);
    return d ? DATE_TIME_FORMAT.format(d) : '';
  }

  function formatQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '1';
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
  }

  function formatNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? new Intl.NumberFormat('es-ES').format(n) : '0';
  }

  function plural(n, singular, pluralForm) {
    return `${formatNumber(n)} ${n === 1 ? singular : pluralForm}`;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safePhotoUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('data:image/')) return url;
    if (/^https?:\/\//i.test(url)) return url;
    return '';
  }

  function hexToRgba(hex, alpha) {
    const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(String(hex || '').trim());
    if (!match) return `rgba(46, 125, 50, ${alpha})`;
    let value = match[1];
    if (value.length === 3) value = value.split('').map((c) => c + c).join('');
    const int = parseInt(value, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se ha podido leer la imagen.'));
      };
      img.src = url;
    });
  }

  async function resizeImage(file, maxSize = 900, quality = 0.82) {
    if (!file) throw new Error('No has seleccionado ninguna imagen.');
    if (!file.type || !file.type.startsWith('image/')) {
      throw new Error('El archivo debe ser una imagen.');
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('La imagen es demasiado grande (máximo 20 MB).');
    }

    let source;
    let width;
    let height;
    let closeSource = null;
    try {
      if (typeof createImageBitmap === 'function') {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        width = source.width;
        height = source.height;
        closeSource = () => source.close && source.close();
      } else {
        throw new Error('fallback');
      }
    } catch (error) {
      source = await loadImageElement(file);
      width = source.naturalWidth || source.width;
      height = source.naturalHeight || source.height;
    }

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Tu navegador no permite procesar la imagen.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, targetW, targetH);
    if (closeSource) closeSource();

    return canvas.toDataURL('image/jpeg', quality);
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se ha podido leer el archivo.'));
      reader.readAsDataURL(blob);
    });
  }

  function downloadFile(filename, content, type = 'application/json') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  window.CestaUtils = {
    escapeHtml,
    escapeAttr,
    normalize,
    uid,
    toISODate,
    todayISO,
    parseDate,
    formatDate,
    formatDateSmart,
    formatDateTime,
    formatQty,
    formatNumber,
    plural,
    debounce,
    clamp,
    safePhotoUrl,
    hexToRgba,
    resizeImage,
    blobToDataURL,
    downloadFile,
  };
})();
