document.addEventListener('DOMContentLoaded', () => {
    const dbSelect = document.getElementById('db-select');
    const connectBtn = document.getElementById('connect-btn');
    const statusMsg = document.getElementById('status-message');

    // Fetch databases from API
    async function fetchDatabases() {
        try {
            const response = await fetch('/api/databases');
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to fetch databases');
            }

            const databases = await response.json();

            dbSelect.innerHTML = '<option value="">Choose a database...</option>';
            databases.forEach(db => {
                const option = document.createElement('option');
                option.value = db.name;
                option.textContent = db.name;
                dbSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error:', error);
            statusMsg.textContent = 'Error: ' + error.message;
            statusMsg.className = 'status-message error';
            dbSelect.innerHTML = '<option value="">Error loading databases</option>';
        }
    }

    connectBtn.addEventListener('click', () => {
        const selectedDb = dbSelect.value;
        if (!selectedDb) {
            statusMsg.textContent = 'Please select a database first.';
            statusMsg.className = 'status-message error';
            return;
        }

        statusMsg.textContent = `Successfully connected to ${selectedDb}!`;
        statusMsg.className = 'status-message success';

        // Store for dashboard
        sessionStorage.setItem('selectedDb', selectedDb);

        // Redirect after a short delay
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 800);
    });

    fetchDatabases();
});
