document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkUserSessionAndRole('attendee');
    if (!user) return; // Stop further execution if user is not an attendee or not logged in

    // We have window.currentUser from checkUserSessionAndRole if needed elsewhere
    loadAttendeeMeetings();
});

// Store meeting details temporarily if needed for BLE operations
let currentMeetingsData = [];

async function loadAttendeeMeetings() {
    const meetingsListDiv = document.getElementById('meetingsList');
    if (!meetingsListDiv) return;

    meetingsListDiv.innerHTML = '<p>Loading your meetings...</p>';
    try {
        // Server should get user_id from session cookie
        currentMeetingsData = await fetchApi('/attendee/my-meetings'); // Updated endpoint

        if (currentMeetingsData.length === 0) {
            meetingsListDiv.innerHTML = '<p>No meetings assigned to you.</p>';
            return;
        }

        const ul = document.createElement('ul');
        currentMeetingsData.forEach(meeting => {
            const li = document.createElement('li');
            const now = new Date();
            const startTime = new Date(meeting.start_time);
            const endTime = new Date(meeting.end_time);
            let canMarkPresence = now >= startTime && now <= endTime && meeting.status !== 'present';

            li.innerHTML = `
                <h4>Meeting ID: ${meeting.id} (Room: ${meeting.room_name})</h4>
                <p>Time: ${startTime.toLocaleString()} - ${endTime.toLocaleString()}</p>
                <p>Status: ${meeting.status || 'pending'} ${meeting.signed_presence ? `(Signature: ${meeting.signed_presence.substring(0,30)}...)` : ''}</p>
                ${canMarkPresence ? `<button onclick="promptMarkPresence(${meeting.id})">Mark Presence</button>` : ''}
                ${meeting.status === 'present' ? '<p><strong>Presence Marked</strong></p>' : ''}
                ${now > endTime && meeting.status !== 'present' ? '<p>Meeting has ended, presence cannot be marked.</p>' : ''}
                ${now < startTime ? '<p>Meeting has not started yet.</p>' : ''}
            `;
            ul.appendChild(li);
        });
        meetingsListDiv.innerHTML = '';
        meetingsListDiv.appendChild(ul);
    } catch (error) {
        console.error('Failed to load attendee meetings:', error);
        meetingsListDiv.innerHTML = '<p>Error loading meetings. You might be logged out.</p>';
    }
}

async function promptMarkPresence(meetingId) {
    const meeting = currentMeetingsData.find(m => m.id === meetingId);
    if (!meeting) {
        alert("Meeting details not found.");
        return;
    }
    // Ensure currentUser is available (should be set by checkUserSessionAndRole)
    if (!window.currentUser || !window.currentUser.userId) {
        alert("User session not found. Please try logging in again.");
        // Optionally, redirect to login
        // window.location.href = 'login.html'; 
        return;
    }

    const timestampNonce = Date.now(); 

    const useBle = confirm("Simulate BLE interaction? (Cancel for manual/no signature)");

    let dataToSign = '';
    let simulatedSignedData = null; 

    if (useBle) {
        if (!navigator.bluetooth) {
            alert('Web Bluetooth API is not available on this browser. Please use Chrome on Desktop or Android.');
            const fallback = confirm("Web Bluetooth not available. Mark presence with a simulated manual signature?");
            if (fallback) {
                // Data to sign: meetingId:userId:timestampNonce. 
                // Server uses session userId for verification, but client can prepare it for simulation.
                dataToSign = `${meeting.id}:${window.currentUser.userId}:${timestampNonce}`;
                simulatedSignedData = `MANUAL_SIM_SIG_FOR_${dataToSign}`;
                alert(`Simulating manual signature. Data: "${dataToSign}". Signature: "${simulatedSignedData}"`);
            } else {
                alert("Presence marking cancelled.");
                return;
            }
        } else {
            try {
                alert(`Simulating BLE connection for room: ${meeting.room_name}\nService: ${meeting.ble_service_uuid}\nCharacteristic: ${meeting.ble_characteristic_uuid}`);
                
                dataToSign = `${meeting.id}:${window.currentUser.userId}:${timestampNonce}`;
                simulatedSignedData = `BLE_SIM_SIGNED[${dataToSign}]`; 
                
                alert(`Data prepared for BLE: "${dataToSign}"\nReceived (simulated) BLE signature: "${simulatedSignedData}"`);
                
            } catch (error) {
                console.error('BLE interaction failed:', error);
                alert(`BLE interaction failed: ${error.message}. You can try marking presence with a simulated signature.`);
                const fallbackSign = confirm("BLE failed. Mark presence with a simulated non-BLE signature?");
                if (fallbackSign) {
                    dataToSign = `${meeting.id}:${window.currentUser.userId}:${timestampNonce}`;
                    simulatedSignedData = `FALLBACK_SIM_SIG_FOR_${dataToSign}`;
                    alert(`Simulating fallback signature. Data: "${dataToSign}". Signature: "${simulatedSignedData}"`);
                } else {
                    alert("Presence marking cancelled after BLE failure.");
                    return;
                }
            }
        }
    } else {
        alert("Skipping BLE. Marking presence with no/simulated signature.");
        simulatedSignedData = null; 
    }
    
    await attemptMarkPresence(meetingId, simulatedSignedData, timestampNonce);
}


async function attemptMarkPresence(meetingId, signedData, timestampNonce) { // Added timestampNonce
    try {
        const payload = {
            meeting_id: meetingId,
            timestamp_nonce: timestampNonce, // Send the timestampNonce
        };
        if (signedData) {
            payload.signed_data = signedData;
        }

        const result = await fetchApi('/api/meetings/mark-presence', { // Corrected path
            method: 'POST',
            body: JSON.stringify(payload),
        });
        alert(result.message + (result.signatureVerified ? ' (Signature Verified)' : result.signatureVerified === false ? ' (Signature Invalid/Not Provided)' : ''));
        loadAttendeeMeetings(); // Refresh list
    } catch (error) {
        console.error('Failed to mark presence:', error);
        // Error already alerted by fetchApi in common.js
    }
}

// Make functions globally accessible
window.promptMarkPresence = promptMarkPresence;
