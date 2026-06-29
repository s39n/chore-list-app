import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defaultStore, approveWeek, redeemPoints } from "./points.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OIKOS_HOST = "10.0.0.202";
const OIKOS_PORT = 3008;
const PORT = 3000;

// Parent PIN gates all write operations on the points store.
// Override with: PARENT_PIN=xxxx npm start
const PARENT_PIN = process.env.PARENT_PIN || "1234";

// JSON file that persists points, balances, and approval history.
const DATA_FILE = path.join(__dirname, "data", "store.json");

const MIME = {
    ".html": "text/html",
    ".js":   "text/javascript",
    ".css":  "text/css",
    ".json": "application/json",
};

// ---------------------------------------------------------------------------
// Points store (flat JSON file, no external dependencies)
// Core math lives in points.js so it can be unit-tested.
// ---------------------------------------------------------------------------
function loadStore() {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
        return { ...defaultStore(), ...JSON.parse(raw) };
    } catch {
        return defaultStore();
    }
}

function saveStore(store) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1e6) { req.destroy(); reject(new Error("body too large")); }
        });
        req.on("end", () => {
            if (!body) return resolve({});
            try { resolve(JSON.parse(body)); } catch { reject(new Error("invalid JSON")); }
        });
        req.on("error", reject);
    });
}

function sendJson(res, status, obj) {
    const data = JSON.stringify(obj);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(data);
}

function authorized(req) {
    return (req.headers["x-parent-pin"] || "") === PARENT_PIN;
}

async function handleStore(req, res, urlPath) {
    // GET /store — full store (read-only, no PIN: kids' tablet needs point values + balances)
    if (req.method === "GET" && urlPath === "/store") {
        return sendJson(res, 200, loadStore());
    }

    // Everything below mutates state and requires the parent PIN.
    if (!authorized(req)) {
        return sendJson(res, 401, { error: "bad or missing parent PIN" });
    }

    let body;
    try { body = await readJsonBody(req); }
    catch (e) { return sendJson(res, 400, { error: e.message }); }

    // PUT /store/points — replace the point-value config
    if (req.method === "PUT" && urlPath === "/store/points") {
        const store = loadStore();
        if (body.pointValues && typeof body.pointValues === "object") {
            store.pointValues = {};
            for (const [title, val] of Object.entries(body.pointValues)) {
                const n = Number(val);
                if (Number.isFinite(n)) store.pointValues[title] = n;
            }
        }
        if (Number.isFinite(Number(body.defaultPoints))) {
            store.defaultPoints = Number(body.defaultPoints);
        }
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/approve — bank a kid's weekly total ({ weekStart, kidId, points })
    if (req.method === "POST" && urlPath === "/store/approve") {
        const kidId = String(body.kidId);
        const weekStart = String(body.weekStart || "");
        const points = Number(body.points);
        if (!kidId || !weekStart || !Number.isFinite(points)) {
            return sendJson(res, 400, { error: "kidId, weekStart and numeric points required" });
        }
        const store = loadStore();
        approveWeek(store, kidId, weekStart, points);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/redeem — subtract from a kid's banked balance ({ kidId, amount, note })
    if (req.method === "POST" && urlPath === "/store/redeem") {
        const kidId = String(body.kidId);
        const amount = Number(body.amount);
        if (!kidId || !Number.isFinite(amount) || amount <= 0) {
            return sendJson(res, 400, { error: "kidId and positive numeric amount required" });
        }
        const store = loadStore();
        redeemPoints(store, kidId, amount, body.note);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    return sendJson(res, 404, { error: "unknown store endpoint" });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
http.createServer((req, res) => {
    // Proxy all /api/* and /health requests to Oikos
    if (req.url.startsWith("/api/") || req.url === "/health") {
        const proxy = http.request(
            { host: OIKOS_HOST, port: OIKOS_PORT, path: req.url, method: req.method, headers: req.headers },
            (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); }
        );
        proxy.on("error", () => { res.writeHead(502); res.end("Proxy error"); });
        req.pipe(proxy);
        return;
    }

    // Local points/banking store
    if (req.url === "/store" || req.url.startsWith("/store/")) {
        handleStore(req, res, req.url.split("?")[0]).catch(() => {
            sendJson(res, 500, { error: "store error" });
        });
        return;
    }

    // Serve static files
    // Strip query/hash, decode percent-escapes, and normalize before joining
    let urlPath;
    try {
        urlPath = decodeURIComponent(req.url.split(/[?#]/)[0]);
    } catch {
        res.writeHead(400); res.end("Bad request"); return;
    }
    if (urlPath === "/") urlPath = "/scores.html";

    // Resolve against the served root and confine to it (block path traversal)
    const filePath = path.normalize(path.join(__dirname, urlPath));
    if (filePath !== __dirname && !filePath.startsWith(__dirname + path.sep)) {
        res.writeHead(403); res.end("Forbidden"); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end("Not found"); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "text/plain" });
        res.end(data);
    });
}).listen(PORT, "0.0.0.0", () => {
    console.log(`\nChore board running at http://0.0.0.0:${PORT}`);
    console.log(`Tablet:  http://<your-PC-IP>:${PORT}/scores.html`);
    console.log(`Parent:  http://<your-PC-IP>:${PORT}/approve.html  (PIN: ${PARENT_PIN})\n`);
});
