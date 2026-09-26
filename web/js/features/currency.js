// ============================================================
// features/currency.js — Conversor de moneda en la web.
//
// Equivale a openCurrencyConverterSheet() de js/sections.js: importe
// en otra moneda -> euros (tipos del BCE vía js/currency.js, con su
// respaldo y su caché en ajustes "currency_rates_cache" /
// "currency_rates_fallback_cache"), moneda de origen por defecto USD
// (el primer acceso rápido que no es EUR), y "Usar en un gasto nuevo"
// que abre el formulario de gasto ya relleno, igual que la app.
// ============================================================

import { TOP_CURRENCIES, ALL_CURRENCIES, convertCurrency } from "../../../js/currency.js";

// Mismos valores que js/sections.js
const EXPENSE_CATEGORIES = ["Transporte", "Alojamiento", "Comida", "Ocio", "Compras", "Otros"];
const EXPENSE_ME_ID = "me";

const byCode = (code) => ALL_CURRENCIES.find((c) => c.code === code);

export function openCurrency(trip, ctx) {
  const { esc, money } = ctx;
  const topChips = TOP_CURRENCIES.filter((code) => code !== "EUR");
  let selected = byCode(topChips[0]); // USD por defecto, como la app
  let lastConverted = null;
  let calcSeq = 0;

  const html = `
    <div class="cur">
      <p class="muted small cur-intro">Tipos de cambio del Banco Central Europeo.${
        trip ? " Todos los gastos del viaje se guardan en euros, así que aquí conviertes antes de apuntarlo." : ""
      }</p>
      <label class="field">
        <span class="label">Importe</span>
        <input type="number" data-amount step="0.01" placeholder="0.00" inputmode="decimal" />
      </label>
      <div class="field">
        <span class="label">Moneda de origen</span>
        <div class="cur-chips">${topChips
          .map((code) => `<button type="button" class="chip-btn" data-code="${code}" aria-pressed="false">${code}</button>`)
          .join("")}</div>
        <input type="search" class="cur-search" data-search placeholder="O busca cualquier otra moneda…" autocomplete="off" />
        <div class="cur-results" data-results></div>
        <p class="cur-selected muted small" data-selected></p>
      </div>
      <div class="cur-out" data-out aria-live="polite">
        <span class="label">En euros</span>
        <b data-result>—</b>
      </div>
      ${trip ? `<div class="cur-foot"><button type="button" class="btn btn-primary" data-use disabled>Usar en un gasto nuevo</button></div>` : ""}
    </div>`;

  const { root, close } = ctx.openSheet({ title: "🔁 Conversor de moneda", html });
  const $ = (s) => root.querySelector(s);
  const amountEl = $("[data-amount]");
  const searchEl = $("[data-search]");
  const resultsEl = $("[data-results]");
  const selectedEl = $("[data-selected]");
  const resultEl = $("[data-result]");
  const useBtn = $("[data-use]");
  const chipEls = [...root.querySelectorAll("[data-code]")].filter((b) => b.closest(".cur-chips"));

  function updateSelectedLabel() {
    chipEls.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.code === selected.code)));
    selectedEl.textContent = `Convirtiendo desde: ${selected.label} (${selected.code})`;
  }

  function selectCurrency(currency) {
    if (!currency) return;
    selected = currency;
    searchEl.value = "";
    resultsEl.innerHTML = "";
    updateSelectedLabel();
    recalc();
  }

  chipEls.forEach((btn) => btn.addEventListener("click", () => selectCurrency(byCode(btn.dataset.code))));

  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    if (q.length < 1) {
      resultsEl.innerHTML = "";
      return;
    }
    const matches = ALL_CURRENCIES.filter(
      (c) => c.code !== "EUR" && (c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    ).slice(0, 8);
    resultsEl.innerHTML = matches.length
      ? matches
          .map(
            (c) => `<button type="button" class="cur-result" data-pick="${c.code}"><span>${esc(c.label)}</span><span class="mono">${c.code}</span></button>`
          )
          .join("")
      : `<p class="muted small">Sin resultados para "${esc(searchEl.value.trim())}"</p>`;
  });
  resultsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (b) selectCurrency(byCode(b.dataset.pick));
  });
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      resultsEl.querySelector("[data-pick]")?.click();
    }
  });

  async function recalc() {
    const my = ++calcSeq;
    const amount = parseFloat(amountEl.value || 0);
    resultEl.classList.remove("cur-error");
    if (!amount) {
      resultEl.textContent = "—";
      if (useBtn) useBtn.disabled = true;
      lastConverted = null;
      return;
    }
    resultEl.textContent = "Calculando…";
    const converted = await convertCurrency(amount, selected.code, "EUR");
    if (my !== calcSeq) return;
    if (converted === null) {
      resultEl.classList.add("cur-error");
      resultEl.textContent = "No se pudo obtener el tipo de cambio para esta moneda (revisa tu conexión e inténtalo de nuevo).";
      if (useBtn) useBtn.disabled = true;
      lastConverted = null;
      return;
    }
    lastConverted = converted;
    resultEl.textContent = money(converted);
    if (useBtn) useBtn.disabled = false;
  }

  updateSelectedLabel();
  amountEl.addEventListener("input", recalc);
  amountEl.focus();

  useBtn?.addEventListener("click", () => {
    if (lastConverted === null) return;
    const label = selected.label;
    close();
    openExpenseForm(trip, ctx, {
      amount: Math.round(lastConverted * 100) / 100,
      date: ctx.todayString(),
      description: `Pago en ${label}`,
    });
  });
}

