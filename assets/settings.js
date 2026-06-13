(() => {
  const root = document.getElementById("settings-root");
  const api = "/api/modules/runtime/transmission/api";

  render();
  void load();

  async function load() {
    const response = await fetch(`${api}/settings`, { cache: "no-store", credentials: "same-origin" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return showMessage(payload.error?.message || "Could not load Transmission settings.", true);

    document.getElementById("url").value = payload.data?.url || "";
    document.getElementById("username").value = payload.data?.username || "";
    document.getElementById("password").placeholder = payload.data?.passwordConfigured ? "Saved password" : "Optional";
  }

  async function submit(action) {
    setBusy(true);
    showMessage("");
    const response = await fetch(`${api}/settings/${action}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: document.getElementById("url").value,
        username: document.getElementById("username").value,
        password: document.getElementById("password").value
      })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    showMessage(response.ok ? (action === "save" ? "Transmission settings saved." : "Transmission connection works.") : payload.error?.message || "Transmission request failed.", !response.ok);
    if (response.ok && action === "save") document.getElementById("password").value = "";
  }

  function render() {
    root.innerHTML = `
      <section class="module-card">
        <h2>Connection</h2>
        <div class="module-form">
          <label>RPC URL<input id="url" placeholder="http://192.168.1.10:9091/transmission/rpc"></label>
          <label>Username<input id="username" placeholder="Optional"></label>
          <label>Password<input id="password" type="password" placeholder="Optional"></label>
          <div class="module-actions">
            <button id="test" type="button">Test</button>
            <button id="save" class="primary" type="button">Save</button>
          </div>
          <p id="message" class="module-status"></p>
        </div>
      </section>
    `;
    document.getElementById("test").addEventListener("click", () => void submit("test"));
    document.getElementById("save").addEventListener("click", () => void submit("save"));
  }

  function setBusy(busy) {
    document.getElementById("test").disabled = busy;
    document.getElementById("save").disabled = busy;
  }

  function showMessage(message, error = false) {
    const element = document.getElementById("message");
    element.textContent = message;
    element.classList.toggle("module-status--error", error);
  }
})();
