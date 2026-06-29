import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OIKOS_HOST = "10.0.0.202";
const OIKOS_PORT = 3008;
const PORT = 3000;

const MIME = {
    ".html": "text/html",
    ".js":   "text/javascript",
    ".css":  "text/css",
    ".json": "application/json",
};

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
    console.log(`Open on tablet: http://<your-PC-IP>:${PORT}/scores.html\n`);
});
