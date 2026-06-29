export const API_URL = "/api/v1";
export const API_TOKEN = "oikos_rUikei0NSSZt-S2zzI5KFPO6cMPADFN8UCYb_VawtJo";

// Oikos family member IDs → names
export const KIDS = {
    2: "Evelyn",
    3: "Amelia",
    5: "Eli"
};

export async function fetchActiveChores() {
    try {
        const response = await fetch(`${API_URL}/tasks`, {
            headers: {
                "Authorization": `Bearer ${API_TOKEN}`,
                "Content-Type": "application/json"
            }
        });
        
        const { data: tasks } = await response.json();
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Include tasks due today OR recurring tasks with no due date (they're always daily)
        const activeKidsChores = tasks.filter(task =>
            Object.keys(KIDS).includes(String(task.assigned_to)) &&
            task.status !== "done" &&
            task.status !== "archived" &&
            (task.due_date ? task.due_date.startsWith(today) : task.is_recurring)
        );

        renderChores(activeKidsChores);
    } catch (error) {
        console.error("Failed to fetch chores:", error);
    }
}

export async function completeChore(id) {
    try {
        const response = await fetch(`${API_URL}/tasks/${id}/status`, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${API_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: "done" })
        });

        if (response.ok) {
            // Remove the chore card immediately for better UX
            const element = document.getElementById(`chore-${id}`);
            if (element) element.remove();
            
            // Refresh the list to ensure everything is in sync
            await fetchActiveChores();
        } else {
            console.error("Failed to complete chore:", response.statusText);
        }
    } catch (error) {
        console.error("Error completing chore:", error);
    }
}

export function renderChores(chores) {
    const container = document.getElementById("chore-board");
    container.innerHTML = ""; 
    
    // Create a section for each kid
    Object.entries(KIDS).forEach(([id, name]) => {
        const kidSection = document.createElement("div");
        kidSection.className = "kid-column";
        kidSection.innerHTML = `<h2>${name}'s Chores</h2>`;
        
        const theirChores = chores.filter(chore => String(chore.assigned_to) === id);
        
        if (theirChores.length === 0) {
            kidSection.innerHTML += `<p>All done for today! 🎉</p>`;
        } else {
            theirChores.forEach(chore => {
                kidSection.innerHTML += `
                    <div class="chore-card" id="chore-${chore.id}">
                        <span>${chore.title}</span>
                        <button onclick="completeChore(${chore.id})">Done! ✅</button>
                    </div>
                `;
            });
        }
        
        container.appendChild(kidSection);
    });
}