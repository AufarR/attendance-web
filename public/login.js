document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const data = await fetchApi('/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password }),
                });

                alert(data.message);

                if (data.role === 'host') {
                    window.location.href = 'host.html';
                } else if (data.role === 'attendee') {
                    window.location.href = 'attendee.html';
                } else {
                    alert('Unknown role or login issue.');
                }

            } catch (error) {
                console.error('Login attempt failed:', error);
            }
        });
    }
});
