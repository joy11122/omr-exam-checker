import assert from "node:assert/strict";

const input = process.env.RELEASE_BASE_URL ?? process.argv[2];
if (!input) {
  throw new Error("Set RELEASE_BASE_URL or pass the deployed HTTPS application URL.");
}

const base = new URL(input);
if (base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) {
  throw new Error("Release smoke checks require HTTPS outside local development.");
}
if (base.username || base.password || base.search || base.hash || base.pathname !== "/") {
  throw new Error("Pass only the canonical application origin, without credentials, path, query, or fragment.");
}

async function request(path) {
  return fetch(new URL(path, base), {
    redirect: "manual",
    headers: { accept: "application/json, text/html" },
    signal: AbortSignal.timeout(15000),
  });
}

const checks = [];
function pass(name) {
  checks.push(name);
  process.stdout.write(`PASS ${name}\n`);
}

const live = await request("/api/health/live");
assert.equal(live.status, 200, "Liveness endpoint must return HTTP 200.");
assert.equal((await live.json()).status, "ok", "Liveness payload is invalid.");
pass("liveness endpoint");

const ready = await request("/api/health/ready");
assert.equal(ready.status, 200, "Readiness endpoint must return HTTP 200; verify MongoDB connectivity.");
assert.equal((await ready.json()).status, "ready", "Readiness payload is invalid.");
pass("MongoDB readiness endpoint");

for (const path of ["/login", "/register"]) {
  const response = await request(path);
  assert.equal(response.status, 200, `${path} must return HTTP 200.`);
  pass(`public route ${path}`);
}

const session = await request("/api/auth/session");
assert.equal(session.status, 200, "Auth.js session endpoint must be reachable.");
pass("Auth.js session endpoint");

const dashboard = await request("/dashboard");
assert.ok(dashboard.status >= 300 && dashboard.status < 400, "Unauthenticated dashboard access must redirect.");
const redirectLocation = dashboard.headers.get("location");
assert.ok(redirectLocation && new URL(redirectLocation, base).pathname === "/login", "Dashboard must redirect unauthenticated users to /login.");
pass("unauthenticated workspace protection");

const login = await request("/login");
assert.equal(login.headers.get("x-frame-options")?.toUpperCase(), "DENY", "X-Frame-Options must be DENY.");
assert.equal(login.headers.get("x-content-type-options")?.toLowerCase(), "nosniff", "X-Content-Type-Options must be nosniff.");
assert.equal(login.headers.get("referrer-policy"), "strict-origin-when-cross-origin", "Referrer-Policy is missing.");
if (base.protocol === "https:") {
  assert.match(login.headers.get("strict-transport-security") ?? "", /max-age=31536000/, "Production HSTS header is missing.");
}
pass("production security response headers");

process.stdout.write(`\nRelease smoke checks passed: ${checks.length}\n`);
