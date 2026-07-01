import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defaultStore, approveWeek, redeemPoints, logCompletion, unlogCompletion,
         bankUnbanked, deleteRedemption, editRedemption,
         adjustPoints, deleteAdjustment, resetPoints } from "./points.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// All of these can be overridden via environment variables (e.g. in Docker).
const OIKOS_HOST = process.env.OIKOS_HOST || "10.0.0.202";
const OIKOS_PORT = Number(process.env.OIKOS_PORT) || 3008;
const PORT = Number(process.env.PORT) || 3000;

// Parent PIN gates all write operations on the points store.
// Override with: PARENT_PIN=xxxx npm start
const PARENT_PIN = process.env.PARENT_PIN || "1234";

// Where the points/balances JSON lives. In Docker, mount a volume here.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");

// JSON file that persists points, balances, and approval history.
const DATA_FILE = path.join(DATA_DIR, "store.json");

// Live chore config lives in the volume so parent edits survive rebuilds.
// The image ships a baked-in copy that seeds the volume on first run.
const CHORES_FILE = path.join(DATA_DIR, "chores.json");
const CHORES_SEED = path.join(__dirname, "chores.json");

// Weather (server fetches Open-Meteo — free, no API key — and caches to the
// volume so the old iPad never has to call an external API directly).
const WEATHER_FILE = path.join(DATA_DIR, "weather.json");
const WEATHER_LAT = process.env.WEATHER_LAT || "39.5349";      // Sparks, NV
const WEATHER_LON = process.env.WEATHER_LON || "-119.7527";
const WEATHER_LABEL = process.env.WEATHER_LABEL || "Sparks";
const WEATHER_TZ = process.env.WEATHER_TZ || "America/Los_Angeles";

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

// Chore config: read from the volume, seeding from the baked-in default the
// first time (so existing installs pick up the shipped chores once).
function loadChores() {
    try {
        return JSON.parse(fs.readFileSync(CHORES_FILE, "utf8"));
    } catch {
        try {
            const seed = fs.readFileSync(CHORES_SEED, "utf8");
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(CHORES_FILE, seed);
            return JSON.parse(seed);
        } catch {
            return { chores: [], kids: [], defaultPoints: 10 };
        }
    }
}
function saveChores(cfg) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CHORES_FILE, JSON.stringify(cfg, null, 2));
}

