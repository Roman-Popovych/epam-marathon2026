const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REGION = "eu-north-1";
const API = process.argv[2];
if (!API) throw new Error("usage: node e2e.js <api-base-url>");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-"));
const PASSWORD = "Test1234!x";
const OWNER_EMAIL = "e2e.owner@example.com";
const STRANGER_EMAIL = "e2e.stranger@example.com";

// ------------------------------------------------------------------ helpers
const aws = (...args) => {
  const out = execFileSync("aws", [...args, "--region", REGION, "--output", "json"], { encoding: "utf8" });
  return out.trim() ? JSON.parse(out) : null;
};
const ddb = (v) => {
  if (v === null || v === undefined) return { NULL: true };
  if (typeof v === "string") return { S: v };
  if (typeof v === "number") return { N: String(v) };
  if (typeof v === "boolean") return { BOOL: v };
  if (Array.isArray(v)) return { L: v.map(ddb) };
  return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ddb(x)])) };
};
const putItem = (table, obj) => {
  const f = path.join(TMP, "item.json");
  fs.writeFileSync(f, JSON.stringify(Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, ddb(v)]))));
  aws("dynamodb", "put-item", "--table-name", table, "--item", "file://" + f.replace(/\\/g, "/"));
};
const getItem = (table, key) => {
  const f = path.join(TMP, "key.json");
  fs.writeFileSync(f, JSON.stringify(Object.fromEntries(Object.entries(key).map(([k, v]) => [k, ddb(v)]))));
  return aws("dynamodb", "get-item", "--table-name", table, "--key", "file://" + f.replace(/\\/g, "/"))?.Item;
};
const deleteItem = (table, key) => {
  const f = path.join(TMP, "key.json");
  fs.writeFileSync(f, JSON.stringify(Object.fromEntries(Object.entries(key).map(([k, v]) => [k, ddb(v)]))));
  aws("dynamodb", "delete-item", "--table-name", table, "--key", "file://" + f.replace(/\\/g, "/"));
};

async function call(method, route, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = token;
  const res = await fetch(API + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond });
  console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "   <-- " + detail));
}
const subOf = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).sub;

async function registerAndSignIn(email, first) {
  await call("POST", "/register", { firstName: first, lastName: "Tester", email, password: PASSWORD, confirmPassword: PASSWORD });
  const r = await call("POST", "/signin", { email, password: PASSWORD });
  if (r.status !== 200) throw new Error("sign-in failed for " + email + ": " + r.status + " " + r.text);
  return r.json.idToken;
}

const D1 = "e2e-dish-1", D2 = "e2e-dish-2", D9 = "e2e-dish-9";
const G1 = "e2e-group-1", R1 = "e2e-res-1", O1 = "e2e-order-1";
const G2 = "e2e-group-2", R2 = "e2e-res-2";
const dish = (id, name, price) => ({
  id, name, description: "test", dishType: 0, price, weight: "100 g", calories: "100", proteins: "1",
  fats: "1", carbohydrates: "1", vitamins: "-", state: 0, locationId: "e2e-loc",
});
const session = (id, group, name, submitted, dishes, extra = {}) => ({
  guestSessionId: id, groupReservationId: group, guestName: name, isSubmitted: submitted, isOwnerSession: false,
  dishes: dishes.map(([dishId, quantity]) => ({ dishId, quantity, state: 0 })), ...extra,
});
const reservation = (id, customerId) => ({
  id, tableId: "e2e-table", customerId, waiterId: "e2e-waiter", createdByWaiter: false,
  startTime: "2026-11-10T18:00:00.000Z", endTime: "2026-11-10T20:00:00.000Z", guestCount: 6, status: 0,
});
const group = (id, resId) => ({ groupReservationId: id, reservationId: resId, reservationToken: "tok-" + id, status: 0 });
const order = (id, resId, customerId) => ({
  orderId: id, customerId, reservationId: resId, reservationAddress: "Test street 1", reservationTime: "Nov 10", dishes: [], status: 0,
});

const created = []; // [table, key] for cleanup
const put = (table, obj, key) => { putItem(table, obj); created.push([table, key]); };

