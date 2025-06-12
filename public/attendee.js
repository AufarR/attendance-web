document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkUserSessionAndRole('attendee');
    if (!user) return; // Stop further execution if user is not an attendee or not logged in

    // Welcome message for attendee
    const attendeeNameSpan = document.getElementById('attendee-name');
    if (attendeeNameSpan && window.currentUser && window.currentUser.name) {
        attendeeNameSpan.textContent = window.currentUser.name;
    }

    // The logout button is now in the menu bar and handled by common.js event listener

    const viewHostLink = document.getElementById('view-host-link');
    if (viewHostLink && window.currentUser && window.currentUser.role === 'host') {
        viewHostLink.style.display = 'inline'; // Or 'block' or 'flex' depending on layout
    }

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
            const startTime = new Date(meeting.start_time);
            const endTime = new Date(meeting.end_time);
            const now = new Date();
            // Use meeting.attendance_status instead of meeting.status
            let canMarkPresence = now >= startTime && now <= endTime && meeting.attendance_status !== 'present';

            // Helper for escaping HTML, consider moving to common.js if not already there and used consistently
            const escapeHTML = window.escapeHTML || function(str) { // Use window.escapeHTML if available
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
            };

            const roomDisplay = meeting.room_description ? 
                `${escapeHTML(meeting.room_name)} (${escapeHTML(meeting.room_description)})` : 
                escapeHTML(meeting.room_name);

            // Condition for showing the sign presence button
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
                <h4>${escapeHTML(meeting.description)} (ID: ${meeting.id})</h4>
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
    // Ensure currentUser is available (should be set by checkUserSessionAndRole)
    if (!window.currentUser || !window.currentUser.userId) {
        alert("User session not found. Please try logging in again.");
        return;
    }

    const timestampNonce = Date.now(); 

    let dataToSign = '';
    let simulatedSignedData = null; 

    // BLE interaction is now mandatory for signing
    dataToSign = `${meeting.id}:${window.currentUser.userId}:${timestampNonce}`;
    console.log(`[attendee.js] Attempting to sign data: "${dataToSign}"`); 
    try {
        simulatedSignedData = await signDataRsaSha256(rsaPrivateKeyPem, dataToSign);
        alert(`Data to sign: "${dataToSign}"\nSimulated RSA-SHA256 Signature (Base64): "${simulatedSignedData.substring(0, 60)}..."`);

    } catch (cryptoError) {
        console.warn("Web Crypto signing failed, falling back to basic simulation:", cryptoError);
        alert("Web Crypto signing failed. Using basic simulated signature.");
        // Fallback to a basic simulated signature if crypto fails, but still send something.
        simulatedSignedData = `CRYPTO_FAILED_SIM_SIG_FOR_${dataToSign}`;
    }
    
    if (navigator.bluetooth) {
            alert(`(Simulating BLE connection for room: ${meeting.room_name}\\nService: ${meeting.ble_service_uuid}\\nCharacteristic: ${meeting.ble_characteristic_uuid})`);
    } else {
        alert('Web Bluetooth API is not available. Proceeding with simulated signature.');
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

        const result = await fetchApi('/meetings/mark-presence', { // Corrected path
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

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Helper to convert PEM string to ArrayBuffer (for PKCS#8 private key)
function pemToPkcs8ArrayBuffer(pem) {
    const b64Lines = pem.replace('-----BEGIN PRIVATE KEY-----', '')
                        .replace('-----END PRIVATE KEY-----', '')
                        .replace(/\n/g, ''); // Corrected: remove actual newlines
    const binaryDer = window.atob(b64Lines);
    const len = binaryDer.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryDer.charCodeAt(i);
    }
    return bytes.buffer;
}

const rsaPrivateKeyPem = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDIIJdTfuep1O16
ObuF7Y2vox70z748ZUYeFvDCzBkwpnmbvgrvNOkyhfIRy4d0IUcBk8liTAO1F4Qz
3fk2q9L5JP29OgSJe4BPRWmchnUprE9AExT+fM9uJtbj2mEh1UzegcNtwxphYAkb
lr7uiDyRe0MAdAPKp+dQ0etDfwJZiXEfj11YpJ3Ga0Q4SzOu729+kzbhVP7jgp3f
yDcdass7Nk1eWX/l80SzxpJE9/b+bwHy2hR0/XB7IIrEytwUwQL4H2jIpZRwshuJ
19mDIKeupJZs+Ha6bX3EuvaK+9BNw2hXYj4TL1zel4JF9cJRyREvJHoehdTaR4+3
iSYJWqUHAgMBAAECggEAAyzJorMWGlm1twG/zVwwuIiPIo5eSTQBcgxtdJ/rTbis
oAFox//1ZLVNaVejqakn79cw/lLXn/4kWbtqEnexRTZ/aZkPUF3yuQECE2x4qicy
uR1X8N3cX30N69B8DztLri4DLTRyPsA8WE9tUeo8ZfqvP7cXeBXg1zOuQVKYysea
mytCIPVCKGIy4yD7IQDVNzgS1sBmCHBpzMJPVC9LPj0B8Rj0qB+Qlp05GDekxZqx
XlFPPN/Tibeeu4LBkjFP6VY/dLn1aCHZIFIS1LqVsLUNitUMLsTF17PHZh1dmOrT
nTsDzSD9otkfAWGu98yzusGJ+x9WOSFyE56aHSaKEQKBgQD34L0F9r1P/RVdpTO2
6+dHjDQu33Z4dRBPOR6sIAxAp+lSpqzPmnpJNFlk8nKGFANByW0w+Dl/+YCViFpy
KoJDvQ+DKbGG2X/8Tab5J/JFudeq7AipQK7RD7sK827v/GR7bI3QZJ6nEODGODVT
tM07jvyJkqZs7tJqv+xMGrTkEQKBgQDOr08Z87v+0w42Idz5XdTR71ho/hOR8q3/
aG/87B4Mrku3tMlFBPVMbr5gzANUkRfIZNf0AdhQsvd12odRwc/QJ+LZRnVanw2X
K8EjL1/2CkjpgenEPx1OFS/afgPfB+EZeA9H4RBrUh3axpo5F4upHHjKssB5mdJU
Gi0emzkvlwKBgFT1BBRNMyl9Npt4CbeCNyzAkwoVsQcsKEDe9PJNsaVfZ4racZRd
/9ejR5hfuHzX0x3zKaeFDEAehcG6kDVc+HS7EdwEqEHtvf39p2LyHAll3tNIPtez
wbcJyzO/p6A9QztCQ4DPW8kq8b8+eJiN+WGWalvElaH0YM4Rpa2X4bPhAoGAJBTk
uUIckqrjsz2MJxhjW9bt1z5ryjHUgF8KFdxejpYq78Im1N69t/8pSxqyhiPiRACe
1qEv0z67Bp8EupgcIFmmN4oeWJiltbtUt0DA/uHiwqkEV1cxVX1LYlhXcqscd+bG
vCSlSicGwTekmszqe7ZVvAUiptfcqQP81ngArrcCgYEAsNXJ4fqoWDJBNR9p0eY3
jHM5LBgHvT78wBfvOQDjYbpVDcMOhG6o/cTZzTcLOsg0TdqwPgMIDLwzos3ZWqQN
46eqAprGWkm1ShBqpNGgjZEJmaM7AYeX7dxbEJz0jMBC0dWP5f/QwrPBcHCrBRop
B5N863jfbzPp7dpn/fpM0SI=
-----END PRIVATE KEY-----`;

async function signDataRsaSha256(privateKeyPem, dataString) {
    try {
        const privateKeyBuffer = pemToPkcs8ArrayBuffer(privateKeyPem);
        const privateKey = await window.crypto.subtle.importKey(
            "pkcs8",
            privateKeyBuffer,
            {
                name: "RSASSA-PKCS1-v1_5",
                hash: { name: "SHA-256" },
            },
            false, // Key is not extractable
            ["sign"]
        );

        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(dataString);

        const signatureBuffer = await window.crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            privateKey,
            dataBuffer
        );

        return arrayBufferToBase64(signatureBuffer);
    } catch (e) {
        console.error("Error signing data with RSA-SHA256:", e);
        alert("Error during client-side signature generation: " + e.message);
        throw e;
    }
}

// Make functions globally accessible
window.promptMarkPresence = promptMarkPresence;
