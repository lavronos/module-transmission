(async () => {
  const root = document.getElementById("module-root");
  const mode = document.body.dataset.mode === "dashboard" ? "dashboard" : "page";
  const api = "/api/modules/runtime/transmission/api";
  let manifest = {};
  let currentData = { torrents: [], freeSpace: null };
  let activeFilter = "all";
  let query = "";
  let page = 1;
  let selectedIds = new Set();
  let addMode = "file";
  const pageSize = 12;

  renderLoading();

  try {
    manifest = await requestJson("module.json");
    const settingsPayload = await requestJson(`${api}/settings`);
    const settings = settingsPayload.data || {};

    if (!String(settings.url || "").trim()) {
      renderConnectionState("Transmission не подключён", "Укажите RPC URL Transmission в настройках модуля, затем выполните проверку соединения.");
      return;
    }

    await loadTorrents();
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Не удалось открыть Transmission.");
  }

  function renderLoading() {
    root.innerHTML = `<div class="module-loading"><span class="spinner"></span>Получаю список торрентов...</div>`;
  }

  async function loadTorrents(silent = false) {
    const refresh = document.getElementById("refresh");
    if (refresh) {
      refresh.disabled = true;
      refresh.innerHTML = `${icon("refresh", "spin")} Обновляю`;
    } else if (!silent) {
      renderLoading();
    }

    try {
      const response = await fetch(`${api}/torrents`, { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = errorMessage(payload, `Transmission returned HTTP ${response.status}`);
        if (/не настроен|not configured/i.test(message)) {
          renderConnectionState("Transmission не подключён", "Укажите RPC URL Transmission в настройках модуля.");
          return;
        }
        renderDiagnostic(message);
        return;
      }

      currentData = payload.data || payload;
      const availableIds = new Set((currentData.torrents || []).map((torrent) => String(torrent.id)));
      selectedIds = new Set([...selectedIds].filter((id) => availableIds.has(id)));
      renderOverview();
    } catch (error) {
      renderDiagnostic(error instanceof Error ? error.message : "Transmission не отвечает.");
    }
  }

  function renderOverview() {
    const torrents = Array.isArray(currentData.torrents) ? currentData.torrents : [];
    const totals = getTotals(torrents);

    if (mode === "dashboard") {
      const dashboardTorrents = prioritizeDashboardTorrents(torrents);
      root.innerHTML = `
        <section class="dashboard-card">
          <div class="dashboard-header"><span class="dashboard-icon">${icon("download")}</span><strong class="dashboard-title">Transmission</strong></div>
          <div class="compact-torrents">${dashboardTorrents.map(compactTorrent).join("") || empty("В Transmission пока нет торрентов.")}</div>
        </section>
      `;
      return;
    }

    const counts = getCounts(torrents);
    const filtered = torrents.filter((torrent) => {
      const statusMatches = activeFilter === "all" || torrent.status === activeFilter || (activeFilter === "completed" && (torrent.status === "completed" || normalizePercent(torrent.progress) >= 100));
      return statusMatches && (!query || String(torrent.name || "").toLowerCase().includes(query.toLowerCase()));
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    page = Math.min(page, pageCount);
    const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
    const visibleIds = visible.map((torrent) => String(torrent.id));
    const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
    const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

    root.innerHTML = `
      <div class="page-stack">
        <header class="app-header">
          <div class="title-line"><span class="title-icon">${icon("download")}</span><div class="min-width-0"><div class="title-status"><h1>${escapeHtml(manifest.name || "Transmission")}</h1><span class="status-pill"><i></i>Подключено</span></div><p>${escapeHtml(manifest.summary || "")}</p></div></div>
          <button class="refresh-button" id="refresh" type="button">${icon("refresh")} Обновить</button>
        </header>

        <section class="metric-grid">
          ${metric("download", "Скорость загрузки", formatSpeed(totals.download), "Общая скорость", "blue")}
          ${metric("upload", "Скорость отдачи", formatSpeed(totals.upload), "Общая скорость", "green")}
          ${metric("activity", "Активные торренты", totals.active, `из ${torrents.length}`, "violet")}
          ${metric("drive", "Свободное место", formatBytes(currentData.freeSpace?.bytes) || "Нет данных", currentData.freeSpace?.path || "Transmission", "amber")}
        </section>

        <section class="torrent-workspace">
          <div class="workspace-toolbar">
            <nav class="filter-tabs">
              ${filterButton("all", "Все", counts.all)}
              ${filterButton("downloading", "Загружаются", counts.downloading)}
              ${filterButton("seeding", "Раздаются", counts.seeding)}
              ${filterButton("paused", "На паузе", counts.paused)}
              ${filterButton("completed", "Завершены", counts.completed)}
            </nav>
            <div class="toolbar-actions">
              <label class="search-field">${icon("search")}<input id="torrent-search" type="search" value="${escapeAttribute(query)}" placeholder="Поиск торрентов"></label>
              <button class="primary-button" id="add-torrent" type="button">${icon("plus")} Добавить торрент</button>
            </div>
          </div>

          ${selectedIds.size ? `
            <div class="selection-toolbar">
              <strong>Выбрано: ${selectedIds.size}</strong>
              <div>
                <button id="clear-selection" type="button">Снять выбор</button>
                <button class="danger-button" id="delete-selected" type="button">${icon("trash")} Удалить выбранные</button>
              </div>
            </div>
          ` : ""}

          <div class="table-scroll">
            <table class="torrent-table">
              <thead><tr><th class="selection-column"><input id="select-visible" type="checkbox" aria-label="Выбрать торренты на странице" ${allVisibleSelected ? "checked" : ""}></th><th>Название</th><th>Статус</th><th>Прогресс</th><th>Размер</th><th>Скорость</th><th>ETA / Ratio</th><th></th></tr></thead>
              <tbody>${visible.length ? visible.map(torrentRow).join("") : `<tr><td colspan="8">${empty("Нет торрентов по выбранному фильтру.")}</td></tr>`}</tbody>
            </table>
          </div>

          <footer class="table-footer">
            <span>Показано ${visible.length} из ${filtered.length}</span>
            <div class="pagination"><button data-page="${Math.max(1, page - 1)}" ${page === 1 ? "disabled" : ""}>${icon("left")}</button><span>${page} / ${pageCount}</span><button data-page="${Math.min(pageCount, page + 1)}" ${page === pageCount ? "disabled" : ""}>${icon("right")}</button></div>
          </footer>
        </section>
      </div>
      <div id="module-modal"></div>
    `;

    bindPageEvents();
    const selectVisible = document.getElementById("select-visible");
    if (selectVisible) selectVisible.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
  }

  function bindPageEvents() {
    document.getElementById("refresh")?.addEventListener("click", () => void loadTorrents(true));
    document.getElementById("torrent-search")?.addEventListener("input", (event) => {
      query = event.target.value;
      page = 1;
      renderOverview();
      const search = document.getElementById("torrent-search");
      search?.focus();
      search?.setSelectionRange(query.length, query.length);
    });
    document.getElementById("add-torrent")?.addEventListener("click", openAddModal);
    document.getElementById("clear-selection")?.addEventListener("click", () => {
      selectedIds.clear();
      renderOverview();
    });
    document.getElementById("delete-selected")?.addEventListener("click", () => {
      const torrents = (currentData.torrents || []).filter((torrent) => selectedIds.has(String(torrent.id)));
      openDeleteModal(torrents);
    });
    document.getElementById("select-visible")?.addEventListener("change", (event) => {
      root.querySelectorAll("[data-select-torrent]").forEach((checkbox) => {
        const id = checkbox.dataset.selectTorrent;
        if (!id) return;
        if (event.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
      });
      renderOverview();
    });
    root.querySelectorAll("[data-select-torrent]").forEach((checkbox) => checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.selectTorrent;
      if (!id) return;
      if (checkbox.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      renderOverview();
    }));
    root.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      page = 1;
      renderOverview();
    }));
    root.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
      page = Number(button.dataset.page) || 1;
      renderOverview();
    }));
    root.querySelectorAll("[data-torrent-action]").forEach((button) => button.addEventListener("click", () => void mutateTorrent(button)));
  }

  function torrentRow(torrent) {
    const progress = normalizePercent(torrent.progress);
    const canStart = ["paused", "completed"].includes(torrent.status);
    const id = String(torrent.id);
    return `
      <tr>
        <td class="selection-column"><input data-select-torrent="${escapeAttribute(id)}" type="checkbox" aria-label="Выбрать ${escapeAttribute(torrent.name || "торрент")}" ${selectedIds.has(id) ? "checked" : ""}></td>
        <td><div class="torrent-name"><span class="torrent-file-icon">${icon("file")}</span><div class="min-width-0"><strong title="${escapeAttribute(torrent.name || "Torrent")}">${escapeHtml(torrent.name || "Torrent")}</strong><small>${escapeHtml(`${torrent.peers || 0} пиров · добавлен ${formatDate(torrent.addedDate)}`)}</small></div></div></td>
        <td><span class="torrent-status torrent-status--${escapeAttribute(torrent.status || "paused")}">${escapeHtml(statusLabel(torrent.status))}</span></td>
        <td><div class="progress-cell"><div><span>${Math.round(progress)}%</span><small>${escapeHtml(formatBytes(torrent.downloaded))} / ${escapeHtml(formatBytes(torrent.totalSize))}</small></div><div class="progress"><span class="progress--${escapeAttribute(torrent.status || "paused")}" style="width:${progress}%"></span></div></div></td>
        <td>${escapeHtml(formatBytes(torrent.totalSize) || "—")}</td>
        <td><div class="speed-stack"><span class="download-speed">${icon("download")} ${escapeHtml(formatSpeed(torrent.downloadSpeed))}</span><span class="upload-speed">${icon("upload")} ${escapeHtml(formatSpeed(torrent.uploadSpeed))}</span></div></td>
        <td><div class="eta-stack"><span>${escapeHtml(formatEta(torrent.eta))}</span><small>Ratio ${escapeHtml(formatRatio(torrent.ratio))}</small></div></td>
        <td><div class="row-actions"><button title="${canStart ? "Запустить" : "Пауза"}" data-torrent-action="${canStart ? "start" : "stop"}" data-torrent-id="${escapeAttribute(torrent.id)}">${icon(canStart ? "play" : "pause")}</button><button class="danger" title="Удалить" data-torrent-action="remove" data-torrent-id="${escapeAttribute(torrent.id)}" data-torrent-name="${escapeAttribute(torrent.name)}">${icon("trash")}</button></div></td>
      </tr>
    `;
  }

  function compactTorrent(torrent) {
    const progress = normalizePercent(torrent.progress);
    return `<div class="compact-row"><div class="min-width-0"><strong>${escapeHtml(torrent.name || "Torrent")}</strong><span>${escapeHtml(statusLabel(torrent.status))}</span></div><b>${Math.round(progress)}%</b></div>`;
  }

  function prioritizeDashboardTorrents(torrents) {
    const activeStatuses = new Set(["downloading", "seeding", "checking"]);
    const active = torrents.filter((torrent) => activeStatuses.has(torrent.status));
    const remaining = torrents.filter((torrent) => !activeStatuses.has(torrent.status));
    return [...active, ...remaining].slice(0, 5);
  }

  async function mutateTorrent(button) {
    const id = button.dataset.torrentId;
    const action = button.dataset.torrentAction;
    if (!id || !action) return;

    if (action === "remove") {
      const torrent = (currentData.torrents || []).find((item) => String(item.id) === String(id));
      openDeleteModal(torrent ? [torrent] : [{ id, name: button.dataset.torrentName || "торрент" }]);
      return;
    }

    button.disabled = true;
    button.innerHTML = icon("refresh", "spin");
    try {
      const response = await fetch(`${api}/torrents/${encodeURIComponent(id)}/${action}`, { method: "POST", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(payload, "Не удалось изменить состояние торрента."));
      await loadTorrents(true);
    } catch (error) {
      renderDiagnostic(error instanceof Error ? error.message : "Действие не выполнено.");
    }
  }

  function openAddModal() {
    addMode = "file";
    const modal = document.getElementById("module-modal");
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal>
        <form class="modal-card" id="add-form">
          <div class="modal-header"><div><span class="module-eyebrow">Transmission</span><h2>Добавить торрент</h2></div><button type="button" data-close-modal>${icon("close")}</button></div>
          <div class="modal-tabs">
            <button class="active" data-add-mode="file" type="button">${icon("file")} Файл</button>
            <button data-add-mode="url" type="button">${icon("link")} URL</button>
            <button data-add-mode="magnet" type="button">${icon("magnet")} Magnet</button>
          </div>
          <div id="add-source-field"></div>
          <div class="modal-actions"><button type="button" data-close-modal>Отмена</button><button class="primary-button" type="submit">${icon("plus")} Добавить</button></div>
          <p class="modal-error" id="modal-error"></p>
        </form>
      </div>
    `;
    renderAddSourceField();
    bindModalClose();
    positionModal();
    root.querySelectorAll("[data-add-mode]").forEach((button) => button.addEventListener("click", () => {
      addMode = button.dataset.addMode || "file";
      root.querySelectorAll("[data-add-mode]").forEach((item) => item.classList.toggle("active", item === button));
      renderAddSourceField();
    }));
    document.getElementById("add-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.innerHTML = `${icon("refresh", "spin")} Добавляю`;
      try {
        let body;
        if (addMode === "file") {
          const file = document.getElementById("torrent-file")?.files?.[0];
          if (!file) throw new Error("Выберите .torrent файл.");
          body = { type: "file", name: file.name, metainfo: await fileToBase64(file) };
        } else {
          const source = document.getElementById("torrent-source")?.value.trim();
          if (!source) throw new Error(addMode === "magnet" ? "Вставьте magnet-ссылку." : "Вставьте URL торрент-файла.");
          body = { type: addMode, value: source };
        }
        const response = await fetch(`${api}/torrents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(errorMessage(payload, "Не удалось добавить торрент."));
        modal.innerHTML = "";
        await loadTorrents(true);
      } catch (error) {
        document.getElementById("modal-error").textContent = error instanceof Error ? error.message : "Не удалось добавить торрент.";
        submit.disabled = false;
        submit.innerHTML = `${icon("plus")} Добавить`;
      }
    });
  }

  function renderAddSourceField() {
    const field = document.getElementById("add-source-field");
    if (!field) return;
    if (addMode === "file") {
      field.innerHTML = `<label class="file-picker">Torrent-файл<input id="torrent-file" type="file" accept=".torrent,application/x-bittorrent" required><span>${icon("upload")} Выберите .torrent файл</span></label>`;
      return;
    }
    field.innerHTML = `<label>${addMode === "magnet" ? "Magnet-ссылка" : "URL торрент-файла"}<input id="torrent-source" type="text" required placeholder="${addMode === "magnet" ? "magnet:?xt=..." : "https://example.com/file.torrent"}"></label>`;
    document.getElementById("torrent-source")?.focus();
  }

  function openDeleteModal(torrents) {
    if (!torrents.length) return;
    const modal = document.getElementById("module-modal");
    const single = torrents.length === 1;
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal>
        <div class="modal-card">
          <div class="modal-header"><div><span class="module-eyebrow">Удаление</span><h2>${single ? escapeHtml(torrents[0].name || "Торрент") : `Удалить ${torrents.length} торрентов`}</h2></div><button type="button" data-close-modal>${icon("close")}</button></div>
          <p class="modal-copy">Выберите, что сделать с загруженными файлами.</p>
          <label class="delete-option"><input name="delete-files" type="radio" value="keep" checked><span><strong>Удалить только торрент</strong><small>Загруженные файлы останутся на диске.</small></span></label>
          <label class="delete-option delete-option--danger"><input name="delete-files" type="radio" value="remove"><span><strong>Удалить торрент и файлы</strong><small>Загруженные данные будут удалены без возможности восстановления.</small></span></label>
          <div class="modal-actions"><button type="button" data-close-modal>Отмена</button><button class="danger-button" id="confirm-delete" type="button">${icon("trash")} Удалить</button></div>
          <p class="modal-error" id="modal-error"></p>
        </div>
      </div>
    `;
    bindModalClose();
    positionModal();
    document.getElementById("confirm-delete")?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.innerHTML = `${icon("refresh", "spin")} Удаляю`;
      try {
        const deleteLocalData = document.querySelector('input[name="delete-files"]:checked')?.value === "remove";
        for (const torrent of torrents) {
          const response = await fetch(`${api}/torrents/${encodeURIComponent(torrent.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteLocalData }), credentials: "same-origin" });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(errorMessage(payload, `Не удалось удалить "${torrent.name || "торрент"}".`));
          selectedIds.delete(String(torrent.id));
        }
        modal.innerHTML = "";
        await loadTorrents(true);
      } catch (error) {
        document.getElementById("modal-error").textContent = error instanceof Error ? error.message : "Не удалось удалить торрент.";
        event.currentTarget.disabled = false;
      }
    });
  }

  function bindModalClose() {
    root.querySelectorAll("[data-close-modal]").forEach((element) => element.addEventListener("click", (event) => {
      if (event.target !== element && element.classList.contains("modal-backdrop")) return;
      document.getElementById("module-modal").innerHTML = "";
    }));
  }

  function positionModal() {
    const backdrop = document.querySelector(".modal-backdrop");
    const frame = window.frameElement;
    if (!backdrop || !frame || window.parent === window) return;
    const frameRect = frame.getBoundingClientRect();
    const visibleTop = Math.max(0, -frameRect.top);
    const visibleHeight = Math.max(320, Math.min(document.documentElement.scrollHeight - visibleTop, window.parent.innerHeight - Math.max(0, frameRect.top)));
    backdrop.style.position = "absolute";
    backdrop.style.inset = "auto 0";
    backdrop.style.top = `${visibleTop}px`;
    backdrop.style.height = `${visibleHeight}px`;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
      reader.onerror = () => reject(new Error("Не удалось прочитать .torrent файл."));
      reader.readAsDataURL(file);
    });
  }

  function getTotals(torrents) {
    return torrents.reduce((result, torrent) => {
      result.download += Number(torrent.downloadSpeed || 0);
      result.upload += Number(torrent.uploadSpeed || 0);
      result.active += ["downloading", "seeding", "checking"].includes(torrent.status) ? 1 : 0;
      return result;
    }, { download: 0, upload: 0, active: 0 });
  }

  function getCounts(torrents) {
    return torrents.reduce((result, torrent) => {
      result.all += 1;
      if (result[torrent.status] !== undefined) result[torrent.status] += 1;
      if (torrent.status === "completed" || normalizePercent(torrent.progress) >= 100) result.completed += torrent.status === "completed" ? 0 : 1;
      return result;
    }, { all: 0, downloading: 0, seeding: 0, paused: 0, completed: 0 });
  }

  function filterButton(id, label, count) {
    return `<button class="${activeFilter === id ? "active" : ""}" data-filter="${id}" type="button"><span>${escapeHtml(label)}</span><b>${count}</b></button>`;
  }

  function metric(iconName, label, value, detail, tone) {
    return `<article class="metric metric--${tone}"><span class="metric-icon">${icon(iconName)}</span><div class="min-width-0"><span class="metric-label">${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small title="${escapeAttribute(detail)}">${escapeHtml(detail)}</small></div></article>`;
  }

  function smallMetric(label, value) {
    return `<div class="small-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function renderConnectionState(title, message) {
    root.innerHTML = `
      <div class="page-stack">
        <header class="app-header"><div class="title-line"><span class="title-icon">${icon("download")}</span><div><h1>${escapeHtml(manifest.name || "Transmission")}</h1><p>${escapeHtml(manifest.summary || "")}</p></div></div></header>
        <section class="connection-state"><span class="connection-icon">${icon("link")}</span><div><span class="module-eyebrow">Требуется настройка</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><a class="module-button" href="/settings#module-transmission" target="_top">Открыть настройки Transmission</a></div></section>
      </div>
    `;
  }

  function renderDiagnostic(message) {
    const lower = String(message).toLowerCase();
    let title = "Transmission не отвечает";
    let hint = message;
    if (/401|403|unauthor|forbidden|auth|password|credential/.test(lower)) {
      title = "Не удалось авторизоваться в Transmission";
      hint = "Проверьте имя пользователя и пароль Transmission RPC.";
    } else if (/timeout|timed out|econnrefused|failed to fetch|network|connect/.test(lower)) {
      hint = "Проверьте RPC URL, IP-адрес, порт Transmission и доступность сервиса из контейнера LavronOS.";
    }
    root.innerHTML = `<section class="connection-state connection-state--error"><span class="connection-icon">${icon("warning")}</span><div><span class="module-eyebrow">Ошибка подключения</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(hint)}</p><a class="module-button" href="/settings#module-transmission" target="_top">Проверить настройки</a></div></section>`;
  }

  async function requestJson(url) {
    const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(payload, `HTTP ${response.status}`));
    return payload;
  }

  function errorMessage(payload, fallback) {
    if (typeof payload === "string" && payload.trim()) return payload;
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
    if (typeof payload?.error?.message === "string" && payload.error.message.trim()) return payload.error.message;
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    return fallback;
  }

  function renderError(message) {
    root.innerHTML = `<section class="connection-state connection-state--error"><span class="connection-icon">${icon("warning")}</span><div><h2>Не удалось открыть Transmission</h2><p>${escapeHtml(message)}</p></div></section>`;
  }

  function normalizePercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric));
  }

  function statusLabel(status) {
    return { downloading: "Загружается", seeding: "Раздаётся", paused: "На паузе", checking: "Проверяется", queued: "В очереди", completed: "Завершён" }[status] || "Ожидание";
  }

  function formatSpeed(value) {
    const text = formatBytes(value);
    return text ? `${text}/с` : "0 Б/с";
  }

  function formatBytes(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
    let amount = numeric;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index += 1;
    }
    return `${amount >= 100 || index === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[index]}`;
  }

  function formatEta(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 8640000) return "—";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
  }

  function formatRatio(value) {
    return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "0.00";
  }

  function formatDate(value) {
    const numeric = Number(value);
    if (!numeric) return "нет данных";
    const date = new Date(numeric < 100000000000 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? "нет данных" : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  }

  function empty(message) {
    return `<div class="empty">${escapeHtml(message)}</div>`;
  }

  function icon(name, className = "") {
    const paths = {
      activity: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
      close: '<path d="m6 6 12 12M18 6 6 18"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
      drive: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 16h.01M11 16h6"/>',
      file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/>',
      left: '<path d="m15 18-6-6 6-6"/>',
      link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
      magnet: '<path d="M6 4v7a6 6 0 0 0 12 0V4"/><path d="M6 4h4M14 4h4M6 8h4M14 8h4"/>',
      pause: '<path d="M9 5v14M15 5v14"/>',
      play: '<path d="m8 5 11 7-11 7z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      refresh: '<path d="M20 11a8 8 0 1 0 2 5M20 4v7h-7"/>',
      right: '<path d="m9 18 6-6-6-6"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/>',
      upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 3h14"/>',
      warning: '<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>'
    };
    return `<svg class="${escapeAttribute(className)}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.download}</svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();
