// Pure points/banking logic, shared by server.js and covered by points.test.js.
// No I/O here — callers load/save the store; these functions just compute.

export function defaultStore() {
    return {
        defaultPoints: 10,     // points for a chore with no custom value
        pointValues: {},       // { "<chore title>": number }
        balances: {},          // { "<kidId>": number }  redeemable banked points
        approvals: [],         // { weekStart, kidId, points, approvedAt }
        redemptions: [],       // { kidId, amount, note, at }
    };
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
    store.balances[id] = (store.balances[id] || 0) - amt;
    store.redemptions.push({ kidId: id, amount: amt, note: String(note || ""), at: new Date().toISOString() });
    return store;
}
