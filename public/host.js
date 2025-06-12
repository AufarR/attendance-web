document.addEventListener('DOMContentLoaded', async () => {
    // window.currentUser should be populated by checkUserSessionAndRole
    await checkUserSessionAndRole('host'); 
    
    if (!window.currentUser || window.currentUser.role !== 'host') {
        // checkUserSessionAndRole already handles redirection if user is not a host or not logged in.
        // This is an additional safeguard or if checkUserSessionAndRole's behavior changes.
        console.error("User is not a host or not logged in. Redirection should be handled by checkUserSessionAndRole.");
        return; 
    }

    const hostNameSpan = document.getElementById('host-name');
    if (hostNameSpan && window.currentUser && window.currentUser.name) { // check name exists
        hostNameSpan.textContent = window.currentUser.name;
    }

    loadHostMeetings();
    populateUserAndRoomDropdowns();

    const createMeetingForm = document.getElementById('create-meeting-form'); 
    if (createMeetingForm) {
        createMeetingForm.addEventListener('submit', handleCreateMeeting);

        // Store form title element and original text
        formTitleElement = document.getElementById('form-title'); // Assuming you have <h3 id="form-title">Create New Meeting</h3> or similar
        if (formTitleElement) {
            originalFormTitleText = formTitleElement.textContent;
        }

        const submitButton = createMeetingForm.querySelector('button[type="submit"]');
        if (submitButton) {
            originalSubmitButtonText = submitButton.textContent;
        }

        let cancelEditButton = document.getElementById('cancel-edit-btn');
        if (!cancelEditButton) {
            cancelEditButton = document.createElement('button');
            cancelEditButton.type = 'button';
            cancelEditButton.id = 'cancel-edit-btn';
            cancelEditButton.textContent = 'Cancel Edit';
            cancelEditButton.style.display = 'none'; // Initially hidden
            cancelEditButton.style.marginLeft = '10px'; // Add some space

            if (submitButton && submitButton.parentNode) {
                submitButton.parentNode.insertBefore(cancelEditButton, submitButton.nextSibling);
            } else {
                createMeetingForm.appendChild(cancelEditButton); // Fallback
            }
        }
        cancelEditButton.addEventListener('click', cancelEditMode);
    }
});

// Global variable to store current user ID - this should be fetched securely
// For now, we assume the backend uses cookies and user context is on the server.
// We might need an endpoint to get the current user's ID if forms need it directly
// and it's not easily derivable. For creating meetings, host_id will be set by backend.

let allUsers = []; // To store users for attendee selection
let allRooms = []; // To store rooms for selection
let editingMeetingId = null; // To track the meeting ID being edited
let originalSubmitButtonText = ''; // To store the original text of the submit button
let formTitleElement = null; // To store the reference to the form title element
let originalFormTitleText = ''; // To store the original text of the form title
let hostMeetingsData = []; // To store fetched meetings for CSV export and other potential uses

