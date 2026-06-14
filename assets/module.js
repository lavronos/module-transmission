(async () => {
  const root = document.getElementById("module-root");
  const mode = document.body.dataset.mode === "dashboard" ? "dashboard" : "page";
  const api = "/api/modules/runtime/transmission/api";

  try {
    const manifest = await requestJson("module.json");
    const settingsPayload = await requestJson(`${api}/settings`);
    const settings = settingsPayload.data || {};

    renderShell(manifest);

    if (!String(settings.url || "").trim()) {
      renderConnectionState(
        "Transmission не подключён",
        "Укажите RPC URL Transmission в настройках модуля, затем выполните проверку соединения."
      );
      return;
    }

    await loadTorrents();
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Could not load Transmission.");
  }

  function renderShell(manifest) {
    root.innerHTML = `
      <header class="module-heading">
        <div class="min-width-0">
          <p class="module-eyebrow">${escapeHtml(manifest.categoryLabel || "Downloads")}</p>
          <h1>${escapeHtml(manifest.name || "Transmission")}</h1>
          <p class="module-summary">${escapeHtml(manifest.summary || manifest.description || "")}</p>
        </div>
        <button class="refresh-button" id="refresh" type="button">Обновить</button>
      </header>
      <div id="module-content"><div class="module-loading"><span class="spinner"></span>Получаю список торрентов...</div></div>
    `;
    document.getElementById("refresh")?.addEventListener("click", () => void loadTorrents());
  }

  async function loadTorrents() {
    const refresh = document.getElementById("refresh");
    if (refresh) {
      refresh.disabled = true;
      refresh.textContent = "Обновляю...";
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

      renderOverview(payload.data || payload);
    } catch (error) {
      renderDiagnostic(error instanceof Error ? error.message : "Transmission не отвечает.");
    } finally {
      if (refresh) {
        refresh.disabled = false;
        refresh.textContent = "Обновить";
      }
    }
  }

  function renderOverview(data) {
    const content = document.getElementById("module-content");
    const torrents = Array.isArray(data.torrents) ? data.torrents : [];
    const totals = torrents.reduce(
      (result, torrent) => {
        result.download += Number(torrent.downloadSpeed || 0);
        result.upload += Number(torrent.uploadSpeed || 0);
        result.active += ["downloading", "seeding", "checking"].includes(torrent.status) ? 1 : 0;
        result.completed += torrent.status === "completed" || Number(torrent.progress) >= 1 ? 1 : 0;
        return result;
      },
      { download: 0, upload: 0, active: 0, completed: 0 }
    );

    if (mode === "dashboard") {
      content.innerHTML = `
        <section class="dashboard-card">
          <div class="dashboard-header"><div><p class="module-eyebrow">Transmission</p><h2>${totals.active} активных из ${torrents.length}</h2></div><span class="status-pill">Подключено</span></div>
          <div class="dashboard-stats">
            ${smallMetric("Загрузка", formatSpeed(totals.download))}
            ${smallMetric("Отдача", formatSpeed(totals.upload))}
          </div>
          <div class="torrent-list torrent-list--compact">${renderTorrentRows(torrents.slice(0, 3))}</div>
        </section>
      `;
      return;
    }

    content.innerHTML = `
      <section class="metric-grid">
        ${metric("Загрузка", formatSpeed(totals.download), "Общая скорость", "blue")}
        ${metric("Отдача", formatSpeed(totals.upload), "Общая скорость", "green")}
        ${metric("Активные", String(totals.active), `из ${torrents.length} торрентов`, "violet")}
        ${metric("Свободно", formatBytes(data.freeSpace?.bytes), data.freeSpace?.path || "Transmission", "amber")}
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div><p class="module-eyebrow">Торренты</p><h2>${torrents.length ? `${torrents.length} в списке` : "Список пуст"}</h2></div>
          <span class="status-pill">Подключено</span>
        </div>
        <div class="torrent-list">${renderTorrentRows(torrents)}</div>
      </section>
    `;

    content.querySelectorAll("[data-torrent-action]").forEach((button) => {
      button.addEventListener("click", () => void mutateTorrent(button));
    });
  }

  function renderTorrentRows(torrents) {
    if (!torrents.length) return '<div class="empty">В Transmission пока нет торрентов.</div>';

    return torrents
      .map((torrent) => {
        const progress = normalizePercent(torrent.progress);
        const canStart = ["paused", "completed"].includes(torrent.status);
        const speed = torrent.status === "seeding" ? formatSpeed(torrent.uploadSpeed) : formatSpeed(torrent.downloadSpeed);
        return `
          <article class="torrent-row">
            <div class="torrent-row__top">
              <div class="min-width-0">
                <strong title="${escapeAttribute(torrent.name || "Torrent")}">${escapeHtml(torrent.name || "Torrent")}</strong>
                <span>${escapeHtml(statusLabel(torrent.status))} · ${escapeHtml(formatBytes(torrent.totalSize))} · ${escapeHtml(speed)}</span>
              </div>
              <div class="torrent-actions">
                <span class="progress-label">${Math.round(progress)}%</span>
                ${mode === "page" ? `<button type="button" data-torrent-action="${canStart ? "start" : "stop"}" data-torrent-id="${escapeAttribute(torrent.id)}">${canStart ? "Запустить" : "Пауза"}</button>` : ""}
              </div>
            </div>
            <div class="progress"><span class="progress--${escapeAttribute(torrent.status || "paused")}" style="width:${progress}%"></span></div>
          </article>
        `;
      })
      .join("");
  }

  async function mutateTorrent(button) {
    const id = button.dataset.torrentId;
    const action = button.dataset.torrentAction;
    if (!id || !action) return;

    button.disabled = true;
    button.textContent = "Подождите...";

    try {
      const response = await fetch(`${api}/torrents/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(payload, "Не удалось изменить состояние торрента."));
      await loadTorrents();
    } catch (error) {
      renderDiagnostic(error instanceof Error ? error.message : "Действие не выполнено.");
    }
  }

  function renderConnectionState(title, message) {
    const content = document.getElementById("module-content") || root;
    content.innerHTML = `
      <section class="connection-state">
        <div class="connection-icon">↓</div>
        <div><p class="module-eyebrow">Требуется настройка</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><a class="module-button" href="/settings#module-transmission" target="_top">Открыть настройки Transmission</a></div>
      </section>
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

    const content = document.getElementById("module-content") || root;
    content.innerHTML = `
      <section class="connection-state connection-state--error">
        <div class="connection-icon">!</div>
        <div><p class="module-eyebrow">Ошибка подключения</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(hint)}</p><a class="module-button" href="/settings#module-transmission" target="_top">Проверить настройки</a></div>
      </section>
    `;
  }

  function metric(label, value, detail, tone) {
    return `<article class="metric metric--${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Нет данных")}</strong><small title="${escapeAttribute(detail)}">${escapeHtml(detail)}</small></article>`;
  }

  function smallMetric(label, value) {
    return `<div class="small-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
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
    root.innerHTML = `<section class="connection-state connection-state--error"><div class="connection-icon">!</div><div><h2>Не удалось открыть Transmission</h2><p>${escapeHtml(message)}</p></div></section>`;
  }

  function normalizePercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, numeric <= 1 ? numeric * 100 : numeric));
  }

  function statusLabel(status) {
    return {
      downloading: "Загружается",
      seeding: "Раздаётся",
      paused: "На паузе",
      checking: "Проверяется",
      queued: "В очереди",
      completed: "Завершён"
    }[status] || "Ожидание";
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

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }
})();
