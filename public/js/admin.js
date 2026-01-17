// Basic Toast Implementation (Copied from app.js logic or simplified)
const Toast = {
    show: (msg, type = 'info') => {
        const div = document.createElement('div');
        div.className = 'toast show';
        div.style.backgroundColor = type === 'error' ? '#ff4444' : '#00cc66';
        div.style.color = 'white';
        div.style.padding = '12px 24px';
        div.style.borderRadius = '8px';
        div.style.position = 'fixed';
        div.style.bottom = '20px';
        div.style.right = '20px';
        div.style.zIndex = '9999';
        div.innerText = msg;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }
};

let currentPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    // Tab Switching
    const tabs = document.querySelectorAll('.nav-item[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetView = tab.dataset.tab;
            document.querySelectorAll('.view-section').forEach(view => {
                view.classList.remove('active');
            });
            document.getElementById(`${targetView}-view`).classList.add('active');
        });
    });

    // Pagination
    document.getElementById('prevPage').onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadUsers(currentPage);
        }
    };
    document.getElementById('nextPage').onclick = () => {
        currentPage++;
        loadUsers(currentPage);
    };

    // Initialize
    loadStats();
    loadUsers();
});

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        if (res.status === 403) {
            alert("Access Denied");
            window.location.href = '/';
            return;
        }
        const data = await res.json();

        document.getElementById('statsUsers').innerText = data.stats.users;
        document.getElementById('statsMsg').innerText = data.stats.messages;
        document.getElementById('statsChannels').innerText = data.stats.channels;

        // Render Recent Users
        const table = document.getElementById('recentUsersTable');
        table.innerHTML = data.recentUsers.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            </tr>
        `).join('');

    } catch (err) {
        console.error(err);
        Toast.show("Failed to load stats", 'error');
    }
}

async function loadUsers(page = 1) {
    try {
        const res = await fetch(`/api/admin/users?page=${page}`);
        const data = await res.json();

        const table = document.getElementById('allUsersTable');
        table.innerHTML = data.users.map(u => `
            <tr>
                <td><img src="${u.avatar}" style="width:30px;height:30px;border-radius:50%"></td>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>
                    <button class="btn-ban" onclick="toggleBan('${u._id}')">
                        ${u.isBanned ? 'Unban' : 'Ban'}
                    </button>
                </td>
            </tr>
        `).join('');

        // Pagination UI
        document.getElementById('pageInfo').innerText = `Page ${data.currentPage} of ${data.totalPages}`;
        document.getElementById('prevPage').disabled = data.currentPage <= 1;
        document.getElementById('nextPage').disabled = data.currentPage >= data.totalPages;

    } catch (err) {
        console.error(err);
        Toast.show("Failed to load users", 'error');
    }
}

async function toggleBan(userId) {
    if (!confirm("Are you sure?")) return;
    try {
        const res = await fetch(`/api/admin/users/${userId}/ban`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            Toast.show("User status updated");
            loadUsers(currentPage);
        }
    } catch (err) {
        Toast.show("Action failed", 'error');
    }
}
