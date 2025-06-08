document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkUserSessionAndRole('host');
    if (!user) return; // Stop further execution if user is not a host or not logged in

    loadHostMeetings();
    populateUserAndRoomDropdowns();

    const createMeetingForm = document.getElementById('createMeetingForm');
    if (createMeetingForm) {
        createMeetingForm.addEventListener('submit', handleCreateMeeting);
    }
});

// Global variable to store current user ID - this should be fetched securely
// For now, we assume the backend uses cookies and user context is on the server.
// We might need an endpoint to get the current user's ID if forms need it directly
// and it's not easily derivable. For creating meetings, host_id will be set by backend.

let allUsers = []; // To store users for attendee selection
let allRooms = []; // To store rooms for selection

async function populateUserAndRoomDropdowns() {
    try {
        allUsers = await fetchApi('/users');
        allRooms = await fetchApi('/rooms');

        const roomSelect = document.getElementById('roomId');
        const attendeesSelect = document.getElementById('attendees'); // Assuming a multi-select

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
    const roomId = document.getElementById('roomId').value;
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
    const attendeesSelect = document.getElementById('attendees');
    const selectedAttendees = Array.from(attendeesSelect.selectedOptions).map(option => option.value);

    if (!roomId || !startTime || !endTime) {
        alert('Please fill in all meeting details.');
        return;
    }
    
    // host_id will be determined by the server based on the session cookie
    const meetingData = {
        room_id: parseInt(roomId),
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        attendees: selectedAttendees.map(id => parseInt(id)),
    };

    try {
        const result = await fetchApi('/meetings', {
            method: 'POST',
            body: JSON.stringify(meetingData),
        });
        alert(result.message);
        loadHostMeetings(); // Refresh the list
        event.target.reset(); // Reset form
    } catch (error) {
        console.error('Failed to create meeting:', error);
        // Error already alerted by fetchApi
    }
}

async function loadHostMeetings() {
    const meetingsListDiv = document.getElementById('hostMeetingsList');
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
            li.innerHTML = `
                <h4>Meeting ID: ${meeting.id} (Room: ${meeting.room_name})</h4>
                <p>Time: ${new Date(meeting.start_time).toLocaleString()} - ${new Date(meeting.end_time).toLocaleString()}</p>
                <p>Attendees:</p>
                <ul>
                    ${meeting.attendees.map(att => `<li>${att.name} (${att.email}) - Status: ${att.status || 'pending'} ${att.signed_presence ? '(Signed)' : ''}</li>`).join('')}
                </ul>
                <button onclick="rescheduleMeetingPrompt(${meeting.id})">Reschedule</button>
                <button onclick="deleteMeeting(${meeting.id})">Delete</button>
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

async function rescheduleMeetingPrompt(meetingId) {
    // For simplicity, using prompts. A modal form would be better in a real app.
    // Fetch current meeting details to pre-fill, or have a dedicated reschedule form/page.
    const currentMeeting = await fetchApi(`/meetings/details/${meetingId}`); // Assuming an endpoint to get one meeting's details
    if (!currentMeeting) {
        alert("Could not fetch meeting details to reschedule.");
        return;
    }

    const newRoomId = prompt("Enter new Room ID:", currentMeeting.room_id);
    const newStartTimeStr = prompt("Enter new Start Time (YYYY-MM-DDTHH:MM):", currentMeeting.start_time.substring(0,16));
    const newEndTimeStr = prompt("Enter new End Time (YYYY-MM-DDTHH:MM):", currentMeeting.end_time.substring(0,16));
    
    // Simplistic attendee management for reschedule: re-prompt or carry over.
    // For now, let's assume we might want to re-specify attendees or the API handles it.
    // The current backend PUT /api/meetings/:id expects attendees array.
    // We'll re-use the existing attendee list for simplicity in this prompt example.
    const newAttendees = currentMeeting.attendees.map(att => att.id);


    if (!newRoomId || !newStartTimeStr || !newEndTimeStr) {
        alert("All fields are required for rescheduling.");
        return;
    }

    const newStartTime = new Date(newStartTimeStr).toISOString();
    const newEndTime = new Date(newEndTimeStr).toISOString();

    if (isNaN(new Date(newStartTime).getTime()) || isNaN(new Date(newEndTime).getTime())) {
        alert("Invalid date format.");
        return;
    }

    const rescheduleData = {
        room_id: parseInt(newRoomId),
        start_time: newStartTime,
        end_time: newEndTime,
        attendees: newAttendees // Send current attendees
    };

    try {
        const result = await fetchApi(`/meetings/${meetingId}`, {
            method: 'PUT',
            body: JSON.stringify(rescheduleData),
        });
        alert(result.message);
        loadHostMeetings(); // Refresh
    } catch (error) {
        console.error('Failed to reschedule meeting:', error);
    }
}

// Make functions globally accessible for inline event handlers (or refactor to use addEventListener)
window.deleteMeeting = deleteMeeting;
window.rescheduleMeetingPrompt = rescheduleMeetingPrompt;
