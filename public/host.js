document.addEventListener('DOMContentLoaded', async () => {
    // window.currentUser should be populated by checkUserSessionAndRole
    await checkUserSessionAndRole('host'); 
    
    if (!window.currentUser || window.currentUser.role !== 'host') {
        // checkUserSessionAndRole already handles redirection if user is not a host or not logged in.
        // This is an additional safeguard or if checkUserSessionAndRole's behavior changes.
        console.error("User is not a host or not logged in. Redirecting...");
        // window.location.href = 'login.html'; // Redirection is handled by checkUserSessionAndRole
        return; 
    }

    const hostNameSpan = document.getElementById('host-name');
    if (hostNameSpan && window.currentUser) {
        hostNameSpan.textContent = window.currentUser.name;
    }

    const logoutButton = document.getElementById('logout-btn'); // Corrected ID from host.html
    if (logoutButton) {
        logoutButton.addEventListener('click', logout); // logout is from common.js
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

        const roomSelect = document.getElementById('room-select'); // Corrected ID from host.html
        const attendeesSelect = document.getElementById('attendees-select'); // Corrected ID from host.html

        if (roomSelect) {
            allRooms.forEach(room => {
                const option = document.createElement('option');
                option.value = room.id;
                option.textContent = `${room.name} (${room.description || 'No description'})`;
                roomSelect.appendChild(option);
            });
        }

        if (attendeesSelect) {
            allUsers.filter(user => user.role === 'attendee').forEach(user => {
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
    
    const attendeesSelect = document.getElementById('attendees-select');
    const selectedAttendees = Array.from(attendeesSelect.selectedOptions).map(option => option.value);

    if (!roomId || !startTimeString || !endTimeString) {
        alert('Please fill in all meeting details.');
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
    const meetingsListDiv = document.getElementById('host-meetings-list'); // Corrected ID from host.html
    if (!meetingsListDiv) return;
    meetingsListDiv.innerHTML = '<p>Loading meetings...</p>';

    try {
        // The server should know the host_id from the session cookie.
        // We need an endpoint like /api/host/my-meetings
        const meetings = await fetchApi('/host/my-meetings'); // Updated endpoint
        
        if (meetings.length === 0) {
            meetingsListDiv.innerHTML = '<p>No meetings found.</p>';
            return;
        }

        const ul = document.createElement('ul');
        meetings.forEach(meeting => {
            const li = document.createElement('li');
            li.id = `meeting-item-${meeting.id}`; // Add unique ID to each list item
            const now = new Date();
            const meetingEndTime = new Date(meeting.end_time);
            const isPastMeeting = meetingEndTime < now; // Still useful for the (Past) label and buttons

            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

            let buttonsHtml = '';
            if (!isPastMeeting) {
                buttonsHtml = `
                    <button onclick="rescheduleMeetingPrompt(${meeting.id})">Reschedule</button>
                    <button onclick="deleteMeeting(${meeting.id})">Delete</button>
                `;
            }

            li.innerHTML = `
                <h4>Meeting ID: ${meeting.id} (Room: ${meeting.room_name})</h4>
                <p>Time: ${new Date(meeting.start_time).toLocaleString()} - ${new Date(meeting.end_time).toLocaleString()} ${isPastMeeting ? '(Past)' : ''}</p>
                <p>Attendees:</p>
                <ul>
                    ${meeting.attendees.map(att => {
                        let displayStatus = att.status || 'pending';
                        // Only mark as absent if the meeting ended more than 5 minutes ago
                        if (meetingEndTime < fiveMinutesAgo && displayStatus === 'pending') {
                            displayStatus = 'absent';
                        }
                        return `<li>${att.name} (${att.email}) - Status: ${displayStatus} ${att.signed_presence ? '(Signed)' : ''}</li>`;
                    }).join('')}
                </ul>
                ${buttonsHtml}
            `;
            ul.appendChild(li);
        });
        meetingsListDiv.innerHTML = '';
        meetingsListDiv.appendChild(ul);
    } catch (error) {
        console.error('Failed to load host meetings:', error);
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

        if (allUsers.length === 0 || allRooms.length === 0) {
            await populateUserAndRoomDropdowns();
        }

        const form = document.getElementById('create-meeting-form');
        document.getElementById('room-select').value = currentMeeting.room_id;

        const startDate = new Date(currentMeeting.start_time);
        const endDate = new Date(currentMeeting.end_time);

        document.getElementById('start-time').value = toLocalISOStringShort(startDate);
        document.getElementById('end-time').value = toLocalISOStringShort(endDate);

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

// Make functions globally accessible for inline event handlers (or refactor to use addEventListener)
window.deleteMeeting = deleteMeeting;
window.rescheduleMeetingPrompt = rescheduleMeetingPrompt;
