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

                alert(data.message); // "Login successful"

                // Server will set HTTP-only cookie.
                // Redirection based on role.
                if (data.role === 'host') {
                    window.location.href = 'host.html';
                } else if (data.role === 'attendee') {
                    window.location.href = 'attendee.html';
                } else {
                    // Fallback or error
                    alert('Unknown role or login issue.');
                }

            } catch (error) {
                // Error is already alerted by fetchApi, but you can add more specific handling if needed
                console.error('Login attempt failed:', error);
            }
        });
    }
});