// Helper function to format a Date object to YYYY-MM-DDTHH:MM string in local time
function toLocalISOStringShort(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function populateUserAndRoomDropdowns() {
    try {
        allUsers = await fetchApi('/users');
        allRooms = await fetchApi('/rooms');

        const roomSelect = document.getElementById('room-select');
        const attendeesSelect = document.getElementById('attendees-select');

        if (roomSelect) {
            roomSelect.innerHTML = ''; // Clear existing options before repopulating
            allRooms.forEach(room => {
                const option = document.createElement('option');
                option.value = room.id;
                option.textContent = `${room.name} (${room.description || 'No description'})`;
                roomSelect.appendChild(option);
            });
        }

        if (attendeesSelect) {
            attendeesSelect.innerHTML = ''; // Clear existing options before repopulating
            // allUsers.filter(user => user.role === 'attendee').forEach(user => { // Old filter
            allUsers.forEach(user => { // No filter, include all users (hosts and attendees)
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.name} (${user.email})`;
                attendeesSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Failed to populate dropdowns:", error);
        alert("Could not load users and rooms for the form.");
    }
}


async function handleCreateMeeting(event) {
    event.preventDefault();
    const form = event.target;
    const roomId = document.getElementById('room-select').value;
    const startTimeString = document.getElementById('start-time').value;
    const endTimeString = document.getElementById('end-time').value;
    const description = document.getElementById('meeting-description').value;
    
    const attendeesSelect = document.getElementById('attendees-select');
    const selectedAttendees = Array.from(attendeesSelect.selectedOptions).map(option => option.value);

    if (!roomId || !startTimeString || !endTimeString || !description) { // Added !description check for client-side validation
        alert('Please fill in all meeting details, including the description.');
        return;
    }

    const startTime = new Date(startTimeString);
    const endTime = new Date(endTimeString);
    const now = new Date();

    // Client-side datetime sanity checks
    if (!editingMeetingId) { // Only check for past start time on new meetings
        const nowFlooredToMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
        if (startTime < nowFlooredToMinute) {
            alert('Start time cannot be in the past (allowing for current minute).');
            return;
        }
    }
    if (endTime <= startTime) {
        alert('End time must be after start time.');
        return;
    }
    
    const meetingData = {
        room_id: parseInt(roomId),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        attendees: selectedAttendees.map(id => parseInt(id)),
        description: description, // Add description to payload
    };

    let url = '/meetings'; // Changed from '/api/meetings'
    let method = 'POST';

    if (editingMeetingId) {
        url = `/meetings/${editingMeetingId}`; // Changed from '/api/meetings/${editingMeetingId}'
        method = 'PUT';
    }

    try {
        const result = await fetchApi(url, {
            method: method,
            body: JSON.stringify(meetingData),
        });
        alert(result.message || (method === 'PUT' ? 'Meeting updated successfully!' : 'Meeting created successfully!'));
        loadHostMeetings(); 

        if (editingMeetingId) {
            cancelEditMode(); 
        } else {
            form.reset(); 
        }
    } catch (error) {
        console.error(`Failed to ${editingMeetingId ? 'update' : 'create'} meeting:`, error);
        // fetchApi is expected to alert errors.
    }
}

async function loadHostMeetings() {
    const meetingsListDiv = document.getElementById('host-meetings-list');
    if (!meetingsListDiv) return;
    meetingsListDiv.innerHTML = '<p>Loading meetings...</p>';

    try {
        const meetings = await fetchApi('/host/my-meetings');
        hostMeetingsData = meetings; // Store meetings data

        if (meetings.length === 0) {
            meetingsListDiv.innerHTML = '<p>You have not created any meetings yet.</p>';
            return;
        }

        const ul = document.createElement('ul');
        meetings.forEach(meeting => {
            const li = document.createElement('li');
            const meetingTime = new Date(meeting.start_time).toLocaleString();
            const meetingEndTime = new Date(meeting.end_time);
            const now = new Date();
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

            let meetingActions = '';
            // Only show Reschedule and Delete for future or very recent meetings
            if (meetingEndTime > now) {
                meetingActions += `<button onclick="rescheduleMeetingPrompt(${meeting.id})">Reschedule</button> `;
                meetingActions += `<button onclick="deleteMeeting(${meeting.id})">Delete</button> `;
            }
            // Add Export CSV button for all meetings
            meetingActions += `<button class="export-csv-btn" onclick="exportSingleMeetingCSV(${meeting.id})">Export CSV</button>`;

            const roomDisplay = meeting.room_description ? 
                `${escapeHTML(meeting.room_name)} (${escapeHTML(meeting.room_description)})` : 
                escapeHTML(meeting.room_name);

            li.innerHTML = `
                <h4>${meeting.description ? escapeHTML(meeting.description) : `Meeting at ${roomDisplay}`} on ${meetingTime} (ID: ${meeting.id})</h4>
                ${meeting.description ? `<p>Room: ${roomDisplay}</p>` : ''}
                <p>Ends at: ${meetingEndTime.toLocaleString()}</p>
                <div class="meeting-actions">
                    ${meetingActions}
                </div>
                <p>Attendees:</p>
                <ul>
                    ${meeting.attendees.map(att => {
                        let displayStatus = att.status || 'pending';
                        if (meetingEndTime < fiveMinutesAgo && displayStatus === 'pending') {
                            displayStatus = 'absent';
                        }
                        // Add buttons for manual status change
                        let statusButtons = '';
                        if (displayStatus !== 'present') { // Show if pending or absent
                            statusButtons += `<button class="status-btn" onclick="manualSetAttendance(${meeting.id}, ${att.id}, 'present')">Mark Present</button>`;
                        }
                        if (displayStatus !== 'absent') { // Show if pending or present
                            statusButtons += `<button class="status-btn" onclick="manualSetAttendance(${meeting.id}, ${att.id}, 'absent')">Mark Absent</button>`;
                        }

                        return `<li>
                                    ${att.name} (${att.email}) - Status: <strong>${displayStatus}</strong> ${att.signed_presence ? '(Signed)' : ''}
                                    <div class="manual-controls">${statusButtons}</div>
                                </li>`;
                    }).join('')}
                </ul>
            `;
            ul.appendChild(li);
        });
        meetingsListDiv.innerHTML = '';
        meetingsListDiv.appendChild(ul);
    } catch (error) {
        console.error('Failed to load host meetings:', error);
        hostMeetingsData = []; // Clear data on error
        meetingsListDiv.innerHTML = '<p>Error loading meetings. You might be logged out.</p>';
    }
}

async function deleteMeeting(meetingId) {
    if (!confirm('Are you sure you want to delete this meeting? This action cannot be undone.')) {
        return;
    }
    try {
        const result = await fetchApi(`/meetings/${meetingId}`, { method: 'DELETE' });
        alert(result.message);
        loadHostMeetings(); // Refresh
    } catch (error) {
        console.error('Failed to delete meeting:', error);
    }
}

async function rescheduleMeetingPrompt(meetingIdToEdit) {
    try {
        const currentMeeting = await fetchApi(`/meetings/details/${meetingIdToEdit}`);
        if (!currentMeeting) {
            alert("Could not fetch meeting details to reschedule.");
            return;
        }
        // Ensure description is populated, even if it was somehow null from DB (though schema now prevents this)
        document.getElementById('meeting-description').value = currentMeeting.description || ''; 

        if (allUsers.length === 0 || allRooms.length === 0) {
            await populateUserAndRoomDropdowns();
        }

        const form = document.getElementById('create-meeting-form');
        document.getElementById('room-select').value = currentMeeting.room_id;

        const startDate = new Date(currentMeeting.start_time);
        const endDate = new Date(currentMeeting.end_time);

        document.getElementById('start-time').value = toLocalISOStringShort(startDate);
        document.getElementById('end-time').value = toLocalISOStringShort(endDate);
        document.getElementById('meeting-description').value = currentMeeting.description || ''; // Populate description

        const attendeesSelect = document.getElementById('attendees-select');
        Array.from(attendeesSelect.options).forEach(option => {
            option.selected = currentMeeting.attendees.some(att => att.id === parseInt(option.value));
        });

        editingMeetingId = meetingIdToEdit;

        if (formTitleElement) {
            formTitleElement.textContent = 'Update Meeting'; // Change title to "Update Meeting"
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            // Ensure originalSubmitButtonText is captured if it wasn't during DOMContentLoaded
            if (!originalSubmitButtonText && submitButton.textContent) {
                 originalSubmitButtonText = submitButton.textContent;
            }
            submitButton.textContent = 'Update Meeting';
        }

        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-block';
        }

        // Hide other meeting entries
        const meetingsListDiv = document.getElementById('host-meetings-list');
        if (meetingsListDiv) {
            const meetingItems = meetingsListDiv.getElementsByTagName('li');
            Array.from(meetingItems).forEach(item => {
                if (item.id !== `meeting-item-${meetingIdToEdit}`) {
                    item.style.display = 'none';
                } else {
                    item.style.display = ''; // Ensure the edited one is visible
                }
            });
        }

        form.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        console.error('Failed to prepare meeting for reschedule:', error);
        alert('Error preparing reschedule form: ' + (error.message || 'Unknown error'));
    }
}

function cancelEditMode() {
    editingMeetingId = null;
    const form = document.getElementById('create-meeting-form');
    if (form) {
        form.reset();
        document.getElementById('meeting-description').value = ''; // Clear description on reset/cancel
    }

    if (formTitleElement) {
        formTitleElement.textContent = originalFormTitleText || 'Create New Meeting';
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.textContent = originalSubmitButtonText || 'Create Meeting';
    }

    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    
    loadHostMeetings(); // Reload all meetings to make them visible
}

async function manualSetAttendance(meetingId, userId, status) {
    if (!confirm(`Are you sure you want to mark this attendee as ${status}?`)) {
        return;
    }
    try {
        const result = await fetchApi(`/meetings/${meetingId}/attendees/${userId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status: status }),
        });
        // alert(result.message); // Alert can be noisy, consider subtle feedback
        loadHostMeetings(); // Refresh the list to show updated status
    } catch (error) {
        console.error('Failed to update attendance status:', error);
        // fetchApi should alert the error message.
    }
}

