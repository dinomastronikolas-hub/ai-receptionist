#!/usr/bin/env node
/**
 * TEST-ONLY stand-in for a Supabase project, used by the Playwright
 * end-to-end tests when a real Supabase stack (Docker) isn't available.
 *
 * It implements just enough of GoTrue (/auth/v1) and PostgREST (/rest/v1)
 * for Tandem's queries, and executes every data request against a real
 * PostgreSQL database as the `anon` / `authenticated` role with the caller's
 * JWT claims — so Row Level Security, grants, triggers and RPCs are the real
 * ones from supabase/migrations. It is NOT a general PostgREST replacement
 * and must never be deployed.
 *
 *   DATABASE_URL=postgres://postgres@localhost:5432/tandem_e2e PORT=54321 node tests/e2e/fake-supabase.mjs
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import pg from "pg";

const PORT = Number(process.env.PORT ?? 54321);
const JWT_SECRET = process.env.JWT_SECRET ?? "tandem-e2e-secret-not-for-production";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------
const b64url = (buf) => Buffer.from(buf).toString("base64url");
export function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, p, s] = String(token).split(".");
  if (!h || !p || !s) return null;
  const expected = createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
  if (expected !== s) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  if (claims.exp && claims.exp < Date.now() / 1000) return null;
  return claims;
}
export const ANON_KEY = signJwt({ role: "anon", iss: "supabase-demo", iat: 1700000000, exp: 4000000000 });

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, range, x-client-info, x-supabase-api-version, x-retry-count",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD",
  "Access-Control-Expose-Headers": "content-range",
};
function send(res, status, body) {
  const headers = { ...CORS };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  res.writeHead(status, headers);
  res.end(body === undefined ? "" : JSON.stringify(body));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  return raw ? JSON.parse(raw) : undefined;
}
function bearer(req) {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// ---------------------------------------------------------------------------
// Auth (GoTrue subset)
// ---------------------------------------------------------------------------
const refreshTokens = new Map(); // token -> user id

function userJson(u) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    confirmed_at: u.email_confirmed_at,
    phone: "",
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [
      {
        identity_id: u.id,
        id: u.id,
        user_id: u.id,
        identity_data: { email: u.email, sub: u.id },
        provider: "email",
        created_at: u.created_at,
        updated_at: u.updated_at,
      },
    ],
    created_at: u.created_at,
    updated_at: u.updated_at,
    is_anonymous: false,
  };
}

function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const access = signJwt({
    aud: "authenticated",
    exp: now + expiresIn,
    iat: now,
    iss: `http://localhost:${PORT}/auth/v1`,
    sub: u.id,
    email: u.email,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    session_id: randomUUID(),
    is_anonymous: false,
  });
  const refresh = randomBytes(24).toString("hex");
  refreshTokens.set(refresh, u.id);
  return { access_token: access, token_type: "bearer", expires_in: expiresIn, expires_at: now + expiresIn, refresh_token: refresh, user: userJson(u) };
}

async function getUserById(id) {
  const { rows } = await pool.query("select * from auth.users where id = $1", [id]);
  return rows[0] ?? null;
}

async function handleAuth(req, res, path, url) {
  const authErr = (status, code, message) => send(res, status, { code: status, error_code: code, msg: message, message });
  if (path === "/signup" && req.method === "POST") {
    const b = await readBody(req);
    if (!b?.email || !b?.password) return authErr(400, "validation_failed", "Email and password are required");
    if (String(b.password).length < 6) return authErr(422, "weak_password", "Password should be at least 6 characters.");
    const exists = await pool.query("select 1 from auth.users where lower(email) = lower($1)", [b.email]);
    if (exists.rowCount) return authErr(422, "user_already_exists", "User already registered");
    const { rows } = await pool.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', lower($1), extensions.crypt($2, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', $3, '', '', '', '')
       returning *`,
      [b.email, b.password, JSON.stringify(b.data ?? {})],
    );
    return send(res, 200, session(rows[0]));
  }
  if (path === "/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    const b = await readBody(req);
    if (grant === "password") {
      const { rows } = await pool.query(
        "select * from auth.users where lower(email) = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)",
        [b?.email ?? "", b?.password ?? ""],
      );
      if (!rows[0]) return authErr(400, "invalid_credentials", "Invalid login credentials");
      return send(res, 200, session(rows[0]));
    }
    if (grant === "refresh_token") {
      const id = refreshTokens.get(b?.refresh_token);
      const u = id ? await getUserById(id) : null;
      if (!u) return authErr(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      refreshTokens.delete(b.refresh_token);
      return send(res, 200, session(u));
    }
    return authErr(400, "unsupported_grant_type", "Unsupported grant type");
  }
  if (path === "/user") {
    const claims = verifyJwt(bearer(req));
    if (!claims?.sub) return authErr(401, "bad_jwt", "invalid JWT");
    let u = await getUserById(claims.sub);
    if (!u) return authErr(403, "user_not_found", "User from sub claim in JWT does not exist");
    if (req.method === "PUT") {
      const b = await readBody(req);
      if (b?.password) {
        await pool.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), updated_at = now() where id = $1", [u.id, b.password]);
      }
      if (b?.data) await pool.query("update auth.users set raw_user_meta_data = raw_user_meta_data || $2 where id = $1", [u.id, JSON.stringify(b.data)]);
      u = await getUserById(u.id);
    }
    return send(res, 200, userJson(u));
  }
  if (path === "/logout") return send(res, 204);
  if (path === "/recover") return send(res, 200, {});
  if (path === "/settings") return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  return authErr(404, "not_found", `Not found: ${path}`);
}

// ---------------------------------------------------------------------------
// Schema metadata
// ---------------------------------------------------------------------------
let columns = new Map(); // table -> [col]
let fks = []; // { table, column, refTable, refColumn }

async function loadMeta() {
  const cols = await pool.query(
    "select table_name, column_name from information_schema.columns where table_schema = 'public' order by ordinal_position",
  );
  columns = new Map();
  for (const r of cols.rows) columns.set(r.table_name, [...(columns.get(r.table_name) ?? []), r.column_name]);
  const f = await pool.query(`
    select cl.relname as table, a.attname as column, rcl.relname as ref_table, ra.attname as ref_column
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_class rcl on rcl.oid = c.confrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
    where c.contype = 'f' and cl.relnamespace = 'public'::regnamespace and rcl.relnamespace = 'public'::regnamespace`);
  fks = f.rows.map((r) => ({ table: r.table, column: r.column, refTable: r.ref_table, refColumn: r.ref_column }));
}

function relationship(from, target) {
  const toOne = fks.filter((f) => f.table === from && f.refTable === target);
  if (toOne.length === 1) return { kind: "one", localCol: toOne[0].column, remoteCol: toOne[0].refColumn };
  const toMany = fks.filter((f) => f.table === target && f.refTable === from);
  if (toMany.length === 1) return { kind: "many", localCol: toMany[0].refColumn, remoteCol: toMany[0].column };
  throw Object.assign(new Error(`Could not find a relationship between '${from}' and '${target}'`), { code: "PGRST200", status: 400 });
}

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { code: "PGRST100", status: 400 });
  return `"${s}"`;
};

// ---------------------------------------------------------------------------
// select=… parser
// ---------------------------------------------------------------------------
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parseSelect(s) {
  return splitTop(s || "*").map((item) => {
    const open = item.indexOf("(");
    if (open === -1) {
      if (item === "*") return { star: true };
      const [a, b] = item.includes(":") ? item.split(":") : [null, item];
      return { name: b.trim(), alias: a?.trim() ?? null };
    }
    const head = item.slice(0, open);
    const inner = item.slice(open + 1, item.lastIndexOf(")"));
    const [aliasPart, rest] = head.includes(":") ? head.split(":") : [null, head];
    const [target, hint] = rest.split("!");
    return { embed: true, alias: aliasPart?.trim() ?? null, target: target.trim(), inner: hint === "inner", children: parseSelect(inner) };
  });
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function parseFilters(url) {
  const out = []; // { path: [..embed names], column, negate, op, value }
  for (const [key, raw] of url.searchParams) {
    if (RESERVED.has(key)) continue;
    const parts = key.split(".");
    const column = parts.pop();
    let v = raw;
    let negate = false;
    if (v.startsWith("not.")) {
      negate = true;
      v = v.slice(4);
    }
    const dot = v.indexOf(".");
    out.push({ path: parts, column, negate, op: v.slice(0, dot), value: v.slice(dot + 1) });
  }
  return out;
}

function filterSql(alias, f, params) {
  const col = `${alias}.${ident(f.column)}`;
  let sql;
  switch (f.op) {
    case "eq": case "neq": case "gt": case "gte": case "lt": case "lte": case "like": case "ilike": {
      const opMap = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
      params.push(f.value);
      sql = `${col} ${opMap[f.op]} $${params.length}`;
      break;
    }
    case "in": {
      const list = f.value.replace(/^\(|\)$/g, "").split(",").filter(Boolean).map((x) => x.replace(/^"|"$/g, ""));
      params.push(list);
      sql = `${col} = any($${params.length})`;
      break;
    }
    case "is": {
      const lit = { null: "null", true: "true", false: "false" }[f.value];
      if (!lit) throw Object.assign(new Error("bad is value"), { status: 400 });
      sql = `${col} is ${lit}`;
      break;
    }
    default:
      throw Object.assign(new Error(`unsupported operator ${f.op}`), { code: "PGRST100", status: 400 });
  }
  return f.negate ? `not (${sql})` : sql;
}

// ---------------------------------------------------------------------------
// SQL builder for (nested) selects
// ---------------------------------------------------------------------------
let aliasN = 0;
const nextAlias = () => `t${++aliasN}`;

/** json_build_object(...) expression for a row of `table` under `alias`. */
function objectExpr(table, alias, tree, filters, path, params) {
  const parts = [];
  const innerConds = [];
  for (const item of tree) {
    if (item.star) {
      for (const c of columns.get(table) ?? []) parts.push(`'${c}', ${alias}.${ident(c)}`);
    } else if (!item.embed) {
      parts.push(`'${item.alias ?? item.name}', ${alias}.${ident(item.name)}`);
    } else {
      const key = item.alias ?? item.target;
      const rel = relationship(table, item.target);
      const sub = nextAlias();
      const myFilters = filters.filter((f) => f.path.length === path.length + 1 && path.every((p, i) => f.path[i] === p) && (f.path[path.length] === key || f.path[path.length] === item.target));
      const where = [`${sub}.${ident(rel.remoteCol)} = ${alias}.${ident(rel.localCol)}`, ...myFilters.map((f) => filterSql(sub, f, params))];
      const childPath = [...path, key];
      const inner = objectExpr(item.target, sub, item.children, filters, childPath, params);
      const whereSql = [...where, ...inner.innerConds].join(" and ");
      if (rel.kind === "one") {
        parts.push(`'${key}', (select ${inner.expr} from public.${ident(item.target)} ${sub} where ${whereSql} limit 1)`);
      } else {
        parts.push(`'${key}', coalesce((select json_agg(${inner.expr}) from public.${ident(item.target)} ${sub} where ${whereSql}), '[]'::json)`);
      }
      if (item.inner) innerConds.push(`exists (select 1 from public.${ident(item.target)} ${sub} where ${whereSql})`);
    }
  }
  // json_build_object takes max 100 args; chunk with ||
  const chunks = [];
  for (let i = 0; i < parts.length; i += 40) chunks.push(`jsonb_build_object(${parts.slice(i, i + 40).join(", ")})`);
  return { expr: chunks.length ? `(${chunks.join(" || ")})::json` : "'{}'::json", innerConds };
}

