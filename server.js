const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;

// Render-এ persistent ডেটার জন্য
const dataDir = path.join(process.env.HOME || __dirname, ".data");
const dataFile = path.join(dataDir, "mosques.json");

async function ensureStore() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]", "utf8");
  }
}

async function readMosques() {
  try {
    const content = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeMosques(records) {
  await fs.writeFile(dataFile, JSON.stringify(records, null, 2), "utf8");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  if (req.method === "GET") {
    try {
      const mosques = await readMosques();
      sendJson(res, 200, mosques);
    } catch {
      sendJson(res, 500, { message: "Failed to load mosque data" });
    }
    return;
  }

  if (req.method === "POST") {
    const pathOnly = req.url.split("?")[0];
    const verifyMatch = pathOnly.match(/^\/api\/mosques\/([^/]+)\/verify$/);

    if (verifyMatch) {
      try {
        const mosqueId = decodeURIComponent(verifyMatch[1]);
        const all = await readMosques();
        const index = all.findIndex((entry) => entry.id === mosqueId);

        if (index === -1) {
          sendJson(res, 404, { message: "Mosque not found" });
          return;
        }

        all[index].verifyCount = Number(all[index].verifyCount || 0) + 1;
        await writeMosques(all);
        sendJson(res, 200, all[index]);
      } catch {
        sendJson(res, 500, { message: "Failed to verify mosque data" });
      }
      return;
    }

    try {
      const { name, lat, lng, foodType } = await parseBody(req);

      if (
        typeof name !== "string" ||
        !name.trim() ||
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        !["biryani", "muri", "none"].includes(foodType)
      ) {
        sendJson(res, 400, { message: "Invalid request body" });
        return;
      }

      const newEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: name.trim(),
        lat,
        lng,
        foodType,
        verifyCount: 0,
        createdAt: new Date().toISOString(),
      };

      const all = await readMosques();
      all.push(newEntry);
      await writeMosques(all);
      sendJson(res, 201, newEntry);
    } catch (error) {
      if (error.message === "Invalid JSON body") {
        sendJson(res, 400, { message: "Invalid JSON body" });
        return;
      }
      sendJson(res, 500, { message: "Failed to save mosque data" });
    }
    return;
  }

  sendText(res, 405, "Method Not Allowed");
}

async function handleStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, "");
  const fullPath = path.join(__dirname, safePath);

  if (!fullPath.startsWith(__dirname)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fsSync.existsSync(fullPath) || fsSync.statSync(fullPath).isDirectory()) {
    sendText(res, 404, "Not Found");
    return;
  }

  try {
    const content = await fs.readFile(fullPath);
    res.writeHead(200, { "Content-Type": getContentType(fullPath) });
    res.end(content);
  } catch {
    sendText(res, 500, "Failed to load file");
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (!req.url) {
    sendText(res, 400, "Bad Request");
    return;
  }

  if (req.url.startsWith("/api/mosques")) {
    await handleApi(req, res);
    return;
  }

  await handleStatic(req, res);
});

ensureStore()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`📍 Data stored at: ${dataFile}`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to initialize data store", error);
    process.exit(1);
  });