const grid = document.querySelector("#serverGrid");
const template = document.querySelector("#serverTemplate");
const refreshButton = document.querySelector("#refreshButton");
const summaryLight = document.querySelector("#summaryLight");
const summaryText = document.querySelector("#summaryText");
const checkedAt = document.querySelector("#checkedAt");
const emptyState = document.querySelector("#emptyState");

const servers = window.SERVER_OVERVIEW_SERVERS || [];

const formatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "short"
});

function setLight(element, status) {
  element.classList.remove("up", "down", "unknown");
  element.classList.add(status || "unknown");
}

function renderServers(items) {
  grid.replaceChildren();
  emptyState.hidden = items.length > 0;

  items.forEach((server) => {
    const fragment = template.content.cloneNode(true);
    const light = fragment.querySelector(".status-light");
    const status = fragment.querySelector('[data-field="status"]');

    setLight(light, "unknown");
    fragment.querySelector("h2").textContent = server.name;
    fragment.querySelector(".server-description").textContent = server.description;
    fragment.querySelector('[data-field="host"]').textContent = server.host;

    status.innerHTML = "";
    const pill = document.createElement("span");
    pill.className = "pill unknown";
    pill.textContent = "Checked by menu bar app";
    status.append(pill);

    fragment.querySelector('[data-field="latency"]').textContent = "n/a";
    fragment.querySelector('[data-field="checks"]').textContent = `:${(server.ports || []).join(", :")}`;

    grid.append(fragment);
  });
}

function renderSummary() {
  if (servers.length === 0) {
    setLight(summaryLight, "unknown");
    summaryText.textContent = "No servers configured";
    checkedAt.textContent = "Not checked";
    return;
  }

  setLight(summaryLight, "unknown");
  summaryText.textContent = `${servers.length} servers configured`;
  checkedAt.textContent = "Static GitHub Pages view";
}

function refreshStatus() {
  refreshButton.disabled = true;
  renderServers(servers);
  renderSummary();
  refreshButton.disabled = false;
}

refreshButton.addEventListener("click", refreshStatus);
refreshStatus();
