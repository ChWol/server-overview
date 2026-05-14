const { execFile } = require("node:child_process");
const dns = require("node:dns").promises;
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "servers.json");
const CHECK_TIMEOUT_MS = 2500;
const DOMAIN_SUFFIX = ".eda.cit.tum.de";
const DEFAULT_PORTS = [22, 80, 443];

const defaultServers = [];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function titleCase(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function normalizeShortName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(DOMAIN_SUFFIX, "");
}

function serverFromShortName(shortName) {
  const id = normalizeShortName(shortName);
  return {
    id,
    name: titleCase(id),
    host: `${id}${DOMAIN_SUFFIX}`,
    description: "Added server",
    ports: DEFAULT_PORTS
  };
}

function loadServers() {
  try {
    const data = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed.servers) ? parsed.servers : defaultServers;
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read servers.json: ${error.message}`);
    }
    return defaultServers;
  }
}

function saveServers(servers) {
  fs.writeFileSync(DATA_FILE, `${JSON.stringify({ servers }, null, 2)}\n`);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function runPing(host) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timeout = setTimeout(() => resolve({ ok: false, method: "icmp" }), CHECK_TIMEOUT_MS + 500);

    execFile("ping", ["-c", "1", "-W", String(CHECK_TIMEOUT_MS), host], { timeout: CHECK_TIMEOUT_MS + 250 }, (error) => {
      clearTimeout(timeout);
      resolve({
        ok: !error,
        method: "icmp",
        latencyMs: !error ? Date.now() - start : null
      });
    });
  });
}

function checkTcp(host, port) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;

    function finish(ok, error = null) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok,
        port,
        latencyMs: ok ? Date.now() - start : null,
        error: error ? error.code || error.message : null
      });
    }

    socket.setTimeout(CHECK_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, new Error("timeout")));
    socket.once("error", (error) => finish(false, error));
  });
}

async function checkServer(server) {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  let addresses = [];
  try {
    addresses = await dns.lookup(server.host, { all: true });
  } catch (error) {
    return {
      ...server,
      status: "down",
      checkedAt,
      latencyMs: null,
      checks: {
        dns: { ok: false, error: error.code || error.message },
        ping: { ok: false, method: "icmp" },
        ports: []
      }
    };
  }

  const [ping, ports] = await Promise.all([
    runPing(server.host),
    Promise.all(server.ports.map((port) => checkTcp(server.host, port)))
  ]);

  const openPorts = ports.filter((result) => result.ok);
  const online = ping.ok || openPorts.length > 0;
  const successfulLatencies = [ping, ...openPorts]
    .map((result) => result.latencyMs)
    .filter((value) => Number.isFinite(value));

  return {
    ...server,
    status: online ? "up" : "down",
    checkedAt,
    latencyMs: successfulLatencies.length ? Math.min(...successfulLatencies) : Date.now() - startedAt,
    checks: {
      dns: {
        ok: true,
        addresses: addresses.map((address) => address.address)
      },
      ping,
      ports
    }
  };
}

async function handleStatus(res) {
  try {
    const servers = loadServers();
    const results = await Promise.all(servers.map(checkServer));
    json(res, 200, {
      checkedAt: new Date().toISOString(),
      servers: results
    });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

async function handleAddServer(req, res) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const shortName = normalizeShortName(payload.shortName);

    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(shortName)) {
      json(res, 400, { error: "Use a short host name such as server-1." });
      return;
    }

    const servers = loadServers();
    if (servers.some((server) => server.id === shortName || server.host === `${shortName}${DOMAIN_SUFFIX}`)) {
      json(res, 409, { error: `${shortName} is already in the overview.` });
      return;
    }

    const server = serverFromShortName(shortName);
    const updatedServers = [...servers, server];
    saveServers(updatedServers);
    json(res, 201, { server, servers: updatedServers });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

async function handleUpdateServer(req, res, id) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const description = String(payload.description || "").trim();

    if (description.length > 80) {
      json(res, 400, { error: "Info text should be 80 characters or less." });
      return;
    }

    const servers = loadServers();
    const serverIndex = servers.findIndex((server) => server.id === id);
    if (serverIndex === -1) {
      json(res, 404, { error: `${id} is not in the overview.` });
      return;
    }

    const updatedServer = {
      ...servers[serverIndex],
      description: description || "Added server"
    };
    const updatedServers = [...servers];
    updatedServers[serverIndex] = updatedServer;
    saveServers(updatedServers);
    json(res, 200, { server: updatedServer });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolvedPath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const contentType = mimeTypes[path.extname(resolvedPath)] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-cache"
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/status") {
    handleStatus(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/servers") {
    handleAddServer(req, res);
    return;
  }

  const serverMatch = url.pathname.match(/^\/api\/servers\/([a-z0-9-]+)$/);
  if (req.method === "PATCH" && serverMatch) {
    handleUpdateServer(req, res, serverMatch[1]);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Server overview running at http://${HOST}:${PORT}`);
});
