// ============================================================
// utils.js — Funciones de ayuda compartidas
// ============================================================

function money(value) {
  const n = parseFloat(value || 0);
  return `${n.toFixed(2)} €`;
}

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Formatea "2026-09-13" a "13 sep 2026" para mostrar en tarjetas.
function formatDatePretty(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  const monthIdx = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} ${months[monthIdx] || m} ${y}`;
}

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diff;
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const today = new Date(todayString());
  const target = new Date(isoDate);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

function openMaps(location) {
  const q = (location || "").trim();
  if (!q) {
    alert("Introduce primero un lugar.");
    return;
  }
  const url =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(q);
  window.open(url, "_blank", "noopener");
}

function openMapsMultiple(locations) {
  const clean = [];
  const seen = new Set();
  for (const loc of locations) {
    const trimmed = (loc || "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    clean.push(trimmed);
  }
  if (clean.length === 0) {
    alert("No hay lugares para mostrar.");
    return;
  }
  if (clean.length === 1) {
    openMaps(clean[0]);
    return;
  }
  // Ruta con varias paradas: origen / paradas intermedias / destino
  const origin = encodeURIComponent(clean[0]);
  const destination = encodeURIComponent(clean[clean.length - 1]);
  const waypoints = clean
    .slice(1, -1)
    .map((w) => encodeURIComponent(w))
    .join("|");
  let url =
    `https://www.google.com/maps/dir/?api=1&origin=${origin}` +
    `&destination=${destination}`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  window.open(url, "_blank", "noopener");
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function download(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export {
  money,
  todayString,
  escapeHtml,
  formatDatePretty,
  daysBetween,
  daysUntil,
  openMaps,
  openMapsMultiple,
  uid,
  download,
};
