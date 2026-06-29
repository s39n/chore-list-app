import { describe, it, expect } from 'vitest';
import { defaultStore, pointValueFor, weeklyPoints, approveWeek, redeemPoints } from './points.js';

describe('pointValueFor', () => {
    it('uses a custom value when one is set', () => {
        const store = { ...defaultStore(), pointValues: { 'Mow lawn': 20 } };
        expect(pointValueFor(store, 'Mow lawn')).toBe(20);
    });

    it('falls back to the default for unlisted chores', () => {
        const store = { ...defaultStore(), defaultPoints: 10 };
        expect(pointValueFor(store, 'Anything')).toBe(10);
    });

    it('respects an explicit zero value', () => {
        const store = { ...defaultStore(), pointValues: { 'Freebie': 0 } };
        expect(pointValueFor(store, 'Freebie')).toBe(0);
    });
});

describe('weeklyPoints', () => {
    const weekStart = new Date('2026-06-29T00:00:00');
    const store = { ...defaultStore(), defaultPoints: 10, pointValues: { 'Dishes': 5, 'Mow lawn': 20 } };

    it('sums point values of a kid\'s done chores since the week start', () => {
        const tasks = [
            { assigned_to: 2, status: 'done', title: 'Dishes',   updated_at: '2026-06-30T08:00:00' },
            { assigned_to: 2, status: 'done', title: 'Mow lawn', updated_at: '2026-06-30T09:00:00' },
            { assigned_to: 2, status: 'done', title: 'Tidy up',  updated_at: '2026-07-01T09:00:00' }, // default 10
        ];
        expect(weeklyPoints(store, tasks, 2, weekStart)).toBe(35);
    });

    it('ignores not-done, prior-week, and other kids\' tasks', () => {
        const tasks = [
            { assigned_to: 2, status: 'pending', title: 'Dishes',   updated_at: '2026-06-30T08:00:00' },
            { assigned_to: 2, status: 'done',    title: 'Dishes',   updated_at: '2026-06-20T08:00:00' }, // before week
            { assigned_to: 3, status: 'done',    title: 'Mow lawn', updated_at: '2026-06-30T08:00:00' }, // other kid
        ];
        expect(weeklyPoints(store, tasks, 2, weekStart)).toBe(0);
    });
});

describe('approveWeek', () => {
    it('banks the approved points for a kid', () => {
        const store = defaultStore();
        approveWeek(store, 2, '2026-06-29', 45);
        expect(store.balances['2']).toBe(45);
        expect(store.approvals).toHaveLength(1);
    });

    it('adjusts by the delta when the same week is re-approved (no double count)', () => {
        const store = defaultStore();
        approveWeek(store, 2, '2026-06-29', 45);
        approveWeek(store, 2, '2026-06-29', 40);
        expect(store.balances['2']).toBe(40);
        expect(store.approvals).toHaveLength(1);
    });

    it('keeps separate weeks additive', () => {
        const store = defaultStore();
        approveWeek(store, 2, '2026-06-22', 30);
        approveWeek(store, 2, '2026-06-29', 45);
        expect(store.balances['2']).toBe(75);
        expect(store.approvals).toHaveLength(2);
    });
});

describe('redeemPoints', () => {
    it('subtracts the redeemed amount and logs it', () => {
        const store = defaultStore();
        approveWeek(store, 2, '2026-06-29', 50);
        redeemPoints(store, 2, 15, 'screen time');
        expect(store.balances['2']).toBe(35);
        expect(store.redemptions).toHaveLength(1);
        expect(store.redemptions[0].note).toBe('screen time');
    });
});
