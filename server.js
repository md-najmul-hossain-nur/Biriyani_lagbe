const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const port = process.env.PORT || 3000;

// ✅ Render-এ data persist করার জন্য HOME folder ব্যবহার করি
const dataDir = path.join(process.env.HOME || __dirname, ".data");
const dataFile = path.join(dataDir, "mosques.json");

console.log(`📁 Data directory: ${dataDir}`);
console.log(`📄 Data file: ${dataFile}`);

// ✅ Data folder এবং file তৈরি করি
async function ensureStore() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(dataFile);
      console.log("✅ Data file found!");
    } catch {
      await fs.writeFile(dataFile, "[]", "utf8");
      console.log("✅ Data file created!");
    }
  } catch (error) {
    console.error("❌ Error creating data store:", error);
    throw error;
  }
}

// ✅ Database থেকে data পড়ি
async function readMosques() {
  try {
    const content = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("❌ Error reading mosques:", error);
    return [];
  }
}

// ✅ Database-এ data লেখি (save করি)
async function writeMosques(records) {
  try {
    await fs.writeFile(dataFile, JSON.stringify(records, null, 2), "utf8");
    console.log(`✅ Saved ${records.length} mosques to database`);
  } catch (error) {
    console.error("❌ Error writing mosques:", error);
    throw error;
  }
}

// ✅ JSON response পাঠাই
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

// ✅ Text response পাঠাই
function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

// ✅ File type detect করি
function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg")) return "image/jpeg";
  if (filePath.endsWith(".gif")) return "image/gif";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "text/plain; charset=utf-8";
}

// ✅ Request body পড়ি (JSON data)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
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

// ✅ API routes handle করি
async function handleApi(req, res) {
  // GET /api/mosques - সব mosques পাই
  if (req.method === "GET") {
    try {
      const mosques = await readMosques();
      sendJson(res, 200, mosques);
    } catch {
      sendJson(res, 500, { message: "Failed to load mosque data" });
    }
    return;
  }

  // POST /api/mosques - নতুন mosque যোগ করি
  if (req.method === "POST") {
    const pathOnly = req.url.split("?")[0];
    
    // Verify endpoint - mosque verify করি
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
        console.log(`✅ Verified mosque: ${all[index].name}`);
        sendJson(res, 200, all[index]);
      } catch (error) {
        console.error("Verify error:", error);
        sendJson(res, 500, { message: "Failed to verify mosque" });
      }
      return;
    }

    // নতুন mosque add করি
    try {
      const { name, lat, lng, foodType } = await parseBody(req);

      // ✅ Data validation
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
      console.log(`✅ New mosque added: ${newEntry.name}`);

      sendJson(res, 201, newEntry);
    } catch (error) {
      console.error("POST error:", error);
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

// ✅ Static files handle করি (HTML, CSS, JS, etc)
async function handleStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, "");
  const fullPath = path.join(__dirname, safePath);

  // Security check - directory traversal prevent করি
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

// ✅ Main server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS request handle করি
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (!req.url) {
    sendText(res, 400, "Bad Request");
    return;
  }

  // API routes
  if (req.url.startsWith("/api/mosques")) {
    await handleApi(req, res);
    return;
  }

  // Static files
  await handleStatic(req, res);
});

// ✅ Server start করি
ensureStore()
  .then(() => {
    server.listen(port, "0.0.0.0", () => {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`✅ Server running on port ${port}`);
      console.log(`🌐 Local: http://localhost:${port}`);
      console.log(`📍 Data: ${dataFile}`);
      console.log(`${'='.repeat(50)}\n`);
    });
  })
  .catch((error) => {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  });