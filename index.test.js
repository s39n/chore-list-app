import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchActiveChores, renderChores, completeChore, KIDS, API_URL, API_TOKEN } from './index.js';

// Mock fetch
global.fetch = vi.fn();

describe('Chore List tests', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        // Setup DOM
        document.body.innerHTML = '<div id="chore-board"></div>';
    });

    describe('renderChores', () => {
        it('should render "All done" when no chores are assigned to a kid', () => {
            renderChores([]);
            
            const container = document.getElementById('chore-board');
            expect(container.innerHTML).toContain('All done for today! 🎉');
            // Check that all kids sections are created
            Object.values(KIDS).forEach(name => {
                expect(container.innerHTML).toContain(`<h2>${name}'s Chores</h2>`);
            });
        });

        it('should render chores correctly for specific kids', () => {
            const mockChores = [
                { id: 101, title: 'Clean Room', assigned_to: 3 },
                { id: 102, title: 'Wash Dishes', assigned_to: 5 }
            ];

            renderChores(mockChores);

            const container = document.getElementById('chore-board');
            expect(container.innerHTML).toContain('Clean Room');
            expect(container.innerHTML).toContain('Wash Dishes');
            expect(container.querySelector('#chore-101')).not.toBeNull();
            expect(container.querySelector('#chore-102')).not.toBeNull();
        });
    });

    describe('fetchActiveChores', () => {
        it('should fetch, filter and render chores due today (local time)', async () => {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            
            const mockTasks = [
                { id: 1, title: 'Today Task', assigned_to: 3, status: 'pending', due_date: `${today}T10:00:00Z` },
                { id: 2, title: 'Future Task', assigned_to: 3, status: 'pending', due_date: '2099-01-01T10:00:00Z' },
                { id: 3, title: 'Completed Task', assigned_to: 3, status: 'done', due_date: `${today}T10:00:00Z` },
                { id: 4, title: 'Other Kid Task', assigned_to: 99, status: 'pending', due_date: `${today}T10:00:00Z` }
            ];

            global.fetch.mockResolvedValueOnce({
                json: async () => ({ data: mockTasks })
            });

            await fetchActiveChores();

            expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/tasks`, expect.objectContaining({
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }));

            const container = document.getElementById('chore-board');
            expect(container.innerHTML).toContain('Today Task');
            expect(container.innerHTML).not.toContain('Future Task');
            expect(container.innerHTML).not.toContain('Completed Task');
            expect(container.innerHTML).not.toContain('Other Kid Task');
        });

        it('should handle fetch errors gracefully', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            global.fetch.mockRejectedValueOnce(new Error('Network error'));

            await fetchActiveChores();

            expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch chores:', expect.any(Error));
        });
    });

    describe('completeChore', () => {
        it('should send PATCH request and remove element on success', async () => {
            const choreId = 123;
            document.body.innerHTML = `
                <div id="chore-board">
                    <div id="chore-${choreId}">
                        <span>Test Chore</span>
                        <button>Done!</button>
                    </div>
                </div>
            `;

            global.fetch.mockResolvedValueOnce({
                ok: true
            }).mockResolvedValueOnce({ // for the subsequent fetchActiveChores call
                json: async () => ({ data: [] })
            });

            await completeChore(choreId);

            expect(global.fetch).toHaveBeenCalledWith(`${API_URL}/tasks/${choreId}/status`, expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify({ status: 'done' })
            }));

            expect(document.getElementById(`chore-${choreId}`)).toBeNull();
        });

        it('should log error on failed PATCH', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            global.fetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Internal Server Error'
            });

            await completeChore(456);

            expect(consoleSpy).toHaveBeenCalledWith('Failed to complete chore:', 'Internal Server Error');
        });
    });
});