// ------------------------------------------------------------------ main
(async () => {
  let ownerSub, ownerToken, strangerToken;
  try {
    ownerToken = await registerAndSignIn(OWNER_EMAIL, "Owner");
    strangerToken = await registerAndSignIn(STRANGER_EMAIL, "Stranger");
    ownerSub = subOf(ownerToken);

    // ---- test data
    put("Dishes", dish(D1, "Caesar Salad", 180), { id: D1 });
    put("Dishes", dish(D2, "Tom Yum", 220), { id: D2 });
    put("Dishes", dish(D9, "Never Ordered", 999), { id: D9 });
    put("Reservations", reservation(R1, ownerSub), { id: R1 });
    put("GroupReservations", group(G1, R1), { groupReservationId: G1 });
    put("Reservations", reservation(R2, ownerSub), { id: R2 });
    put("GroupReservations", group(G2, R2), { groupReservationId: G2 });
    put("Orders", order("e2e-order-2", R2, ownerSub), { orderId: "e2e-order-2", customerId: ownerSub });

    const S_ANDRII = "e2e-s-andrii", S_OLENA = "e2e-s-olena", S_IVAN = "e2e-s-ivan", S_PETRO = "e2e-s-petro", S_OTHER = "e2e-s-other";
    put("GuestSessions", session(S_ANDRII, G1, "Andrii", true, [[D1, 2]]), { guestSessionId: S_ANDRII });
    put("GuestSessions", session(S_OLENA, G1, "Olena", false, [[D2, 1]]), { guestSessionId: S_OLENA });
    put("GuestSessions", session(S_IVAN, G1, "Ivan", true, [[D1, 1], [D2, 1]]), { guestSessionId: S_IVAN });
    put("GuestSessions", session(S_OTHER, G2, "Foreign", false, []), { guestSessionId: S_OTHER });

    // ================= LEVEL 1: GET /guest/groups/{id}/sessions
    console.log("\n--- Level 1: GET sessions");
    let r = await call("GET", `/guest/groups/${G1}/sessions`, undefined, ownerToken);
    check("L1 200 for owner", r.status === 200, r.status + " " + r.text);
    check("L1 camelCase body (participants/total)", r.json && Array.isArray(r.json.participants) && typeof r.json.total === "number", r.text);
    check("L1 three participants", r.json?.participants?.length === 3, r.text);
    check("L1 total 980", r.json?.total === 980, String(r.json?.total));
    const andrii = r.json?.participants?.find((p) => p.id === S_ANDRII);
    check("L1 participant fields id/type/name/items/total/isSubmitted",
      andrii && andrii.type === "Guest" && andrii.name === "Andrii" && andrii.total === 360 && andrii.isSubmitted === true
      && andrii.items?.[0]?.quantity === 2 && andrii.items?.[0]?.dish?.id === D1 && andrii.items?.[0]?.dish?.price === 180, r.text);
    const olena = r.json?.participants?.find((p) => p.id === S_OLENA);
    check("L1 unsubmitted participant has isSubmitted=false", olena && olena.isSubmitted === false && olena.total === 220, r.text);

    r = await call("GET", `/guest/groups/${G1}/sessions`, undefined, undefined);
    check("L1 401 without token", r.status === 401, String(r.status));
    r = await call("GET", `/guest/groups/${G1}/sessions`, undefined, strangerToken);
    check("L1 403 for non-owner", r.status === 403, r.status + " " + r.text);
    r = await call("GET", `/guest/groups/no-such-group/sessions`, undefined, ownerToken);
    check("L1 404 for unknown group", r.status === 404, r.status + " " + r.text);

    // ================= LEVEL 2: owner session id
    console.log("\n--- Level 2: GET guest-session-id");
    r = await call("GET", `/reservations/${R1}/guest-session-id`, undefined, ownerToken);
    check("L2 200 returns guestSessionId", r.status === 200 && typeof r.json?.guestSessionId === "string", r.status + " " + r.text);
    const ownerSessionId = r.json?.guestSessionId;
    r = await call("GET", `/reservations/${R1}/guest-session-id`, undefined, ownerToken);
    check("L2 same id on repeated call (idempotent)", r.status === 200 && r.json?.guestSessionId === ownerSessionId, r.text);
    r = await call("GET", `/reservations/${R1}/guest-session-id`, undefined, strangerToken);
    check("L2 403 for non-owner", r.status === 403, r.status + " " + r.text);
    r = await call("GET", `/reservations/no-such-res/guest-session-id`, undefined, ownerToken);
    check("L2 404 for unknown reservation", r.status === 404, r.status + " " + r.text);
    if (ownerSessionId) created.push(["GuestSessions", { guestSessionId: ownerSessionId }]);

    r = await call("GET", `/guest/groups/${G1}/sessions`, undefined, ownerToken);
    const ownerP = r.json?.participants?.find((p) => p.id === ownerSessionId);
    check("L2 owner session appears in list with type Owner", ownerP && ownerP.type === "Owner", r.text);
    check("L2 owner session does not change total", r.json?.total === 980, String(r.json?.total));

    r = await call("GET", `/guest/groups/${G1}/status`, undefined, undefined);
    check("owner session is not counted as a guest (3 guests + owner = 4)", r.status === 200 && r.json?.currentParticipants === 4, r.text);

    // ================= LEVEL 3: DELETE
    console.log("\n--- Level 3: DELETE guest session");
    r = await call("DELETE", `/guest/groups/${G1}/sessions/${S_OLENA}`, undefined, strangerToken);
    check("L3 403 for non-owner", r.status === 403, r.status + " " + r.text);
    r = await call("DELETE", `/guest/groups/${G1}/sessions/no-such-session`, undefined, ownerToken);
    check("L3 404 for unknown session", r.status === 404, r.status + " " + r.text);
    r = await call("DELETE", `/guest/groups/${G1}/sessions/${S_OTHER}`, undefined, ownerToken);
    check("L3 400 for session of another group", r.status === 400, r.status + " " + r.text);
    r = await call("DELETE", `/guest/groups/no-such-group/sessions/${S_OLENA}`, undefined, ownerToken);
    check("L3 404 for unknown group", r.status === 404, r.status + " " + r.text);
    r = await call("DELETE", `/guest/groups/${G1}/sessions/${S_OLENA}`, undefined, ownerToken);
    check("L3 200 with updated snapshot (camelCase, no deleted guest)",
      r.status === 200 && Array.isArray(r.json?.participants) && !r.json.participants.some((p) => p.id === S_OLENA), r.status + " " + r.text);
    check("L3 new total 760", r.json?.total === 760, String(r.json?.total));

    // ================= LEVEL 2: POST submit
    console.log("\n--- Level 2: POST submit");
    put("GuestSessions", session("e2e-s-petro", G1, "Petro", false, [[D9, 5]]), { guestSessionId: "e2e-s-petro" });

    r = await call("POST", `/group-reservations/${G1}/submit`, { reservationId: R1 }, strangerToken);
    check("L2 submit 403 for non-owner", r.status === 403, r.status + " " + r.text);
    r = await call("POST", `/group-reservations/no-such-group/submit`, { reservationId: R1 }, ownerToken);
    check("L2 submit 404 unknown group", r.status === 404, r.status + " " + r.text);
    r = await call("POST", `/group-reservations/${G1}/submit`, { reservationId: "no-such-res" }, ownerToken);
    check("L2 submit 404 unknown reservation", r.status === 404, r.status + " " + r.text);
    r = await call("POST", `/group-reservations/${G1}/submit`, {}, ownerToken);
    check("L2 submit 400 without reservationId", r.status === 400, r.status + " " + r.text);
    r = await call("POST", `/group-reservations/${G1}/submit`, { reservationId: R1 }, undefined);
    check("L2 submit 401 without token", r.status === 401, String(r.status));
    r = await call("POST", `/group-reservations/${G1}/submit`, { reservationId: R1 }, ownerToken);
    check("L2 submit 400 when order not found", r.status === 400, r.status + " " + r.text);

    // group 2: only an unsubmitted session -> 400; then a submitted session without dishes -> 400
    r = await call("POST", `/group-reservations/${G2}/submit`, { reservationId: R2 }, ownerToken);
    check("L2 submit 400 when no submitted sessions", r.status === 400, r.status + " " + r.text);
    putItem("GuestSessions", session(S_OTHER, G2, "Foreign", true, []));
    r = await call("POST", `/group-reservations/${G2}/submit`, { reservationId: R2 }, ownerToken);
    check("L2 submit 400 when submitted sessions have no dishes", r.status === 400, r.status + " " + r.text);

    // now the order exists -> happy path
    put("Orders", order(O1, R1, ownerSub), { orderId: O1, customerId: ownerSub });
    r = await call("POST", `/group-reservations/${G1}/submit`, { reservationId: R1 }, ownerToken);
    check("L2 submit 200", r.status === 200 && Array.isArray(r.json), r.status + " " + r.text);
    const arr = Array.isArray(r.json) ? r.json : [];
    const d1 = arr.find((x) => x.dishId === D1), d2 = arr.find((x) => x.dishId === D2);
    check("L2 merged by dishId: dish1 = 3, dish2 = 1", d1?.quantity === 3 && d2?.quantity === 1 && r.json.length === 2, r.text);
    check("L2 unsubmitted session dish not included", !r.json?.some((x) => x.dishId === D9), r.text);

    const savedOrder = getItem("Orders", { orderId: O1, customerId: ownerSub });
    const oDishes = (savedOrder?.dishes?.L || []).map((x) => [x.M.dishId.S, Number(x.M.quantity.N)]);
    check("order contains merged dishes", oDishes.length === 2 && oDishes.some(([i, q]) => i === D1 && q === 3) && oDishes.some(([i, q]) => i === D2 && q === 1), JSON.stringify(oDishes));
    check("order status = SubmittedByCustomer (3)", savedOrder?.status?.N === "3", JSON.stringify(savedOrder?.status));
    const savedGroup = getItem("GroupReservations", { groupReservationId: G1 });
    check("group reservation status = Submitted (1)", savedGroup?.status?.N === "1", JSON.stringify(savedGroup?.status));

    r = await call("POST", `/group-reservations/${G1}/submit`, { reservationId: R1 }, ownerToken);
    check("L2 repeated submit rejected (400)", r.status === 400, r.status + " " + r.text);
  } catch (e) {
    console.log("ERROR " + (e.stack || e));
    results.push({ name: "script error", ok: false });
  } finally {
    if (process.env.KEEP) {
      console.log("\n--- KEEP=1: test data and users left in place (run again without KEEP to clean up)");
      console.log("API:            " + API);
      console.log("owner token:    " + ownerToken);
      console.log("stranger token: " + strangerToken);
      const failedKeep = results.filter((x) => !x.ok);
      console.log(`\n==== ${results.length - failedKeep.length}/${results.length} checks passed ====`);
      return;
    }
    console.log("\n--- cleanup");
    try {
      const vals = path.join(TMP, "vals.json");
      fs.writeFileSync(vals, JSON.stringify({ ":p": { S: "e2e-group" } }));
      const scan = aws("dynamodb", "scan", "--table-name", "GuestSessions", "--filter-expression", "begins_with(groupReservationId, :p)",
        "--expression-attribute-values", "file://" + vals.replace(/\\/g, "/"));
      for (const it of scan?.Items || []) created.push(["GuestSessions", { guestSessionId: it.guestSessionId.S }]);
    } catch (e) { console.log("scan failed: " + e.message.split("\n")[0]); }
    const seen = new Set();
    for (const [table, key] of created) {
      const k = table + JSON.stringify(key);
      if (seen.has(k)) continue;
      seen.add(k);
      try { deleteItem(table, key); } catch (e) { console.log("delete failed " + k); }
    }
    try {
      const pools = aws("cognito-idp", "list-user-pools", "--max-results", "10").UserPools;
      for (const p of pools) {
        for (const email of [OWNER_EMAIL, STRANGER_EMAIL]) {
          try { aws("cognito-idp", "admin-delete-user", "--user-pool-id", p.Id, "--username", email); } catch { /* not in this pool */ }
        }
      }
    } catch (e) { console.log("cognito cleanup failed: " + e.message.split("\n")[0]); }
    fs.rmSync(TMP, { recursive: true, force: true });

    const failed = results.filter((x) => !x.ok);
    console.log(`\n==== ${results.length - failed.length}/${results.length} checks passed ====`);
    if (failed.length) { console.log("FAILED:\n  " + failed.map((x) => x.name).join("\n  ")); process.exitCode = 1; }
  }
})();
