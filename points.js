// Pure points/banking logic, shared by server.js and covered by points.test.js.
// No I/O here — callers load/save the store; these functions just compute.

export function defaultStore() {
    return {
        defaultPoints: 10,     // points for a chore with no custom value
        pointValues: {},       // { "<chore title>": number }
        balances: {},          // { "<kidId>": number }  redeemable banked points
        approvals: [],         // { weekStart, kidId, points, approvedAt }
        redemptions: [],       // { kidId, amount, note, at }
        completions: [],       // { kidId, taskId, title, points, at } — one per "Done" tap
        adjustments: [],       // { kidId, points(±), target, note, at } — manual bonus/penalty
    };
}

// Record a single chore completion (one row per "Done" tap, so repeats count).
// Points are snapshotted at tap time from the chore's current value. Returns the row.
export function logCompletion(store, kidId, taskId, title, points) {
    if (!store.completions) store.completions = [];
    const pts = Number.isFinite(Number(points)) ? Number(points) : pointValueFor(store, title);
    const rec = {
        kidId: String(kidId),
        taskId: taskId,
        title: String(title || ""),
        points: pts,
        at: new Date().toISOString(),
    };
    store.completions.push(rec);
    return rec;
}

// Undo: remove the most recent completion for this kid + task. Returns the
// removed row, or null if there was nothing to undo.
export function unlogCompletion(store, kidId, taskId) {
    if (!store.completions) { store.completions = []; return null; }
    const kid = String(kidId);
    for (let i = store.completions.length - 1; i >= 0; i--) {
        const c = store.completions[i];
        if (c.kidId === kid && String(c.taskId) === String(taskId)) {
            return store.completions.splice(i, 1)[0];
        }
    }
    return null;
}

// Points a single chore is worth, falling back to the store default.
export function pointValueFor(store, title) {
    if (store.pointValues && Object.prototype.hasOwnProperty.call(store.pointValues, title)) {
        return store.pointValues[title];
    }
    return store.defaultPoints;
}

// Sum of points a kid has earned from chores marked done since weekStart.
export function weeklyPoints(store, tasks, kidId, weekStart) {
    const id = Number(kidId);
    return tasks
        .filter(t =>
            t.assigned_to === id &&
            t.status === "done" &&
            t.updated_at && new Date(t.updated_at) >= weekStart)
        .reduce((sum, t) => sum + pointValueFor(store, t.title), 0);
}

// Bank a kid's approved weekly total. Re-approving the same week adjusts by the
// delta so balances never double-count. Mutates and returns the store.
export function approveWeek(store, kidId, weekStart, points) {
    const id = String(kidId);
    const wk = String(weekStart);
    const pts = Number(points);
    const prev = store.approvals.find(a => a.kidId === id && a.weekStart === wk);
    if (prev) {
        store.balances[id] = (store.balances[id] || 0) + (pts - prev.points);
        prev.points = pts;
        prev.approvedAt = new Date().toISOString();
    } else {
        store.balances[id] = (store.balances[id] || 0) + pts;
        store.approvals.push({ kidId: id, weekStart: wk, points: pts, approvedAt: new Date().toISOString() });
    }
    return store;
}

// Subtract a redemption from a kid's banked balance. Mutates and returns the store.
export function redeemPoints(store, kidId, amount, note) {
    const id = String(kidId);
    const amt = Number(amount);
    if (!store.redemptions) store.redemptions = [];
    store.balances[id] = (store.balances[id] || 0) - amt;
    store.redemptions.push({
        id: "r" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        kidId: id, amount: amt, note: String(note || ""), at: new Date().toISOString()
    });
    return store;
}