function orderSql(alias, order) {
  if (!order) return "";
  const items = order.split(",").map((o) => {
    const [col, ...mods] = o.split(".");
    const dir = mods.includes("desc") ? "desc" : "asc";
    const nulls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
    return `${alias}.${ident(col)} ${dir}${nulls}`;
  });
  return ` order by ${items.join(", ")}`;
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------
async function withRole(req, fn) {
  const token = bearer(req) ?? req.headers.apikey;
  const claims = token ? verifyJwt(token) : null;
  const role = claims?.role === "authenticated" ? "authenticated" : "anon";
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? { role: "anon" })]);
    const result = await fn(client, role);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    e.role = role;
    throw e;
  } finally {
    client.release();
  }
}

function pgErrorStatus(e) {
  if (e.status) return e.status;
  switch (e.code) {
    case "23505": case "23503": return 409;
    case "42501": return e.role === "anon" ? 401 : 403;
    case "P0002": return 404;
    case "PGRST116": return 406;
    default: return 400;
  }
}

async function handleRest(req, res, path, url) {
  const prefer = String(req.headers.prefer ?? "");
  const wantObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
  aliasN = 0;

  if (path.startsWith("/rpc/")) {
    const fn = path.slice(5);
    const args = req.method === "GET" ? Object.fromEntries(url.searchParams) : ((await readBody(req)) ?? {});
    const meta = await pool.query(
      `select p.proretset, t.typtype, p.prorettype::regtype::text as rettype, p.proargnames,
              array(select format_type(x, null) from unnest(p.proargtypes) x) as argtypes
       from pg_proc p join pg_type t on t.oid = p.prorettype
       where p.pronamespace = 'public'::regnamespace and p.proname = $1`,
      [fn],
    );
    const m = meta.rows[0];
    if (!m) return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
    const params = [];
    const named = Object.entries(args).map(([k, v]) => {
      const idx = (m.proargnames ?? []).indexOf(k);
      if (idx === -1) throw Object.assign(new Error(`unknown argument ${k}`), { status: 400, code: "PGRST202" });
      params.push(v);
      return `${ident(k)} => $${params.length}::${m.argtypes[idx]}`;
    });
    const call = `public.${ident(fn)}(${named.join(", ")})`;
    const sql = m.proretset
      ? `select coalesce(json_agg(r), '[]'::json) as j from ${call} r`
      : m.typtype === "c"
        ? `select row_to_json(r) as j from ${call} r`
        : m.rettype === "void"
          ? `select ${call}, null::json as j`
          : `select to_json(${call}) as j`;
    const out = await withRole(req, (c) => c.query(sql, params));
    return send(res, 200, out.rows[0]?.j ?? null);
  }

  const table = path.slice(1);
  if (!columns.has(table)) return send(res, 404, { code: "42P01", message: `relation "public.${table}" does not exist` });
  const tree = parseSelect(url.searchParams.get("select") ?? "*");
  const filters = parseFilters(url);
  const params = [];
  const topFilters = filters.filter((f) => f.path.length === 0);
  const t0 = "t0";

  let sql;
  if (req.method === "GET" || req.method === "HEAD") {
    const obj = objectExpr(table, t0, tree, filters, [], params);
    const where = [...topFilters.map((f) => filterSql(t0, f, params)), ...obj.innerConds];
    sql = `select ${obj.expr} as j from public.${ident(table)} ${t0}${where.length ? ` where ${where.join(" and ")}` : ""}${orderSql(t0, url.searchParams.get("order"))}`;
    if (url.searchParams.get("limit")) sql += ` limit ${Number(url.searchParams.get("limit"))}`;
    if (url.searchParams.get("offset")) sql += ` offset ${Number(url.searchParams.get("offset"))}`;
  } else {
    const body = req.method === "DELETE" ? undefined : await readBody(req);
    let mutation;
    if (req.method === "POST") {
      const rows = Array.isArray(body) ? body : [body];
      const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      params.push(JSON.stringify(rows));
      const cols = keys.map(ident).join(", ");
      mutation = `insert into public.${ident(table)} (${cols}) select ${cols} from json_populate_recordset(null::public.${ident(table)}, $1::json)`;
      const onConflict = url.searchParams.get("on_conflict");
      if (prefer.includes("resolution=ignore-duplicates")) {
        mutation += ` on conflict${onConflict ? ` (${onConflict.split(",").map(ident).join(", ")})` : ""} do nothing`;
      } else if (prefer.includes("resolution=merge-duplicates")) {
        mutation += ` on conflict (${onConflict.split(",").map(ident).join(", ")}) do update set ${keys.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}`;
      }
      mutation += " returning *";
    } else if (req.method === "PATCH") {
      params.push(JSON.stringify(body));
      const keys = Object.keys(body);
      const where = topFilters.map((f) => filterSql(t0, f, params));
      mutation = `update public.${ident(table)} as ${t0} set ${keys.map((k) => `${ident(k)} = r.${ident(k)}`).join(", ")} from json_populate_record(null::public.${ident(table)}, $1::json) r${where.length ? ` where ${where.join(" and ")}` : ""} returning ${t0}.*`;
    } else if (req.method === "DELETE") {
      const where = topFilters.map((f) => filterSql(t0, f, params));
      mutation = `delete from public.${ident(table)} as ${t0}${where.length ? ` where ${where.join(" and ")}` : ""} returning ${t0}.*`;
    } else {
      return send(res, 405, { message: "method not allowed" });
    }
    const obj = objectExpr(table, t0, tree, [], [], params);
    sql = `with m as (${mutation}) select ${obj.expr} as j from m ${t0}`;
  }

  const result = await withRole(req, (c) => c.query(sql, params));
  const rows = result.rows.map((r) => r.j);
  if (req.method !== "GET" && !prefer.includes("return=representation")) return send(res, req.method === "POST" ? 201 : 204);
  if (wantObject) {
    if (rows.length !== 1) {
      return send(res, 406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
    }
    return send(res, 200, rows[0]);
  }
  return send(res, req.method === "POST" ? 201 : 200, rows);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/auth/v1")) return await handleAuth(req, res, url.pathname.slice(8), url);
    if (url.pathname.startsWith("/rest/v1")) return await handleRest(req, res, url.pathname.slice(8), url);
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    return send(res, 404, { message: "not found" });
  } catch (e) {
    if (process.env.DEBUG) console.error(req.method, req.url, e);
    return send(res, pgErrorStatus(e), { code: e.code ?? "PGRST000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  }
});

await loadMeta();
server.listen(PORT, () => {
  console.log(`fake-supabase listening on http://localhost:${PORT}`);
  console.log(`ANON_KEY=${ANON_KEY}`);
});