// Formulario de gasto nuevo con valores iniciales (openExpenseForm de
// js/sections.js con `prefill`): mismos campos y mismos valores
// guardados, incluido paid_by/split_with también sin acompañantes.
async function openExpenseForm(trip, ctx, prefill) {
  const { esc, Data, todayString } = ctx;
  const companions = (await Data.getAllByTrip("companions", trip.id))
    .filter((c) => !c.archived)
    .sort((a, b) => (a.id || 0) - (b.id || 0));
  const people = [{ id: EXPENSE_ME_ID, name: "Yo" }, ...companions.map((c) => ({ id: String(c.id), name: c.name }))];
  const hasCompanions = companions.length > 0;

  const html = `
    <form class="cur-exp" novalidate>
      <div class="cur-grid">
        <label class="field cur-full"><span class="label">Descripción *</span><input data-f="description" value="${esc(prefill.description || "")}" /></label>
        <label class="field"><span class="label">Categoría</span><select data-f="category">${EXPENSE_CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Importe (€) *</span><input data-f="amount" type="number" step="0.01" value="${prefill.amount ?? ""}" /></label>
        <label class="field"><span class="label">Fecha</span><input data-f="date" type="date" value="${esc(prefill.date || todayString())}" /></label>
        ${
          hasCompanions
            ? `<label class="field"><span class="label">Pagado por</span><select data-f="paid_by">${people
                .map((p) => `<option value="${esc(p.id)}" ${p.id === EXPENSE_ME_ID ? "selected" : ""}>${esc(p.name)}</option>`)
                .join("")}</select></label>
               <div class="field cur-full"><span class="label">Dividir entre</span><div class="cur-checks">${people
                 .map((p) => `<label><input type="checkbox" data-split="${esc(p.id)}" /> ${esc(p.name)}</label>`)
                 .join("")}</div><span class="muted small">Marca a quienes comparten este gasto para repartirlo a partes iguales. Si no marcas al menos a dos, se cuenta como un gasto sin dividir.</span></div>`
            : `<p class="muted small cur-full">Añade acompañantes (en Gastos → Acompañantes) para poder dividir este gasto entre varios.</p>`
        }
      </div>
      <p class="form-error" role="alert"></p>
      <div class="cur-foot">
        <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
        <button class="btn btn-primary" type="submit">Guardar</button>
      </div>
    </form>`;

  const { root, close } = ctx.openSheet({ title: "Nuevo gasto", html });
  const f = (n) => root.querySelector(`[data-f="${n}"]`);
  root.querySelector("[data-cancel]").addEventListener("click", close);
  root.querySelector("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const description = f("description").value.trim();
    const amount = parseFloat(f("amount").value || "0") || 0;
    const err = root.querySelector(".form-error");
    if (!description) return (err.textContent = 'Falta "Descripción"');
    if (!amount) return (err.textContent = 'Falta "Importe (€)"');
    const values = {
      description,
      category: f("category").value,
      amount,
      date: f("date").value || todayString(),
    };
    if (hasCompanions) {
      values.paid_by = f("paid_by").value;
      values.split_with = [...root.querySelectorAll("[data-split]")].filter((cb) => cb.checked).map((cb) => cb.dataset.split);
    } else {
      values.paid_by = EXPENSE_ME_ID;
      values.split_with = [];
    }
    close();
    await ctx.saveItem("expenses", null, values, "Gasto guardado");
  });
  setTimeout(() => f("description")?.focus(), 50);
}
