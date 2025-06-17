document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkUserSessionAndRole('attendee');
    if (!user) return;

    const attendeeNameSpan = document.getElementById('attendee-name');
    if (attendeeNameSpan && window.currentUser && window.currentUser.name) {
        attendeeNameSpan.textContent = window.currentUser.name;
    }

    const viewHostLink = document.getElementById('view-host-link');
    if (viewHostLink && window.currentUser && window.currentUser.role === 'host') {
        viewHostLink.style.display = 'inline';
    }

    loadAttendeeMeetings();
});

let currentMeetingsData = [];

async function loadAttendeeMeetings() {
    const meetingsListDiv = document.getElementById('meetingsList');
    if (!meetingsListDiv) return;

    meetingsListDiv.innerHTML = '<p>Loading your meetings...</p>';
    try {
        currentMeetingsData = await fetchApi('/attendee/my-meetings');

        if (currentMeetingsData.length === 0) {
            meetingsListDiv.innerHTML = '<p>No meetings assigned to you.</p>';
            return;
        }

        const ul = document.createElement('ul');
        currentMeetingsData.forEach(meeting => {
            const li = document.createElement('li');
            const startTime = new Date(meeting.start_time);
            const endTime = new Date(meeting.end_time);
            const now = new Date();
            let canMarkPresence = now >= startTime && now <= endTime && meeting.attendance_status !== 'present';

            const roomDisplay = meeting.room_description ? 
                `${window.escapeHTML(meeting.room_name)} (${window.escapeHTML(meeting.room_description)})` : 
                window.escapeHTML(meeting.room_name);

            const canSignPresence = !meeting.signed_presence && 
                                    startTime <= now && 
                                    endTime >= now && 
                                    meeting.attendance_status == 'pending';

            let signingStatusMessage = '';
            if (canSignPresence) {
                signingStatusMessage = `<button onclick="promptMarkPresence(${meeting.id})">Sign Presence</button>`;
            } else {
                if (meeting.signed_presence) {
                    signingStatusMessage = '<p>Presence Signed (Signature Provided)</p>';
                } else if (meeting.attendance_status === 'present') {
                    signingStatusMessage = '<p>Presence Marked (Manually by Host)</p>';
                } else if (meeting.attendance_status === 'absent') {
                    signingStatusMessage = '<p>Signing not available (Marked Absent)</p>';
                } else {
                    signingStatusMessage = '<p>Signing not available</p>';
                }
            }

            li.innerHTML = `
                <h4>${window.escapeHTML(meeting.description)} (ID: ${meeting.id})</h4>
                <p>Room: ${roomDisplay}</p>
                <p>Time: ${startTime.toLocaleString()} - ${endTime.toLocaleString()}</p>
                <p>My Status: ${meeting.attendance_status || 'pending'} ${meeting.signed_presence ? `(Signature: ${meeting.signed_presence.substring(0,30)}...)` : ''}</p>
                <div class="meeting-actions">
                    ${signingStatusMessage}
                </div>
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
    if (!window.currentUser || !window.currentUser.userId) {
        alert("User session not found. Please try logging in again.");
        return;
    }

    const timestampNonce = Date.now();
    const dataForPeripheralToSign = `${meeting.id}:${window.currentUser.userId}:${timestampNonce}`;
    
    let signatureFromPeripheral = null;

    if (navigator.bluetooth) {
        try {
            const deviceOptions = {
                filters: [
                    { services: [meeting.ble_service_uuid] },
                    { name: meeting.ble_device_name }
                ],
            };

            const device = await navigator.bluetooth.requestDevice(deviceOptions);
            const server = await device.gatt.connect();
            console.log('Connected to GATT server');

            const service = await server.getPrimaryService(meeting.ble_service_uuid);
            const notifyCharacteristic = await service.getCharacteristic(meeting.ble_characteristic_uuid_notify);

            await notifyCharacteristic.startNotifications();

            const signaturePromise = new Promise((resolve, reject) => {
                const handleCharacteristicValueChanged = event => {
                    notifyCharacteristic.removeEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
                    const value = event.target.value;
                    const decoder = new TextDecoder('utf-8');
                    const receivedSignature = decoder.decode(value);
                    resolve(receivedSignature);
                };
                notifyCharacteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);

                setTimeout(() => {
                    notifyCharacteristic.removeEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);
                    reject(new Error('Timeout waiting for signature notification (30s)'));
                }, 30000);
            });

            const writeCharacteristic = await service.getCharacteristic(meeting.ble_characteristic_uuid_write);
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(dataForPeripheralToSign);
            await writeCharacteristic.writeValueWithResponse(dataBuffer);
            
            signatureFromPeripheral = await signaturePromise;
            
            await notifyCharacteristic.stopNotifications();

            if (server.connected) {
                server.disconnect();
                console.log('Disconnected from GATT server');
            }

        } catch (error) {
            console.error("Bluetooth Web API error:", error);
            alert("Bluetooth connection or interaction failed: " + error.message + "\nEnsure the device is in range, powered on, and permissions are granted. Check console for details. Also ensure the device name ('" + meeting.ble_device_name + "') and service UUID are being advertised correctly.");
            if (typeof server !== 'undefined' && server && server.connected) {
                server.disconnect();
                console.log('Disconnected from GATT server due to error.');
            }
            return;
        }
    } else {
        alert('Web Bluetooth API is not available in this browser. Cannot sign presence.');
        return;
    }
    
    if (!signatureFromPeripheral) {
        alert("No signature was obtained from the peripheral. Cannot mark presence.");
        return;
    }

    await attemptMarkPresence(meetingId, signatureFromPeripheral, timestampNonce);
}


async function attemptMarkPresence(meetingId, signedData, timestampNonce) {
    try {
        const payload = {
            meeting_id: meetingId,
            timestamp_nonce: timestampNonce,
        };
        if (signedData) {
            payload.signed_data = signedData;
        }

        const result = await fetchApi('/meetings/mark-presence', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        alert(result.message + (result.signatureVerified ? ' (Signature Verified)' : result.signatureVerified === false ? ' (Signature Invalid/Not Provided)' : ''));
        loadAttendeeMeetings();
    } catch (error) {
        console.error('Failed to mark presence:', error);
    }
}

window.promptMarkPresence = promptMarkPresence;