async function exportSingleMeetingCSV(meetingId) {
    const meetingData = hostMeetingsData.find(m => m.id === meetingId);
    if (!meetingData) {
        alert('Meeting data not found. Please refresh and try again.');
        return;
    }

    try {
        // Ensure common.js functions are loaded and available on window
        if (typeof window.convertMeetingDataToCSV !== 'function' || typeof window.downloadCSV !== 'function') {
            alert('CSV export utilities are not available. Please try refreshing the page.');
            console.error('CSV export functions not found on window object.');
            return;
        }

        const csvContent = window.convertMeetingDataToCSV(meetingData);
        if (!csvContent) {
            alert('Failed to generate CSV content.');
            return;
        }

        const dateForFile = new Date(meetingData.start_time).toISOString().split('T')[0]; // YYYY-MM-DD
        const roomNameForFile = meetingData.room_name.replace(/[^a-z0-9_]/gi, '_').toLowerCase(); // Sanitize room name
        const fileName = `meeting_${meetingData.id}_${roomNameForFile}_${dateForFile}_attendance.csv`;

        window.downloadCSV(csvContent, fileName);
    } catch (error) {
        console.error('Error exporting CSV for meeting ID ' + meetingId + ':', error);
        alert('An error occurred while exporting the CSV: ' + error.message);
    }
}

// Helper function to escape HTML to prevent XSS - add this at the top or in common.js if used elsewhere
function escapeHTML(str) {
    if (str === null || typeof str === 'undefined') return '';
    return String(str).replace(/[&<>'"/]/g, function (s) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;'
        }[s];
    });
}

// Make functions globally accessible for inline event handlers
window.deleteMeeting = deleteMeeting;
window.rescheduleMeetingPrompt = rescheduleMeetingPrompt;
window.manualSetAttendance = manualSetAttendance;
window.exportSingleMeetingCSV = exportSingleMeetingCSV; // Expose the new CSV export function
