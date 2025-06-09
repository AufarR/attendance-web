// Common utility functions for API calls, authentication, etc.

async function fetchApi(path, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };
    
    // Cookies are sent automatically by the browser, so no need to set Authorization header manually for cookie-based auth.

    options.headers = { ...defaultHeaders, ...options.headers };

    try {
        const response = await fetch(`/api${path}`, options);
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: response.statusText };
            }
            console.error('API Error:', response.status, errorData);
            alert(`Error: ${errorData.message || 'An unknown error occurred.'}`);
            if (response.status === 401) { // Unauthorized
                // Potentially redirect to login if not already on login page
                if (!window.location.pathname.endsWith('login.html')) {
                     // window.location.href = 'login.html';
                }
            }
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        if (response.headers.get("content-type")?.includes("application/json")) {
            return response.json();
        }
        return response.text(); // Or handle other content types as needed
    } catch (error) {
        console.error('Fetch API failed:', error);
        // alert('Failed to communicate with the server. Please try again later.');
        throw error;
    }
}

function logout() {
    fetchApi('/logout', { method: 'POST' })
        .then(() => {
            alert('Logged out successfully.');
            window.location.href = 'login.html';
        })
        .catch(error => {
            console.error('Logout failed:', error);
            // Still redirect, as session might be invalid on server anyway
            window.location.href = 'login.html';
        });
}

// Add logout listener if logoutButton exists
document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
});

// Helper to get user info from a conceptual 'session' or redirect if not found.
// For cookie-based auth, the server will handle unauthorized access.
// This function can be used to check if user is on the right page based on role if needed,
// or to fetch user-specific data after page load.
async function checkUserSession() {
    try {
        // This endpoint would return basic user info if authenticated
        const user = await fetchApi('/auth/me'); 
        return user;
    } catch (error) {
        // If not on login page, redirect
        if (!window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('/')) {
            // window.location.href = 'login.html';
        }
        return null;
    }
}

// This function can be used to check if user is on the right page based on role if needed,
// or to fetch user-specific data after page load.
async function checkUserSessionAndRole(expectedRole) {
    try {
        const user = await fetchApi('/auth/me'); 
        window.currentUser = user; // Store user data globally

        if (!user || !user.userId) {
            // Not authenticated or user data is incomplete
            if (!window.location.pathname.endsWith('login.html') && window.location.pathname !== '/') {
                alert('Session expired or invalid. Please log in.');
                window.location.href = 'login.html';
            }
            return null;
        }

        // If the expected role is 'attendee', allow both 'attendee' and 'host' roles.
        // For other expected roles (e.g., 'host'), require an exact match.
        if (expectedRole === 'attendee') {
            if (user.role !== 'attendee' && user.role !== 'host') {
                alert('Unauthenticated');
                // Redirect to login as a fallback, or a more appropriate page if one exists
                window.location.href = 'login.html';
                return null;
            }
        } else if (expectedRole && user.role !== expectedRole) {
            // Original logic for exact role match for other pages (e.g. host page)
            alert('Unauthenticated'); // Changed alert message
            // Redirect to an appropriate page, or login if no other page makes sense
            if (user.role === 'host') {
                window.location.href = 'host.html';
            } else if (user.role === 'attendee') {
                window.location.href = 'attendee.html';
            } else {
                window.location.href = 'login.html'; // Fallback
            }
            return null; // Or throw an error
        }
        
        // Store user globally if needed, or return it for the caller to use
        window.currentUser = user; 
        console.log('Current user:', window.currentUser);
        return user;
    } catch (error) {
        // If fetchApi itself throws (e.g., 401), it might have already tried to redirect or alert.
        // If we are not on login page, and the error is likely an auth error, redirect.
        if (!window.location.pathname.endsWith('login.html') && window.location.pathname !== '/') {
            // Check if the error message indicates an auth issue, or if status was 401 (handled by fetchApi)
            // For simplicity, if /auth/me fails and we are not on login, assume auth issue.
            alert('Could not verify session. Please log in.');
            window.location.href = 'login.html';
        }
        return null;
    }
}

// Expose to global scope if needed by other scripts directly, or ensure scripts are modules
window.checkUserSessionAndRole = checkUserSessionAndRole;
window.fetchApi = fetchApi; // Ensure fetchApi is also available if not already
