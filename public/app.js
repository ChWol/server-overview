const grid = document.querySelector("#serverGrid");
const template = document.querySelector("#serverTemplate");
const refreshButton = document.querySelector("#refreshButton");
const summaryLight = document.querySelector("#summaryLight");
const summaryText = document.querySelector("#summaryText");
const checkedAt = document.querySelector("#checkedAt");
const addServerForm = document.querySelector("#addServerForm");
const shortNameInput = document.querySelector("#shortName");
const formMessage = document.querySelector("#formMessage");
const emptyState = document.querySelector("#emptyState");

const formatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "short"
});

let currentServers = [];

function setLight(element, status) {
  element.classList.remove("up", "down", "unknown");
  element.classList.add(status || "unknown");
}

function formatStatus(status) {
  if (status === "up") return "Online";
  if (status === "down") return "Offline";
  return "Unknown";
}

function formatChecks(server) {
  const checks = [];
  if (server.checks?.ping?.ok) checks.push("ping");

  const openPorts = server.checks?.ports
    ?.filter((port) => port.ok)
    .map((port) => `:${port.port}`) || [];

  return [...checks, ...openPorts].join(", ") || "No response";
}

function saveDescription(input, server) {
  const description = input.value.trim() || "Added server";
  input.value = description;
  input.disabled = true;

  fetch(`/api/servers/${encodeURIComponent(server.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description })
  })
    .then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save info text.");
      input.value = payload.server.description;
    })
    .catch((error) => {
      input.value = server.description;
      formMessage.textContent = error.message;
    })
    .finally(() => {
      input.disabled = false;
    });
}

function serverLabel(servers) {
  return servers.length === 1 ? servers[0].name : "Servers";
}

function renderServers(servers) {
  currentServers = servers;
  grid.replaceChildren();
  emptyState.hidden = servers.length > 0;

  servers.forEach((server) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".server-card");
    const light = fragment.querySelector(".status-light");
    const status = fragment.querySelector('[data-field="status"]');

    card.dataset.status = server.status;
    setLight(light, server.status);

    fragment.querySelector("h2").textContent = server.name;
    const description = fragment.querySelector(".server-description");
    description.value = server.description;
    description.addEventListener("blur", () => saveDescription(description, server));
    description.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        description.blur();
      }
      if (event.key === "Escape") {
        description.value = server.description;
        description.blur();
      }
    });
    fragment.querySelector('[data-field="host"]').textContent = server.host;

    status.innerHTML = "";
    const pill = document.createElement("span");
    pill.className = `pill ${server.status}`;
    pill.textContent = formatStatus(server.status);
    status.append(pill);

    fragment.querySelector('[data-field="latency"]').textContent = server.latencyMs
      ? `${server.latencyMs} ms`
      : "n/a";
    fragment.querySelector('[data-field="checks"]').textContent = formatChecks(server);

    grid.append(fragment);
  });
}

function renderSummary(servers, timestamp) {
  if (servers.length === 0) {
    setLight(summaryLight, "unknown");
    summaryText.textContent = "No servers added yet";
    checkedAt.textContent = "Not checked yet";
    return;
  }

  const upCount = servers.filter((server) => server.status === "up").length;
  const status = upCount === servers.length ? "up" : "down";
  const label = serverLabel(servers);

  setLight(summaryLight, status);
  if (servers.length === 1) {
    summaryText.textContent = upCount === 1
      ? `${label} is reachable`
      : `${label} is not responding`;
  } else {
    summaryText.textContent = `${upCount} of ${servers.length} servers reachable`;
  }
  checkedAt.textContent = `Checked ${formatter.format(new Date(timestamp))}`;
}

async function refreshStatus() {
  refreshButton.disabled = true;
  if (currentServers.length > 0) {
    summaryText.textContent = currentServers.length > 1 ? "Checking servers..." : `Checking ${currentServers[0].name}...`;
  }
  setLight(summaryLight, "unknown");

  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error(`Status check failed (${response.status})`);

    const payload = await response.json();
    renderServers(payload.servers);
    renderSummary(payload.servers, payload.checkedAt);
  } catch (error) {
    grid.replaceChildren();
    summaryText.textContent = error.message;
    setLight(summaryLight, "down");
    checkedAt.textContent = "Check failed";
  } finally {
    refreshButton.disabled = false;
  }
}

async function addServer(event) {
  event.preventDefault();
  const shortName = shortNameInput.value.trim();
  if (!shortName) return;

  addServerForm.classList.add("is-busy");
  formMessage.textContent = "";

  try {
    const response = await fetch("/api/servers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shortName })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || `Could not add ${shortName}`);
    }

    shortNameInput.value = "";
    formMessage.textContent = `${payload.server.name} added permanently.`;
    await refreshStatus();
  } catch (error) {
    formMessage.textContent = error.message;
  } finally {
    addServerForm.classList.remove("is-busy");
  }
}

refreshButton.addEventListener("click", refreshStatus);
addServerForm.addEventListener("submit", addServer);
refreshStatus();
setInterval(refreshStatus, 30000);
