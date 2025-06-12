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
    // const logoutButton = document.getElementById('logoutButton'); // Old ID
    const logoutButton = document.getElementById('logout-btn'); // New ID for menu bar logout
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

// CSV Export Utilities
function escapeCSVField(field) {
    if (field === null || typeof field === 'undefined') {
        return '';
    }
    let stringField = String(field);
    // If the field contains a comma, newline, or double quote, enclose it in double quotes.
    if (stringField.includes(',') || stringField.includes('\\n') || stringField.includes('"')) {
        // Escape existing double quotes by doubling them
        stringField = stringField.replace(/"/g, '""');
        stringField = `"${stringField}"`;
    }
    return stringField;
}

function downloadCSV(csvContent, fileName) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) { // Feature detection
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        alert('CSV download is not supported by your browser.');
    }
}

function convertMeetingDataToCSV(meetingData) {
    if (!meetingData) {
        console.error('No meeting data provided for CSV conversion.');
        return '';
    }

    const headers = [
        'Meeting ID', 'Meeting Description', 'Room Name', 'Start Time', 'End Time',
        'Attendee Name', 'Attendee Email', 'Attendance Status', 'Signature Provided'
    ];
    let csvRows = [headers.map(escapeCSVField).join(',')];

    const meetingStartTime = new Date(meetingData.start_time).toLocaleString();
    const meetingEndTime = new Date(meetingData.end_time).toLocaleString();

    if (meetingData.attendees && meetingData.attendees.length > 0) {
        meetingData.attendees.forEach(attendee => {
            const now = new Date();
            const meetingEndDate = new Date(meetingData.end_time);
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
            
            let displayStatus = attendee.status || 'pending';
            if (meetingEndDate < fiveMinutesAgo && displayStatus === 'pending') {
                displayStatus = 'absent';
            }

            const signatureProvided = attendee.signed_presence ? 'Yes' : 'No';

            const row = [
                meetingData.id,
                meetingData.description, // Added meeting description
                meetingData.room_name,
                meetingStartTime,
                meetingEndTime,
                attendee.name,
                attendee.email,
                displayStatus,
                signatureProvided
            ];
            csvRows.push(row.map(escapeCSVField).join(','));
        });
    } else {
        // Add a row indicating no attendees if that's the case, still including meeting details
        const row = [
            meetingData.id,
            meetingData.description, // Added meeting description
            meetingData.room_name,
            meetingStartTime,
            meetingEndTime,
            '(No attendees assigned)', '', '', ''
        ];
        csvRows.push(row.map(escapeCSVField).join(','));
    }

    return csvRows.join('\n');
}

// Expose CSV functions to global scope if they need to be called from other scripts directly
window.escapeCSVField = escapeCSVField;
window.downloadCSV = downloadCSV;
window.convertMeetingDataToCSV = convertMeetingDataToCSV;
