document.addEventListener('DOMContentLoaded', async () => {
    await checkUserSessionAndRole('host'); 
    
    if (!window.currentUser || window.currentUser.role !== 'host') {
        console.error("User is not a host or not logged in. Redirection should be handled by checkUserSessionAndRole.");
        return; 
    }

    const hostNameSpan = document.getElementById('host-name');
    if (hostNameSpan && window.currentUser && window.currentUser.name) {
        hostNameSpan.textContent = window.currentUser.name;
    }

    loadHostMeetings();
    populateUserAndRoomDropdowns();

    const createMeetingForm = document.getElementById('create-meeting-form'); 
    if (createMeetingForm) {
        createMeetingForm.addEventListener('submit', handleCreateMeeting);

        formTitleElement = document.getElementById('form-title');
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
            cancelEditButton.style.display = 'none';
            cancelEditButton.style.marginLeft = '10px';

            if (submitButton && submitButton.parentNode) {
                submitButton.parentNode.insertBefore(cancelEditButton, submitButton.nextSibling);
            } else {
                createMeetingForm.appendChild(cancelEditButton);
            }
        }
        cancelEditButton.addEventListener('click', cancelEditMode);
    }
});

// Global variables
let allUsers = [];
let allRooms = [];
let editingMeetingId = null;
let originalSubmitButtonText = '';
let formTitleElement = null;
let originalFormTitleText = '';
let hostMeetingsData = [];

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
            roomSelect.innerHTML = '';
            allRooms.forEach(room => {
                const option = document.createElement('option');
                option.value = room.id;
                option.textContent = `${room.name} (${room.description || 'No description'})`;
                roomSelect.appendChild(option);
            });
        }

        if (attendeesSelect) {
            attendeesSelect.innerHTML = '';
            allUsers.forEach(user => {
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

    if (!roomId || !startTimeString || !endTimeString || !description) {
        alert('Please fill in all meeting details, including the description.');
        return;
    }

    const startTime = new Date(startTimeString);
    const endTime = new Date(endTimeString);
    const now = new Date();

    // Client-side datetime sanity checks
    if (!editingMeetingId) {
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
        description: description,
    };

    let url = '/meetings';
    let method = 'POST';

    if (editingMeetingId) {
        url = `/meetings/${editingMeetingId}`;
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
    }
}

async function loadHostMeetings() {
    const meetingsListDiv = document.getElementById('host-meetings-list');
    if (!meetingsListDiv) return;
    meetingsListDiv.innerHTML = '<p>Loading meetings...</p>';

    try {
        const meetings = await fetchApi('/host/my-meetings');
        hostMeetingsData = meetings;

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
            const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

            let meetingActions = '';
            if (meetingEndTime > now) {
                meetingActions += `<button onclick="rescheduleMeetingPrompt(${meeting.id})">Reschedule</button> `;
                meetingActions += `<button onclick="deleteMeeting(${meeting.id})">Delete</button> `;
            }
            meetingActions += `<button class="export-csv-btn" onclick="exportSingleMeetingCSV(${meeting.id})">Export CSV</button>`;

            const roomDisplay = meeting.room_description ? 
                `${window.escapeHTML(meeting.room_name)} (${window.escapeHTML(meeting.room_description)})` : 
                window.escapeHTML(meeting.room_name);

            li.innerHTML = `
                <h4>${meeting.description ? window.escapeHTML(meeting.description) : `Meeting at ${roomDisplay}`} on ${meetingTime} (ID: ${meeting.id})</h4>
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
                        let statusButtons = '';
                        if (displayStatus !== 'present') {
                            statusButtons += `<button class="status-btn" onclick="manualSetAttendance(${meeting.id}, ${att.id}, 'present')">Mark Present</button>`;
                        }
                        if (displayStatus !== 'absent') {
                            statusButtons += `<button class="status-btn" onclick="manualSetAttendance(${meeting.id}, ${att.id}, 'absent')">Mark Absent</button>`;
                        }

                        return `<li>
                                    ${window.escapeHTML(att.name)} (${window.escapeHTML(att.email)}) - Status: <strong>${displayStatus}</strong> ${att.signed_presence ? '(Signed)' : ''}
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
        hostMeetingsData = [];
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
        loadHostMeetings();
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
        document.getElementById('meeting-description').value = currentMeeting.description || '';

        const attendeesSelect = document.getElementById('attendees-select');
        Array.from(attendeesSelect.options).forEach(option => {
            option.selected = currentMeeting.attendees.some(att => att.id === parseInt(option.value));
        });

        editingMeetingId = meetingIdToEdit;

        if (formTitleElement) {
            formTitleElement.textContent = 'Update Meeting';
        }

        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            if (!originalSubmitButtonText && submitButton.textContent) {
                 originalSubmitButtonText = submitButton.textContent;
            }
            submitButton.textContent = 'Update Meeting';
        }

        const cancelBtn = document.getElementById('cancel-edit-btn');
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-block';
        }

        const yourMeetingsTitle = document.getElementById('your-meetings-title');
        if (yourMeetingsTitle) {
            yourMeetingsTitle.style.display = 'none';
        }

        // Hide other meeting entries
        const meetingsListDiv = document.getElementById('host-meetings-list');
        if (meetingsListDiv) {
            const meetingItems = meetingsListDiv.getElementsByTagName('li');
            Array.from(meetingItems).forEach(item => {
                if (item.id !== `meeting-item-${meetingIdToEdit}`) {
                    item.style.display = 'none';
                } else {
                    item.style.display = '';
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
        document.getElementById('meeting-description').value = '';
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

    const yourMeetingsTitle = document.getElementById('your-meetings-title');
    if (yourMeetingsTitle) {
        yourMeetingsTitle.style.display = '';
    }
    
    loadHostMeetings();
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
        loadHostMeetings();
    } catch (error) {
        console.error('Failed to update attendance status:', error);
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

        const dateForFile = new Date(meetingData.start_time).toISOString().split('T')[0];
        const roomNameForFile = meetingData.room_name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
        const fileName = `meeting_${meetingData.id}_${roomNameForFile}_${dateForFile}_attendance.csv`;

        window.downloadCSV(csvContent, fileName);
    } catch (error) {
        console.error('Error exporting CSV for meeting ID ' + meetingId + ':', error);
        alert('An error occurred while exporting the CSV: ' + error.message);
    }
}

window.deleteMeeting = deleteMeeting;
window.rescheduleMeetingPrompt = rescheduleMeetingPrompt;
window.manualSetAttendance = manualSetAttendance;
window.exportSingleMeetingCSV = exportSingleMeetingCSV;