// ---- Running "unbanked / banked" points model -------------------------------
// Banked = current balance. Unbanked = earned but not yet approved into the bank.
//   totalBanked  = balance + totalRedeemed   (points that have passed through the bank)
//   unbanked     = totalEarned - totalBanked
export function totalEarned(store, kidId) {
    const id = String(kidId);
    return (store.completions || []).filter(c => String(c.kidId) === id)
        .reduce((s, c) => s + (c.points || 0), 0);
}
export function totalRedeemed(store, kidId) {
    const id = String(kidId);
    return (store.redemptions || []).filter(r => String(r.kidId) === id)
        .reduce((s, r) => s + (r.amount || 0), 0);
}
export function totalAdjustments(store, kidId) {
    const id = String(kidId);
    return (store.adjustments || []).filter(a => String(a.kidId) === id)
        .reduce((s, a) => s + (a.points || 0), 0);
}
export function unbankedPoints(store, kidId) {
    const id = String(kidId);
    const balance = (store.balances && store.balances[id]) || 0;
    return totalEarned(store, id) + totalAdjustments(store, id) - balance - totalRedeemed(store, id);
}

// Manual bonus/penalty. target "banked" changes the balance directly (and is
// recorded so unbanked stays put); target "unbanked" only shifts the unbanked
// bucket. Positive adds, negative takes away (e.g. discipline).
export function adjustPoints(store, kidId, points, note, target) {
    const id = String(kidId);
    const amt = Number(points);
    if (!Number.isFinite(amt) || amt === 0) return store;
    if (!store.adjustments) store.adjustments = [];
    const tgt = target === "unbanked" ? "unbanked" : "banked";
    if (tgt === "banked") store.balances[id] = ((store.balances && store.balances[id]) || 0) + amt;
    store.adjustments.push({
        id: "a" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        kidId: id, points: amt, target: tgt, note: String(note || ""), at: new Date().toISOString()
    });
    return store;
}
// Wipe all points data back to zero (balances, approvals, redemptions,
// adjustments, completions) — keeps point values / config. Used to clear out
// test/legacy data and start fresh.
export function resetPoints(store) {
    store.balances = {};
    store.approvals = [];
    store.redemptions = [];
    store.adjustments = [];
    store.completions = [];
    return store;
}
export function deleteAdjustment(store, kidId, aid) {
    const id = String(kidId);
    const arr = store.adjustments || [];
    const i = arr.findIndex(a => String(a.kidId) === id && (a.id === aid || a.at === aid));
    if (i >= 0) {
        if (arr[i].target === "banked") store.balances[id] = ((store.balances && store.balances[id]) || 0) - (arr[i].points || 0);
        arr.splice(i, 1);
    }
    return store;
}
// Move all of a kid's unbanked points into their banked balance.
export function bankUnbanked(store, kidId) {
    const id = String(kidId);
    const amt = unbankedPoints(store, id);
    if (amt > 0) {
        store.balances[id] = ((store.balances && store.balances[id]) || 0) + amt;
        if (!store.approvals) store.approvals = [];
        store.approvals.push({ kidId: id, points: amt, at: new Date().toISOString() });
    }
    return store;
}
// Delete a redemption (refunds its amount back to the balance).
export function deleteRedemption(store, kidId, rid) {
    const id = String(kidId);
    const arr = store.redemptions || [];
    const i = arr.findIndex(r => String(r.kidId) === id && (r.id === rid || r.at === rid));
    if (i >= 0) {
        store.balances[id] = ((store.balances && store.balances[id]) || 0) + (arr[i].amount || 0);
        arr.splice(i, 1);
    }
    return store;
}
// Edit a redemption's amount/note (adjusts balance by the difference).
export function editRedemption(store, kidId, rid, amount, note) {
    const id = String(kidId);
    const r = (store.redemptions || []).find(x => String(x.kidId) === id && (x.id === rid || x.at === rid));
    if (r) {
        const na = Number(amount);
        if (Number.isFinite(na)) {
            store.balances[id] = ((store.balances && store.balances[id]) || 0) + ((r.amount || 0) - na);
            r.amount = na;
        }
        if (note != null) r.note = String(note);
    }
    return store;
}
