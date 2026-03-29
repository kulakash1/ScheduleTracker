const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3006;

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const STATES_FILE = path.join(DATA_DIR, "user-states.json");
const ACTIONS_FILE = path.join(DATA_DIR, "user-actions.json");
const ADMIN_ID = "adminAkash";
const ADMIN_PASSWORD = "123";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

function ensureFile(filePath, defaultContent) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, "utf8");
  }
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sanitizeUsername(username) {
  if (typeof username !== "string") return "";
  return username.trim().replace(/\s+/g, " ");
}

function isAdminAuthenticated(req) {
  const adminId = sanitizeUsername(req.header("x-admin-id"));
  const adminPassword = String(req.header("x-admin-password") || "");
  return adminId === ADMIN_ID && adminPassword === ADMIN_PASSWORD;
}

function requireAdmin(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  return next();
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureFile(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
ensureFile(STATES_FILE, JSON.stringify({}, null, 2));
ensureFile(ACTIONS_FILE, JSON.stringify([], null, 2));

app.get("/api/users", (_req, res) => {
  const usersData = readJson(USERS_FILE, { users: [] });
  res.json(usersData);
});

app.post("/api/admin/login", (req, res) => {
  const adminId = sanitizeUsername(req.body?.adminId);
  const adminPassword = String(req.body?.password || "");

  if (adminId === ADMIN_ID && adminPassword === ADMIN_PASSWORD) {
    return res.json({ ok: true, adminId });
  }

  return res.status(401).json({ error: "Invalid admin credentials" });
});

app.post("/api/users", (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const usersData = readJson(USERS_FILE, { users: [] });
  if (!usersData.users.includes(username)) {
    usersData.users.push(username);
    writeJson(USERS_FILE, usersData);
  }

  const states = readJson(STATES_FILE, {});
  if (!states[username]) {
    states[username] = {};
    writeJson(STATES_FILE, states);
  }

  return res.json({ ok: true, users: usersData.users });
});

app.get("/api/state/:username", (req, res) => {
  const username = sanitizeUsername(req.params.username);
  const states = readJson(STATES_FILE, {});
  res.json({ state: states[username] || {} });
});

app.put("/api/state/:username", (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const state = req.body?.state;
  if (typeof state !== "object" || !state) {
    return res.status(400).json({ error: "State object is required" });
  }

  const states = readJson(STATES_FILE, {});
  states[username] = state;
  writeJson(STATES_FILE, states);

  return res.json({ ok: true });
});

app.post("/api/actions", (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  const action = sanitizeUsername(req.body?.action || "update");
  const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const actions = readJson(ACTIONS_FILE, []);
  actions.push({
    username,
    action,
    payload,
    timestamp: new Date().toISOString()
  });
  writeJson(ACTIONS_FILE, actions);

  return res.json({ ok: true });
});

app.get("/api/actions/:username", (req, res) => {
  const username = sanitizeUsername(req.params.username);
  const actions = readJson(ACTIONS_FILE, []);
  res.json({
    actions: actions.filter((entry) => entry.username === username)
  });
});

app.post("/api/admin/clear-user-data", requireAdmin, (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const states = readJson(STATES_FILE, {});
  if (states[username]) {
    delete states[username];
    writeJson(STATES_FILE, states);
  }

  const actions = readJson(ACTIONS_FILE, []);
  const filteredActions = actions.filter((entry) => entry.username !== username);
  if (filteredActions.length !== actions.length) {
    writeJson(ACTIONS_FILE, filteredActions);
  }

  return res.json({ ok: true });
});

app.delete("/api/admin/users/:username", requireAdmin, (req, res) => {
  const username = sanitizeUsername(req.params.username);
  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const usersData = readJson(USERS_FILE, { users: [] });
  const nextUsers = usersData.users.filter((entry) => entry !== username);

  if (nextUsers.length === usersData.users.length) {
    return res.status(404).json({ error: "User not found" });
  }

  writeJson(USERS_FILE, { users: nextUsers });

  const states = readJson(STATES_FILE, {});
  if (states[username]) {
    delete states[username];
    writeJson(STATES_FILE, states);
  }

  const actions = readJson(ACTIONS_FILE, []);
  const filteredActions = actions.filter((entry) => entry.username !== username);
  if (filteredActions.length !== actions.length) {
    writeJson(ACTIONS_FILE, filteredActions);
  }

  return res.json({ ok: true, users: nextUsers });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "daily-status-tracker.html"));
});

app.listen(PORT, () => {
  console.log(`Tracker server running at http://localhost:${PORT}`);
});