// WMO weather code -> short text + emoji for the screen saver.
function weatherDesc(code) {
    const m = {
        0: ["Clear", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
        45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"],
        51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Drizzle", "🌦️"],
        61: ["Light rain", "🌧️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
        66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
        71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow", "🌨️"],
        80: ["Showers", "🌦️"], 81: ["Showers", "🌦️"], 82: ["Heavy showers", "⛈️"],
        85: ["Snow showers", "🌨️"], 86: ["Snow showers", "🌨️"],
        95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm", "⛈️"], 99: ["Thunderstorm", "⛈️"]
    };
    return m[code] || ["—", "🌡️"];
}

// Fetch current weather from Open-Meteo and cache it to the volume. Errors are
// swallowed (keeps the last good file) so a network blip never crashes serving.
async function fetchWeather() {
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + WEATHER_LAT +
        "&longitude=" + WEATHER_LON +
        "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min" +
        "&temperature_unit=fahrenheit&timezone=" + encodeURIComponent(WEATHER_TZ) + "&forecast_days=1";
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error("http " + r.status);
        const j = await r.json();
        const cur = j.current || {};
        const day = j.daily || {};
        const dd = weatherDesc(cur.weather_code);
        const out = {
            label: WEATHER_LABEL,
            temp: Math.round(cur.temperature_2m),
            code: cur.weather_code,
            desc: dd[0],
            icon: dd[1],
            hi: Array.isArray(day.temperature_2m_max) ? Math.round(day.temperature_2m_max[0]) : null,
            lo: Array.isArray(day.temperature_2m_min) ? Math.round(day.temperature_2m_min[0]) : null,
            updated: new Date().toISOString()
        };
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(WEATHER_FILE, JSON.stringify(out, null, 2));
        console.log("weather:", out.temp + "°", out.desc);
    } catch (e) {
        console.log("weather fetch failed:", e.message);
    }
}

// ---------------------------------------------------------------------------
// Calendar: fetch a Google "secret iCal" feed, compute today's events, cache to
// the volume. Zero dependencies — a compact iCal parser handles the common cases
// (all-day + timed events, DAILY/WEEKLY/MONTHLY/YEARLY recurrence, EXDATE, UNTIL).
// ---------------------------------------------------------------------------
const CALENDAR_FILE = path.join(DATA_DIR, "calendar.json");
const CALENDAR_SEED = path.join(__dirname, "calendar.json");
const CAL_ICS_URL = process.env.CAL_ICS_URL || "";
const CAL_TZ = process.env.CAL_TZ || "America/Los_Angeles";
const BYDAY_NUM = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function ymdOf(dateObj) {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: CAL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(dateObj);
    const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
    return { y: g("year"), m: g("month"), d: g("day") };
}
function ymdUTC(a) { return Date.UTC(a.y, a.m - 1, a.d); }
function dowOf(a) { return new Date(ymdUTC(a)).getUTCDay(); }
function daysBetween(a, b) { return Math.round((ymdUTC(b) - ymdUTC(a)) / 86400000); }
function sameYmd(a, b) { return a.y === b.y && a.m === b.m && a.d === b.d; }
function fmt12(hh, mm) { const ap = hh >= 12 ? "PM" : "AM"; let h = hh % 12; if (h === 0) h = 12; return h + ":" + (mm < 10 ? "0" + mm : mm) + " " + ap; }

function unfoldICS(text) {
    const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const out = [];
    for (const line of raw) {
        if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
        else out.push(line);
    }
    return out;
}
function parseDT(params, value) {
    if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(value)) {
        return { allDay: true, local: { y: +value.slice(0, 4), m: +value.slice(4, 6), d: +value.slice(6, 8), hh: 0, mm: 0 } };
    }
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
    if (!m) return null;
    const c = { y: +m[1], m: +m[2], d: +m[3], hh: +m[4], mm: +m[5] };
    if (m[7] === "Z") {
        const inst = new Date(Date.UTC(c.y, c.m - 1, c.d, c.hh, c.mm, +m[6]));
        const p = new Intl.DateTimeFormat("en-CA", { timeZone: CAL_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(inst);
        const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
        let hh = g("hour"); if (hh === 24) hh = 0;
        return { allDay: false, local: { y: g("year"), m: g("month"), d: g("day"), hh, mm: g("minute") } };
    }
    return { allDay: false, local: c }; // TZID or floating: treat as calendar-local
}
function parseICS(text) {
    const lines = unfoldICS(text);
    const events = [];
    let cur = null;
    for (const line of lines) {
        if (line === "BEGIN:VEVENT") { cur = { exdates: [], rrule: null }; continue; }
        if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
        if (!cur) continue;
        const ci = line.indexOf(":");
        if (ci < 0) continue;
        const left = line.slice(0, ci), value = line.slice(ci + 1);
        const semi = left.indexOf(";");
        const name = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
        const params = semi < 0 ? "" : left.slice(semi + 1);
        if (name === "SUMMARY") cur.summary = value;
        else if (name === "STATUS") cur.status = value.toUpperCase();
        else if (name === "DTSTART") cur.start = parseDT(params, value);
        else if (name === "RECURRENCE-ID") cur.recurrenceId = parseDT(params, value);
        else if (name === "EXDATE") value.split(",").forEach((v) => { const p = parseDT(params, v.trim()); if (p) cur.exdates.push(p.local); });
        else if (name === "RRULE") {
            const r = { interval: 1, byday: null, until: null, bymonthday: null };
            value.split(";").forEach((kv) => {
                const eq = kv.indexOf("="); if (eq < 0) return;
                const K = kv.slice(0, eq).toUpperCase(), V = kv.slice(eq + 1);
                if (K === "FREQ") r.freq = V.toUpperCase();
                else if (K === "INTERVAL") r.interval = parseInt(V, 10) || 1;
                else if (K === "BYDAY") r.byday = V.split(",").map((x) => BYDAY_NUM[x.slice(-2).toUpperCase()]).filter((n) => n != null);
                else if (K === "BYMONTHDAY") r.bymonthday = parseInt(V, 10);
                else if (K === "UNTIL") { const u = /^(\d{4})(\d{2})(\d{2})/.exec(V); if (u) r.until = { y: +u[1], m: +u[2], d: +u[3] }; }
            });
            cur.rrule = r;
        }
    }
    return events;
}
function occursOn(ev, today) {
    const s = ev.start.local, s0 = { y: s.y, m: s.m, d: s.d };
    if (ev.exdates.some((x) => sameYmd(x, today))) return false;
    if (!ev.rrule) return sameYmd(s0, today);
    const r = ev.rrule;
    if (daysBetween(s0, today) < 0) return false;
    if (r.until && daysBetween(today, r.until) < 0) return false;
    const iv = r.interval || 1;
    if (r.freq === "DAILY") return daysBetween(s0, today) % iv === 0;
    if (r.freq === "WEEKLY") {
        const days = (r.byday && r.byday.length) ? r.byday : [dowOf(s0)];
        if (days.indexOf(dowOf(today)) < 0) return false;
        return Math.floor(daysBetween(s0, today) / 7) % iv === 0;
    }
    if (r.freq === "MONTHLY") {
        const day = (r.bymonthday != null) ? r.bymonthday : s0.d;
        if (today.d !== day) return false;
        const months = (today.y - s0.y) * 12 + (today.m - s0.m);
        return months >= 0 && months % iv === 0;
    }
    if (r.freq === "YEARLY") {
        if (today.m !== s0.m || today.d !== s0.d) return false;
        return (today.y - s0.y) % iv === 0;
    }
    return false;
}
function minsOf(start) { return start.allDay ? -1 : start.local.hh * 60 + start.local.mm; }
function todaysEvents(text, today) {
    today = today || ymdOf(new Date());
    const events = parseICS(text);
    const out = [];
    for (const ev of events) {
        if (!ev.start || ev.status === "CANCELLED") continue;
        const label = ev.start.allDay ? "All day" : fmt12(ev.start.local.hh, ev.start.local.mm);
        if (ev.recurrenceId) {
            if (sameYmd(ev.recurrenceId.local, today)) out.push({ time: label, title: ev.summary || "", _s: minsOf(ev.start) });
            continue;
        }
        if (occursOn(ev, today)) out.push({ time: label, title: ev.summary || "", _s: minsOf(ev.start) });
    }
    out.sort((a, b) => a._s - b._s);
    return out.map((e) => ({ time: e.time, title: e.title }));
}
async function fetchCalendar() {
    if (!CAL_ICS_URL) return;
    try {
        const r = await fetch(CAL_ICS_URL);
        if (!r.ok) throw new Error("http " + r.status);
        const text = await r.text();
        const t = ymdOf(new Date());
        const out = {
            generated: t.y + "-" + String(t.m).padStart(2, "0") + "-" + String(t.d).padStart(2, "0"),
            events: todaysEvents(text, t)
        };
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(CALENDAR_FILE, JSON.stringify(out, null, 2));
        console.log("calendar:", out.events.length, "events today");
    } catch (e) {
        console.log("calendar fetch failed:", e.message);
    }
}
function loadCalendarFile() {
    try { return fs.readFileSync(CALENDAR_FILE, "utf8"); }
    catch {
        try { const seed = fs.readFileSync(CALENDAR_SEED, "utf8"); fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CALENDAR_FILE, seed); return seed; }
        catch { return JSON.stringify({ generated: "", events: [] }); }
    }
}

// GET /chores.json (open) returns the config; PUT /chores (parent PIN) saves it.
async function handleChores(req, res) {
    if (req.method === "GET") {
        return sendJson(res, 200, loadChores());
    }
    if (req.method === "PUT") {
        if (!authorized(req)) {
            return sendJson(res, 401, { error: "bad or missing parent PIN" });
        }
        let body;
        try { body = await readJsonBody(req); }
        catch (e) { return sendJson(res, 400, { error: e.message }); }
        if (!body || !Array.isArray(body.chores)) {
            return sendJson(res, 400, { error: "chores array required" });
        }
        saveChores(body);
        return sendJson(res, 200, loadChores());
    }
    return sendJson(res, 405, { error: "method not allowed" });
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

    // POST /store/complete — log one chore completion ({ kidId, taskId, title }).
    // No PIN: the kids' tablet records these every time "Done" is tapped.
    if (req.method === "POST" && urlPath === "/store/complete") {
        let body;
        try { body = await readJsonBody(req); }
        catch (e) { return sendJson(res, 400, { error: e.message }); }
        if (!body.kidId || body.taskId === undefined || body.taskId === null) {
            return sendJson(res, 400, { error: "kidId and taskId required" });
        }
        const store = loadStore();
        logCompletion(store, body.kidId, body.taskId, body.title, body.points);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/uncomplete — undo the latest completion for a kid+task. No PIN.
    if (req.method === "POST" && urlPath === "/store/uncomplete") {
        let body;
        try { body = await readJsonBody(req); }
        catch (e) { return sendJson(res, 400, { error: e.message }); }
        if (!body.kidId || body.taskId === undefined || body.taskId === null) {
            return sendJson(res, 400, { error: "kidId and taskId required" });
        }
        const store = loadStore();
        unlogCompletion(store, body.kidId, body.taskId);
        saveStore(store);
        return sendJson(res, 200, store);
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

    // POST /store/bank — move all of a kid's unbanked points into the bank
    if (req.method === "POST" && urlPath === "/store/bank") {
        const kidId = String(body.kidId || "");
        if (!kidId) return sendJson(res, 400, { error: "kidId required" });
        const store = loadStore();
        bankUnbanked(store, kidId);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/redeem/delete — remove a redemption (refunds the balance)
    if (req.method === "POST" && urlPath === "/store/redeem/delete") {
        const kidId = String(body.kidId || "");
        if (!kidId || !body.id) return sendJson(res, 400, { error: "kidId and id required" });
        const store = loadStore();
        deleteRedemption(store, kidId, body.id);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/redeem/edit — change a redemption's amount/note (adjusts balance)
    if (req.method === "POST" && urlPath === "/store/redeem/edit") {
        const kidId = String(body.kidId || "");
        if (!kidId || !body.id) return sendJson(res, 400, { error: "kidId and id required" });
        const store = loadStore();
        editRedemption(store, kidId, body.id, body.amount, body.note);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/adjust — manual bonus/penalty ({ kidId, points(±), note, target })
    if (req.method === "POST" && urlPath === "/store/adjust") {
        const kidId = String(body.kidId || "");
        if (!kidId || !Number.isFinite(Number(body.points))) {
            return sendJson(res, 400, { error: "kidId and numeric points required" });
        }
        const store = loadStore();
        adjustPoints(store, kidId, body.points, body.note, body.target);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/adjust/delete — remove an adjustment (reverses its effect)
    if (req.method === "POST" && urlPath === "/store/adjust/delete") {
        const kidId = String(body.kidId || "");
        if (!kidId || !body.id) return sendJson(res, 400, { error: "kidId and id required" });
        const store = loadStore();
        deleteAdjustment(store, kidId, body.id);
        saveStore(store);
        return sendJson(res, 200, store);
    }

    // POST /store/reset — wipe all points data to zero (parent PIN)
    if (req.method === "POST" && urlPath === "/store/reset") {
        const store = loadStore();
        resetPoints(store);
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

    // Chore config (served from the data volume; parents edit it via PUT /chores)
    if (req.url.split("?")[0] === "/chores.json" || req.url.split("?")[0] === "/chores") {
        handleChores(req, res).catch(() => sendJson(res, 500, { error: "chores error" }));
        return;
    }

    // Cached weather for the screen saver
    if (req.url.split("?")[0] === "/weather.json") {
        try {
            const w = fs.readFileSync(WEATHER_FILE, "utf8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(w);
        } catch {
            sendJson(res, 200, {});
        }
        return;
    }

    // Today's calendar events (served from the volume; refreshed from the iCal feed)
    if (req.url.split("?")[0] === "/calendar.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(loadCalendarFile());
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

// Keep weather fresh. The first fetch can race container networking coming up,
// so retry a few times on boot until it lands, then refresh hourly.
(async function () {
    for (let i = 0; i < 6; i++) {
        await fetchWeather();
        try {
            const w = JSON.parse(fs.readFileSync(WEATHER_FILE, "utf8"));
            if (w && w.temp != null) break;
        } catch { /* not written yet — retry */ }
        await new Promise((r) => setTimeout(r, 15000));
    }
})();
setInterval(fetchWeather, 60 * 60 * 1000);

// Same for the calendar feed — only if a secret iCal URL is configured.
if (CAL_ICS_URL) {
    (async function () {
        for (let i = 0; i < 6; i++) {
            await fetchCalendar();
            try {
                const c = JSON.parse(fs.readFileSync(CALENDAR_FILE, "utf8"));
                if (c && c.generated) break;
            } catch { /* not written yet — retry */ }
            await new Promise((r) => setTimeout(r, 15000));
        }
    })();
    setInterval(fetchCalendar, 60 * 60 * 1000);
}
