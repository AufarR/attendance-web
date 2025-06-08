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
        dataToSign = `${meeting.id}:${window.currentUser.userId}:${timestampNonce}`;
        console.log(`[attendee.js] Attempting to sign data: "${dataToSign}"`); // Log the exact data string
        try {
            // Attempt to use Web Crypto for a more realistic signature
            simulatedSignedData = await signDataRsaSha256(rsaPrivateKeyPem, dataToSign);
            alert(`Data to sign: "${dataToSign}"\\nSimulated RSA-SHA256 Signature (Base64): "${simulatedSignedData.substring(0, 60)}..."`);

        } catch (cryptoError) {
            // Fallback to simpler simulation if Web Crypto fails or for browsers without it
            // (though modern browsers should support it)
            console.warn("Web Crypto signing failed, falling back to basic simulation:", cryptoError);
            alert("Web Crypto signing failed. Using basic simulated signature.");
            simulatedSignedData = `CRYPTO_FAILED_SIM_SIG_FOR_${dataToSign}`;
        }
        
        // The original BLE simulation logic can be kept here if desired,
        // but the key is to use the cryptographically signed data.
        if (navigator.bluetooth) {
             alert(`(Simulating BLE connection for room: ${meeting.room_name}\\nService: ${meeting.ble_service_uuid}\\nCharacteristic: ${meeting.ble_characteristic_uuid})`);
        } else {
            alert('Web Bluetooth API is not available. Proceeding with simulated signature.');
        }

    } else {
        alert("Skipping BLE/Crypto. Marking presence with no signature (or basic simulation if backend requires something).");
        // If the backend strictly requires a signature, you might send a known "no-signature" placeholder
        // or the backend handles null gracefully. For this PoC, null is fine.
        simulatedSignedData = null; 
        // Or, if you want to send a non-crypto simulated signature for "Cancel" option:
        // dataToSign = `${meeting.id}:${window.currentUser.userId}:${timestampNonce}`;
        // simulatedSignedData = `NO_BLE_SIM_SIG_FOR_${dataToSign}`;
        // alert(`Simulating non-BLE signature. Data: "${dataToSign}". Signature: "${simulatedSignedData}"`);
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
