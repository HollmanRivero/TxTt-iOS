<<<<<<< HEAD
// ─────────────────────────────────────────────────────────────
//  TxTt — Electron main process
//  Serves the built Vite app (dist/) over a local HTTP server and
//  loads it in a window. Using http://localhost (not file://) keeps
//  React Router, the service worker, and Supabase auth working.
// ─────────────────────────────────────────────────────────────
const { app, BrowserWindow, session, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Fixed port so OAuth redirect URLs stay stable between launches.
// If you enable Google sign-in, whitelist http://localhost:51735 in
// Supabase (Auth → URL Configuration) and in Google Cloud credentials.
const PORT = 51735;
const DIST = path.join(__dirname, "..", "dist");

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const filePath = path.join(DIST, urlPath);

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // SPA fallback: unknown routes → index.html (React Router takes over)
          fs.readFile(path.join(DIST, "index.html"), (e2, html) => {
            if (e2) {
              res.writeHead(404);
              res.end("Not found");
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html);
          });
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(PORT));
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 860,
    minWidth: 360,
    minHeight: 600,
    backgroundColor: "#0a0a0f",
    title: "TxTt",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open target=_blank links (e.g. the Supabase sign-up link) in the
  // user's real browser instead of a blank Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged && process.env.ELECTRON_DEV) {
    // Dev: load the running Vite dev server
    await win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const port = await startServer();
    await win.loadURL(`http://localhost:${port}`);
=======
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // In development, load Vite's local server. In production, load the built files.
  if (process.env.ELECTRON_DEV) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
>>>>>>> 9a3b35cb (Initial commit: TxTt2.2.2 klar for folket med sikkerhet og dokumentasjon)
  }
}

app.whenReady().then(() => {
<<<<<<< HEAD
  // Allow camera / microphone / notifications for calls and messaging
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = [
      "media",
      "audioCapture",
      "videoCapture",
      "clipboard-read",
      "clipboard-sanitized-write",
      "notifications",
    ];
    callback(allowed.includes(permission));
  });

  createWindow();

  app.on("activate", () => {
=======
  createWindow();

  app.on('activate', () => {
>>>>>>> 9a3b35cb (Initial commit: TxTt2.2.2 klar for folket med sikkerhet og dokumentasjon)
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

<<<<<<< HEAD
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
=======
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
>>>>>>> 9a3b35cb (Initial commit: TxTt2.2.2 klar for folket med sikkerhet og dokumentasjon)
