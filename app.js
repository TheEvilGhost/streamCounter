(function () {
  "use strict";

  const STORAGE_KEY = "stream-analyzer-v1";
  const REVISION_LOG_KEY = "stream-analyzer-revisions-v1";
  const MAX_REVISIONS = 80;

  const PLATFORMS = [
    { id: "youtube", label: "YouTube", short: "YT", kind: "stream" },
    { id: "spotify", label: "Spotify", short: "SP", kind: "stream" },
    { id: "yandex", label: "Яндекс Музыка", short: "ЯМ", kind: "stream" },
    { id: "apple", label: "Apple Music", short: "Apple", kind: "stream" },
    { id: "soundcloud", label: "SoundCloud", short: "SC", kind: "stream" },
    { id: "tiktok", label: "TikTok", short: "TT", kind: "publication", inputLabel: "TikTok (публикаций)" },
  ];

  /** USD за стрим или за публикацию (TikTok) — ориентиры; можно изменить в «Ставки». */
  const DEFAULT_RATES = {
    youtube: { min: 0.0006, avg: 0.0045, max: 0.012 },
    spotify: { min: 0.0012, avg: 0.0034, max: 0.009 },
    yandex: { min: 0.0005, avg: 0.0018, max: 0.0045 },
    apple: { min: 0.004, avg: 0.0078, max: 0.012 },
    soundcloud: { min: 0.0003, avg: 0.0025, max: 0.006 },
    tiktok: { min: 0.02, avg: 0.08, max: 0.25 },
  };

  const CHART_COLORS = {
    youtube: "rgba(253, 230, 138, 0.85)",
    spotify: "rgba(196, 181, 253, 0.9)",
    yandex: "rgba(249, 168, 212, 0.9)",
    apple: "rgba(252, 165, 165, 0.9)",
    soundcloud: "rgba(251, 146, 60, 0.9)",
    tiktok: "rgba(45, 212, 191, 0.9)",
    total: "rgba(165, 243, 252, 0.85)",
  };

  function emptyStreams() {
    const o = {};
    for (const p of PLATFORMS) o[p.id] = 0;
    return o;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    } catch {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      entries: [],
      rates: structuredClone(DEFAULT_RATES),
      sortNewestFirst: true,
      displayCurrency: "USD",
      rubPerUsd: 92,
    };
  }

  function dedupeEntriesByDate(entries) {
    const byDate = new Map();
    for (const e of entries) {
      byDate.set(e.date, e);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  function normalizeState(s) {
    const base = defaultState();
    if (!s || typeof s !== "object") return base;
    const rawEntries = Array.isArray(s.entries) ? s.entries.map(normalizeEntry).filter(Boolean) : [];
    return {
      entries: dedupeEntriesByDate(rawEntries),
      rates: mergeRates(s.rates),
      sortNewestFirst: s.sortNewestFirst !== false,
      displayCurrency: s.displayCurrency === "RUB" ? "RUB" : "USD",
      rubPerUsd: typeof s.rubPerUsd === "number" && s.rubPerUsd > 0 ? s.rubPerUsd : 92,
    };
  }

  function mergeRates(r) {
    const out = structuredClone(DEFAULT_RATES);
    if (!r || typeof r !== "object") return out;
    for (const id of Object.keys(out)) {
      if (r[id] && typeof r[id] === "object") {
        for (const tier of ["min", "avg", "max"]) {
          const v = Number(r[id][tier]);
          if (Number.isFinite(v) && v >= 0) out[id][tier] = v;
        }
      }
    }
    return out;
  }

  function normalizeEntry(e) {
    if (!e || typeof e !== "object") return null;
    const id = typeof e.id === "string" && e.id ? e.id : crypto.randomUUID();
    const date = typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null;
    if (!date) return null;
    const streams = emptyStreams();
    for (const p of PLATFORMS) {
      streams[p.id] = Math.max(0, Math.floor(Number(e.streams?.[p.id]) || 0));
    }
    const note = typeof e.note === "string" ? e.note.slice(0, 200) : "";
    return { id, date, streams, note };
  }

  function normalizeRevisionSnapshot(snap) {
    if (!snap || typeof snap !== "object") return null;
    const rawEntries = Array.isArray(snap.entries) ? snap.entries.map(normalizeEntry).filter(Boolean) : [];
    return {
      ts: typeof snap.ts === "string" ? snap.ts : new Date().toISOString(),
      entries: dedupeEntriesByDate(rawEntries),
      rates: mergeRates(snap.rates),
      sortNewestFirst: snap.sortNewestFirst !== false,
      displayCurrency: snap.displayCurrency === "RUB" ? "RUB" : "USD",
      rubPerUsd: typeof snap.rubPerUsd === "number" && snap.rubPerUsd > 0 ? snap.rubPerUsd : 92,
    };
  }

  function loadRevisionList() {
    try {
      const r = localStorage.getItem(REVISION_LOG_KEY);
      if (!r) return [];
      const arr = JSON.parse(r);
      if (!Array.isArray(arr)) return [];
      return arr.map((x) => normalizeRevisionSnapshot(x)).filter(Boolean);
    } catch {
      return [];
    }
  }

  function appendRevisionSnapshot(prevNorm) {
    const snap = {
      ts: new Date().toISOString(),
      entries: structuredClone(prevNorm.entries),
      rates: structuredClone(prevNorm.rates),
      sortNewestFirst: prevNorm.sortNewestFirst,
      displayCurrency: prevNorm.displayCurrency,
      rubPerUsd: prevNorm.rubPerUsd,
    };
    let list = loadRevisionList();
    list.unshift(snap);
    if (list.length > MAX_REVISIONS) list = list.slice(0, MAX_REVISIONS);
    localStorage.setItem(REVISION_LOG_KEY, JSON.stringify(list));
  }

  function saveState(state) {
    try {
      const prevRaw = localStorage.getItem(STORAGE_KEY);
      if (prevRaw) {
        const prevNorm = normalizeState(JSON.parse(prevRaw));
        const nextNorm = normalizeState(state);
        const same =
          JSON.stringify(prevNorm.entries) === JSON.stringify(nextNorm.entries) &&
          JSON.stringify(prevNorm.rates) === JSON.stringify(nextNorm.rates) &&
          prevNorm.sortNewestFirst === nextNorm.sortNewestFirst &&
          prevNorm.displayCurrency === nextNorm.displayCurrency &&
          prevNorm.rubPerUsd === nextNorm.rubPerUsd;
        if (!same) appendRevisionSnapshot(prevNorm);
      }
    } catch {
      /* ignore */
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function totalStreams(entry) {
    let sum = 0;
    for (const p of PLATFORMS) sum += entry.streams[p.id] || 0;
    return sum;
  }

  function revenueForEntry(entry, rates, tier) {
    let sum = 0;
    for (const p of PLATFORMS) {
      sum += entry.streams[p.id] * rates[p.id][tier];
    }
    return sum;
  }

  function formatMoney(amountUsd, state) {
    if (state.displayCurrency === "RUB") {
      const rub = amountUsd * state.rubPerUsd;
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: rub >= 100 ? 0 : 2,
      }).format(rub);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: amountUsd >= 100 ? 2 : 4,
    }).format(amountUsd);
  }

  /** Абсолютная сумма для отображения дельты (знак выносится отдельно). */
  function formatMoneyUnsigned(amountUsd, state) {
    const a = Math.abs(amountUsd);
    if (state.displayCurrency === "RUB") {
      const rub = a * state.rubPerUsd;
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: rub >= 100 ? 0 : 2,
      }).format(rub);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: a >= 100 ? 2 : 4,
    }).format(a);
  }

  /** Предыдущий календарный снимок (меньшая дата), чтобы считать прирост за период между снимками. */
  function previousEntryByDate(entries) {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map();
    for (let i = 1; i < sorted.length; i++) {
      map.set(sorted[i].date, sorted[i - 1]);
    }
    return map;
  }

  function formatDeltaStreamsHtml(delta) {
    if (delta === null) return '<span class="delta-neutral">—</span>';
    if (delta === 0) return '<span class="delta-zero">→ 0</span>';
    const up = delta > 0;
    const arrow = up ? "↑" : "↓";
    const cls = up ? "delta-up" : "delta-down";
    const sign = up ? "+" : "−";
    const n = Math.abs(delta).toLocaleString("ru-RU");
    return `<span class="${cls}"><span class="delta-arrow" aria-hidden="true">${arrow}</span> ${sign}${n}</span>`;
  }

  function formatDeltaMoneyHtml(deltaUsd, state) {
    if (deltaUsd === null) return '<span class="delta-neutral">—</span>';
    if (Math.abs(deltaUsd) < 1e-12) return '<span class="delta-zero">→ 0</span>';
    const up = deltaUsd > 0;
    const arrow = up ? "↑" : "↓";
    const cls = up ? "delta-up" : "delta-down";
    const sign = up ? "+" : "−";
    const body = formatMoneyUnsigned(deltaUsd, state);
    return `<span class="${cls}"><span class="delta-arrow" aria-hidden="true">${arrow}</span> ${sign}${body}</span>`;
  }

  function sortedEntries(state) {
    const list = [...state.entries];
    list.sort((a, b) => (state.sortNewestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    return list;
  }

  /** Самая поздняя дата в журнале: в строках — накопленные просмотры, между днями не суммируем. */
  function latestEntry(state) {
    if (!state.entries.length) return null;
    const sorted = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
    return sorted[sorted.length - 1];
  }

  function snapshotFromEntry(entry, rates) {
    const totals = {};
    for (const p of PLATFORMS) totals[p.id] = entry.streams[p.id] || 0;
    const streams = totalStreams(entry);
    return {
      entry,
      totals,
      streams,
      revMin: revenueForEntry(entry, rates, "min"),
      revAvg: revenueForEntry(entry, rates, "avg"),
      revMax: revenueForEntry(entry, rates, "max"),
    };
  }

  function platformSummaryLine(totals) {
    return PLATFORMS.map((p) => `${p.short} ${totals[p.id].toLocaleString("ru-RU")}`).join(" · ");
  }

  function readStreamsFromInputs(source) {
    const streams = emptyStreams();
    for (const p of PLATFORMS) {
      const input = source[p.id];
      if (input) streams[p.id] = input.value;
    }
    return streams;
  }

  function resetEntryFormNumbers() {
    for (const p of PLATFORMS) {
      const input = el.streamInputs[p.id];
      if (input) input.value = "0";
    }
  }

  let state = loadState();
  let charts = { streams: null, share: null, revenue: null };

  const el = {
    entryForm: document.getElementById("entryForm"),
    entryDate: document.getElementById("entryDate"),
    streamInputs: {},
    entryNote: document.getElementById("entryNote"),
    statCards: document.getElementById("statCards"),
    entriesBody: document.getElementById("entriesBody"),
    emptyHint: document.getElementById("emptyHint"),
    sortToggle: document.getElementById("sortToggle"),
    displayCurrency: document.getElementById("displayCurrency"),
    rubPerUsd: document.getElementById("rubPerUsd"),
    rubRateWrap: document.getElementById("rubRateWrap"),
    openRatesBtn: document.getElementById("openRatesBtn"),
    ratesModal: document.getElementById("ratesModal"),
    ratesEditor: document.getElementById("ratesEditor"),
    ratesResetBtn: document.getElementById("ratesResetBtn"),
    ratesCloseBtn: document.getElementById("ratesCloseBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importFile: document.getElementById("importFile"),
    openHistoryBtn: document.getElementById("openHistoryBtn"),
    historyModal: document.getElementById("historyModal"),
    revisionList: document.getElementById("revisionList"),
    revisionEmpty: document.getElementById("revisionEmpty"),
    historyCloseBtn: document.getElementById("historyCloseBtn"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    editModal: document.getElementById("editModal"),
    editForm: document.getElementById("editForm"),
    editId: document.getElementById("editId"),
    editDate: document.getElementById("editDate"),
    editStreamInputs: {},
    editNote: document.getElementById("editNote"),
    editCancelBtn: document.getElementById("editCancelBtn"),
    deleteEntryBtn: document.getElementById("deleteEntryBtn"),
  };

  for (const p of PLATFORMS) {
    el.streamInputs[p.id] = document.getElementById(`streams-${p.id}`);
    el.editStreamInputs[p.id] = document.getElementById(`edit-${p.id}`);
  }

  function renderTableHead() {
    const row = document.getElementById("entriesHeadRow");
    if (!row) return;
    const platformTh = PLATFORMS.map((p) => {
      const title = p.kind === "publication" ? `${p.label} (публ.)` : p.label;
      return `<th title="${escapeHtml(p.label)}">${escapeHtml(p.short)}</th>`;
    }).join("");
    row.innerHTML = `
      <th>Дата</th>
      ${platformTh}
      <th>Σ</th>
      <th class="delta-head">Δ <span class="th-hint">к прошлому снимку</span></th>
      <th>Доход (ср.)</th>
      <th class="delta-head">Δ $ <span class="th-hint">к прошлому снимку</span></th>
      <th></th>`;
  }

  function renderRevisionList() {
    const list = loadRevisionList();
    el.revisionList.innerHTML = "";
    el.revisionEmpty.hidden = list.length > 0;
    list.forEach((snap, i) => {
      const li = document.createElement("li");
      li.className = "revision-item";
      const when = new Date(snap.ts).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
      const n = snap.entries.length;
      const countLabel = `строк в журнале: ${n}`;
      li.innerHTML = `
        <div class="revision-meta">
          <span class="revision-time">${escapeHtml(when)}</span>
          <span class="revision-count">${escapeHtml(countLabel)}</span>
        </div>
        <button type="button" class="btn primary btn-sm" data-restore="${i}">Восстановить</button>`;
      el.revisionList.appendChild(li);
    });
    el.revisionList.querySelectorAll("[data-restore]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-restore"));
        if (!Number.isFinite(idx)) return;
        restoreRevision(idx);
      });
    });
  }

  function restoreRevision(index) {
    const list = loadRevisionList();
    const snap = list[index];
    if (!snap) return;
    const when = new Date(snap.ts).toLocaleString("ru-RU");
    if (!confirm(`Заменить текущие данные на снимок от ${when}? Текущее состояние попадёт в историю как новый снимок.`)) return;
    state = normalizeState({
      entries: snap.entries,
      rates: snap.rates,
      sortNewestFirst: snap.sortNewestFirst,
      displayCurrency: snap.displayCurrency,
      rubPerUsd: snap.rubPerUsd,
    });
    saveState(state);
    syncUIFromState();
    renderRevisionList();
    refreshAll();
  }

  el.openHistoryBtn.addEventListener("click", () => {
    renderRevisionList();
    el.historyModal.showModal();
  });

  el.historyCloseBtn.addEventListener("click", () => el.historyModal.close());

  el.clearHistoryBtn.addEventListener("click", () => {
    if (!confirm("Удалить все снимки истории в этом браузере? Сами дни в журнале не изменятся.")) return;
    localStorage.removeItem(REVISION_LOG_KEY);
    renderRevisionList();
  });

  function todayISODate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function initFormDefaults() {
    el.entryDate.value = todayISODate();
  }

  function renderStatCards() {
    el.statCards.innerHTML = "";
    if (state.entries.length === 0) {
      el.statCards.innerHTML =
        '<div class="stat-card"><span class="label">Нет данных</span><div class="value">—</div><div class="sub">Добавьте дни в журнал</div></div>';
      return;
    }

    const latest = latestEntry(state);
    const snap = snapshotFromEntry(latest, state.rates);
    const { totals, streams, revMin, revAvg, revMax } = snap;
    const onDate = formatDateRu(latest.date);

    const cards = [
      {
        label: "Текущий снимок (стримы + публикации)",
        value: streams.toLocaleString("ru-RU"),
        sub: `на ${onDate}: ${platformSummaryLine(totals)}`,
        cls: "",
      },
      {
        label: "Доход (оценка по этому снимку, сред.)",
        value: formatMoney(revAvg, state),
        sub: `мин ${formatMoney(revMin, state)} · макс ${formatMoney(revMax, state)}`,
        cls: "accent-rose",
      },
      {
        label: "Снимков в журнале",
        value: String(state.entries.length),
        sub: "в каждой строке — накопленные цифры на дату, без сложения между днями",
        cls: "accent-ice",
      },
    ];

    for (const c of cards) {
      const div = document.createElement("div");
      div.className = "stat-card " + (c.cls || "");
      div.innerHTML = `<span class="label">${escapeHtml(c.label)}</span><div class="value">${escapeHtml(
        c.value
      )}</div><div class="sub">${escapeHtml(c.sub)}</div>`;
      el.statCards.appendChild(div);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateRu(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }

  function renderTable() {
    const list = sortedEntries(state);
    const prevByDate = previousEntryByDate(state.entries);
    el.entriesBody.innerHTML = "";
    el.emptyHint.hidden = list.length > 0;

    for (const e of list) {
      const tr = document.createElement("tr");
      const avgRev = revenueForEntry(e, state.rates, "avg");
      const prev = prevByDate.get(e.date) || null;
      const dStreams = prev ? totalStreams(e) - totalStreams(prev) : null;
      const dMoney = prev ? revenueForEntry(e, state.rates, "avg") - revenueForEntry(prev, state.rates, "avg") : null;
      const noteHtml = e.note ? `<span class="note" title="${escapeHtml(e.note)}">${escapeHtml(e.note)}</span>` : "";
      const platformCells = PLATFORMS.map(
        (p) => `<td>${(e.streams[p.id] || 0).toLocaleString("ru-RU")}</td>`
      ).join("");
      tr.innerHTML = `
        <td>${formatDateRu(e.date)}${noteHtml}</td>
        ${platformCells}
        <td>${totalStreams(e).toLocaleString("ru-RU")}</td>
        <td class="delta-col">${formatDeltaStreamsHtml(dStreams)}</td>
        <td>${formatMoney(avgRev, state)}</td>
        <td class="delta-col">${formatDeltaMoneyHtml(dMoney, state)}</td>
        <td><button type="button" class="btn-icon" data-edit="${escapeHtml(e.id)}">Изменить</button></td>`;
      el.entriesBody.appendChild(tr);
    }

    el.entriesBody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openEdit(btn.getAttribute("data-edit")));
    });
  }

  function upsertEntry(entry) {
    const idx = state.entries.findIndex((x) => x.id === entry.id);
    if (idx >= 0) {
      state.entries[idx] = entry;
      state.entries = dedupeEntriesByDate(state.entries);
      return;
    }
    state.entries.push(entry);
    state.entries = dedupeEntriesByDate(state.entries);
  }

  el.entryForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const entry = normalizeEntry({
      id: crypto.randomUUID(),
      date: el.entryDate.value,
      streams: readStreamsFromInputs(el.streamInputs),
      note: el.entryNote.value.trim(),
    });
    if (!entry) return;
    const existing = state.entries.find((x) => x.date === entry.date);
    if (existing) {
      if (!confirm(`За ${formatDateRu(entry.date)} уже есть запись. Заменить числа на новые?`)) return;
      entry.id = existing.id;
    }
    upsertEntry(entry);
    saveState(state);
    el.entryForm.reset();
    initFormDefaults();
    resetEntryFormNumbers();
    refreshAll();
  });

  function openEdit(id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) return;
    el.editId.value = e.id;
    el.editDate.value = e.date;
    for (const p of PLATFORMS) {
      const input = el.editStreamInputs[p.id];
      if (input) input.value = e.streams[p.id] || 0;
    }
    el.editNote.value = e.note || "";
    el.editModal.showModal();
  }

  el.editCancelBtn.addEventListener("click", () => el.editModal.close());

  el.editForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const id = el.editId.value;
    const updated = normalizeEntry({
      id,
      date: el.editDate.value,
      streams: readStreamsFromInputs(el.editStreamInputs),
      note: el.editNote.value.trim(),
    });
    if (!updated) return;
    const clash = state.entries.find((x) => x.date === updated.date && x.id !== updated.id);
    if (clash) {
      alert("На эту дату уже есть другая строка. Сначала удалите или смените дату.");
      return;
    }
    upsertEntry(updated);
    saveState(state);
    el.editModal.close();
    refreshAll();
  });

  el.deleteEntryBtn.addEventListener("click", () => {
    const id = el.editId.value;
    if (!confirm("Удалить запись за этот день?")) return;
    state.entries = state.entries.filter((x) => x.id !== id);
    saveState(state);
    el.editModal.close();
    refreshAll();
  });

  el.sortToggle.addEventListener("click", () => {
    state.sortNewestFirst = !state.sortNewestFirst;
    el.sortToggle.textContent = state.sortNewestFirst ? "Сначала новые" : "Сначала старые";
    saveState(state);
    refreshAll();
  });

  el.displayCurrency.addEventListener("change", () => {
    state.displayCurrency = el.displayCurrency.value;
    el.rubRateWrap.hidden = state.displayCurrency !== "RUB";
    saveState(state);
    refreshAll();
  });

  el.rubPerUsd.addEventListener("change", () => {
    const v = Number(el.rubPerUsd.value);
    state.rubPerUsd = Number.isFinite(v) && v > 0 ? v : 92;
    el.rubPerUsd.value = String(state.rubPerUsd);
    saveState(state);
    refreshAll();
  });

  el.openRatesBtn.addEventListener("click", () => {
    renderRatesEditor();
    el.ratesModal.showModal();
  });

  function renderRatesEditor() {
    el.ratesEditor.innerHTML = "";
    for (const p of PLATFORMS) {
      const r = state.rates[p.id];
      const unit = p.kind === "publication" ? "за публикацию" : "за стрим";
      const block = document.createElement("div");
      block.className = "rate-platform";
      block.innerHTML = `<strong>${escapeHtml(p.label)}</strong>
        <span class="rate-unit-hint">${escapeHtml(unit)} · USD</span>
        <div class="rate-row">
          <label>Мин<input type="number" data-platform="${p.id}" data-tier="min" step="any" min="0" value="${r.min}" /></label>
          <label>Среднее<input type="number" data-platform="${p.id}" data-tier="avg" step="any" min="0" value="${r.avg}" /></label>
          <label>Макс<input type="number" data-platform="${p.id}" data-tier="max" step="any" min="0" value="${r.max}" /></label>
        </div>`;
      el.ratesEditor.appendChild(block);
    }
  }

  function readRatesFromEditor() {
    el.ratesEditor.querySelectorAll("input[data-platform]").forEach((inp) => {
      const platform = inp.getAttribute("data-platform");
      const tier = inp.getAttribute("data-tier");
      const v = Number(inp.value);
      if (platform && tier && state.rates[platform] && Number.isFinite(v) && v >= 0) {
        state.rates[platform][tier] = v;
      }
    });
  }

  el.ratesCloseBtn.addEventListener("click", () => {
    el.ratesModal.close();
  });

  el.ratesResetBtn.addEventListener("click", () => {
    state.rates = structuredClone(DEFAULT_RATES);
    saveState(state);
    renderRatesEditor();
    refreshAll();
  });

  el.ratesModal.addEventListener("close", () => {
    readRatesFromEditor();
    saveState(state);
    refreshAll();
  });

  el.exportBtn.addEventListener("click", () => {
    const payload = { ...state, _exportRevisions: loadRevisionList().slice(0, MAX_REVISIONS) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stream-analyzer-backup-${todayISODate()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  el.importFile.addEventListener("change", () => {
    const file = el.importFile.files?.[0];
    el.importFile.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed._exportRevisions)) {
          const cleaned = parsed._exportRevisions.map((x) => normalizeRevisionSnapshot(x)).filter(Boolean).slice(0, MAX_REVISIONS);
          localStorage.setItem(REVISION_LOG_KEY, JSON.stringify(cleaned));
        }
        const next = normalizeState(parsed);
        if (!confirm("Заменить текущие данные импортом? Рекомендуется сначала экспортировать копию.")) return;
        state = next;
        saveState(state);
        syncUIFromState();
        refreshAll();
      } catch {
        alert("Не удалось прочитать JSON.");
      }
    };
    reader.readAsText(file);
  });

  function chartFontColor() {
    return "rgba(235, 230, 245, 0.75)";
  }

  function chartGridColor() {
    return "rgba(196, 181, 253, 0.12)";
  }

  function destroyCharts() {
    for (const k of Object.keys(charts)) {
      if (charts[k]) {
        charts[k].destroy();
        charts[k] = null;
      }
    }
  }

  function moneyForChart(usd) {
    if (state.displayCurrency === "RUB") return usd * state.rubPerUsd;
    return usd;
  }

  function renderCharts() {
    destroyCharts();
    const byDate = [...state.entries].sort((a, b) => a.date.localeCompare(b.date));
    const labels = byDate.map((e) => formatDateRu(e.date));

    const ctxS = document.getElementById("chartStreams");
    const ctxSh = document.getElementById("chartShare");
    const ctxR = document.getElementById("chartRevenue");

    if (!ctxS || !ctxSh || !ctxR) return;

    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: chartFontColor(), font: { family: "Outfit" } },
        },
      },
      scales: {},
    };

    if (byDate.length === 0) {
      charts.streams = new Chart(ctxS, {
        type: "line",
        data: { labels: ["—"], datasets: [{ label: "Нет данных", data: [0], borderColor: CHART_COLORS.total }] },
        options: { ...commonOpts, plugins: { legend: { display: false } } },
      });
      charts.share = new Chart(ctxSh, {
        type: "doughnut",
        data: {
          labels: PLATFORMS.map((p) => p.label),
          datasets: [
            {
              data: PLATFORMS.map(() => 1),
              backgroundColor: PLATFORMS.map((p) => CHART_COLORS[p.id]),
            },
          ],
        },
        options: { ...commonOpts },
      });
      charts.revenue = new Chart(ctxR, {
        type: "bar",
        data: { labels: ["—"], datasets: [{ label: "Средняя оценка", data: [0], backgroundColor: CHART_COLORS.spotify }] },
        options: { ...commonOpts, plugins: { legend: { display: false } } },
      });
      return;
    }

    charts.streams = new Chart(ctxS, {
      type: "line",
      data: {
        labels,
        datasets: PLATFORMS.map((p) => ({
          label: p.kind === "publication" ? `${p.label} (публ.)` : p.label,
          data: byDate.map((e) => e.streams[p.id] || 0),
          borderColor: CHART_COLORS[p.id],
          backgroundColor: CHART_COLORS[p.id].replace(/0\.9\)$/, "0.08)"),
          tension: 0.35,
          fill: false,
        })),
      },
      options: {
        ...commonOpts,
        scales: {
          x: { ticks: { color: chartFontColor(), maxRotation: 45 }, grid: { color: chartGridColor() } },
          y: { ticks: { color: chartFontColor() }, grid: { color: chartGridColor() }, beginAtZero: true },
        },
      },
    });

    const last = latestEntry(state);
    const shareValues = last ? PLATFORMS.map((p) => last.streams[p.id] || 0) : PLATFORMS.map(() => 0);
    const sumPl = shareValues.reduce((a, b) => a + b, 0) || 1;
    charts.share = new Chart(ctxSh, {
      type: "doughnut",
      data: {
        labels: PLATFORMS.map((p) => p.label),
        datasets: [
          {
            data: shareValues,
            backgroundColor: PLATFORMS.map((p) => CHART_COLORS[p.id]),
            borderColor: "rgba(8, 6, 15, 0.9)",
            borderWidth: 2,
          },
        ],
      },
      options: {
        ...commonOpts,
        plugins: {
          ...commonOpts.plugins,
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.raw;
                const pct = ((Number(v) / sumPl) * 100).toFixed(1);
                return `${ctx.label}: ${Number(v).toLocaleString("ru-RU")} (${pct}%)`;
              },
            },
          },
        },
      },
    });

    const revAvgData = byDate.map((e) => moneyForChart(revenueForEntry(e, state.rates, "avg")));
    const revMinData = byDate.map((e) => moneyForChart(revenueForEntry(e, state.rates, "min")));
    const revMaxData = byDate.map((e) => moneyForChart(revenueForEntry(e, state.rates, "max")));

    charts.revenue = new Chart(ctxR, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Мин. оценка",
            data: revMinData,
            backgroundColor: "rgba(165, 243, 252, 0.35)",
            borderRadius: 6,
          },
          {
            label: "Средняя оценка",
            data: revAvgData,
            backgroundColor: "rgba(196, 181, 253, 0.55)",
            borderRadius: 6,
          },
          {
            label: "Макс. оценка",
            data: revMaxData,
            backgroundColor: "rgba(249, 168, 212, 0.45)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        ...commonOpts,
        scales: {
          x: { ticks: { color: chartFontColor(), maxRotation: 45 }, grid: { display: false } },
          y: {
            ticks: {
              color: chartFontColor(),
              callback(v) {
                return state.displayCurrency === "RUB" ? `${v} ₽` : `$${v}`;
              },
            },
            grid: { color: chartGridColor() },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function syncUIFromState() {
    el.displayCurrency.value = state.displayCurrency;
    el.rubPerUsd.value = String(state.rubPerUsd);
    el.rubRateWrap.hidden = state.displayCurrency !== "RUB";
    el.sortToggle.textContent = state.sortNewestFirst ? "Сначала новые" : "Сначала старые";
  }

  function refreshAll() {
    renderStatCards();
    renderTable();
    renderCharts();
  }

  initFormDefaults();
  renderTableHead();
  syncUIFromState();
  refreshAll();
})();
