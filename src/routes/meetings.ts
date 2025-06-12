import db from '../db';
import { getSessionFromRequest } from '../sessions';
import { authorize } from '../authUtils';
import { createVerify } from 'crypto';
import type { Session } from '../types';

export async function handleMeetingRoutes(req: Request, url: URL): Promise<Response | undefined> {
    const session = getSessionFromRequest(req);

    // Create meeting
    if (url.pathname === '/api/meetings' && req.method === 'POST') {
        const authResult = authorize(session, { allowedRoles: ['host'] });
        if (!authResult.authorized) return authResult.response;

        try {
            const { room_id, start_time, end_time, attendees, description } = await req.json() as any;
            const host_id = session!.userId; 
            
            if (!room_id || !host_id || !start_time || !end_time || !attendees || !Array.isArray(attendees) || !description) { // Added !description
                return new Response(JSON.stringify({ message: 'Missing required fields, including description' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            // Server-side datetime sanity checks
            const startTimeDate = new Date(start_time);
            const endTimeDate = new Date(end_time);
            const now = new Date();
            // Set seconds and milliseconds to 0 for both now and startTimeDate for comparison
            now.setSeconds(0, 0);
            const compareStartTime = new Date(startTimeDate);
            compareStartTime.setSeconds(0, 0);

            if (compareStartTime < now) {
              return new Response(JSON.stringify({ message: 'Start time cannot be in the past.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            if (endTimeDate <= startTimeDate) {
                return new Response(JSON.stringify({ message: 'End time must be after start time.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            const existingMeeting = db.query(
                'SELECT id FROM meetings WHERE room_id = ? AND NOT (end_time <= ? OR start_time >= ?)'
            ).get(room_id, start_time, end_time);

            if (existingMeeting) {
                return new Response(JSON.stringify({ message: 'Room is booked during this time' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
            }

            const meetingInsertResult = db.prepare(
                'INSERT INTO meetings (room_id, host_id, start_time, end_time, description) VALUES (?, ?, ?, ?, ?)'
            ).run(room_id, host_id, start_time, end_time, description); // No longer defaulting to null
            
            const meetingId = meetingInsertResult.lastInsertRowid;

            if (attendees.length > 0) {
                const stmt = db.prepare('INSERT INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)');
                for (const userId of attendees) {
                    stmt.run(meetingId, userId);
                }
            }

            return new Response(JSON.stringify({ message: 'Meeting created successfully', meetingId }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error creating meeting:', error);
            return new Response(JSON.stringify({ message: 'Error creating meeting' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Get host's meetings
    if (url.pathname === '/api/host/my-meetings' && req.method === 'GET') {
        const authResult = authorize(session, { allowedRoles: ['host'] });
        if (!authResult.authorized) return authResult.response;

        try {
            const hostId = session!.userId;
            const meetings = db.query(
                `SELECT m.id, m.start_time, m.end_time, m.description, r.name as room_name, r.description as room_description
                 FROM meetings m
                 JOIN rooms r ON m.room_id = r.id
                 WHERE m.host_id = ?
                 ORDER BY m.start_time DESC`
            ).all(hostId);

            const meetingsWithAttendees = meetings.map((meeting: any) => {
                const attendeesList = db.query(
                    `SELECT u.id, u.name, u.email, ma.status, ma.signed_presence
                     FROM meeting_attendees ma
                     JOIN users u ON ma.user_id = u.id
                     WHERE ma.meeting_id = ?`
                ).all(meeting.id);
                return { ...meeting, attendees: attendeesList }; // Renamed attendees to attendeesList to avoid conflict
            });

            return new Response(JSON.stringify(meetingsWithAttendees), { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error fetching host meetings:', error);
            return new Response(JSON.stringify({ message: 'Error fetching meetings' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
    
    // Delete meeting
    if (url.pathname.startsWith('/api/meetings/') && req.method === 'DELETE' && !url.pathname.endsWith('mark-presence')) { // ensure not mark-presence
        const meetingIdString = url.pathname.split('/').pop();
        if (!meetingIdString) {
            return new Response(JSON.stringify({ message: 'Meeting ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const meetingId = parseInt(meetingIdString);
        
        if (isNaN(meetingId)) {
            return new Response(JSON.stringify({ message: 'Invalid meeting ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const meetingForAuth = db.query('SELECT host_id FROM meetings WHERE id = ?').get(meetingId) as any;
        if (!meetingForAuth) {
            return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        const authResult = authorize(session, { allowedRoles: ['host'], ownerIdToCheck: true, resourceOwnerId: meetingForAuth.host_id });
        if (!authResult.authorized) return authResult.response;

        try {
            const meeting = db.query('SELECT end_time FROM meetings WHERE id = ?').get(meetingId) as any; // Already checked existence
            if (new Date(meeting.end_time) < new Date()) {
                return new Response(JSON.stringify({ message: 'Cannot delete a past meeting' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            db.transaction(() => {
                db.prepare('DELETE FROM meeting_attendees WHERE meeting_id = ?').run(meetingId);
                db.prepare('DELETE FROM meetings WHERE id = ?').run(meetingId);
            })();
            return new Response(JSON.stringify({ message: 'Meeting deleted successfully' }), { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error deleting meeting:', error);
            return new Response(JSON.stringify({ message: 'Error deleting meeting' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Reschedule meeting
    if (url.pathname.startsWith('/api/meetings/') && req.method === 'PUT' && !url.pathname.endsWith('mark-presence')) { // ensure not mark-presence
        const meetingIdString = url.pathname.split('/').pop();
        if (!meetingIdString) {
            return new Response(JSON.stringify({ message: 'Meeting ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const meetingId = parseInt(meetingIdString);

        if (isNaN(meetingId)) {
            return new Response(JSON.stringify({ message: 'Invalid meeting ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const currentMeetingForAuth = db.query('SELECT host_id FROM meetings WHERE id = ?').get(meetingId) as any;
        if (!currentMeetingForAuth) {
            return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        const authResult = authorize(session, { allowedRoles: ['host'], ownerIdToCheck: true, resourceOwnerId: currentMeetingForAuth.host_id });
        if (!authResult.authorized) return authResult.response;

        try {
            const { room_id, start_time, end_time, attendees, description } = await req.json() as any; 

            if (!room_id || !start_time || !end_time || !attendees || !Array.isArray(attendees) || !description) { // Added !description
                 return new Response(JSON.stringify({ message: 'Missing required fields for rescheduling, including description' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            // Server-side datetime sanity checks for rescheduling
            const startTimeDate = new Date(start_time);
            const endTimeDate = new Date(end_time);
            // Note: We don't check if startTimeDate is in the past for rescheduling, 
            // as a meeting might be ongoing and its end time is being extended.
            // However, the client-side check for past *meetings* (not just start time) still applies for enabling reschedule button.

            if (endTimeDate <= startTimeDate) {
                return new Response(JSON.stringify({ message: 'End time must be after start time.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            const currentMeeting = db.query('SELECT end_time FROM meetings WHERE id = ?').get(meetingId) as any;
            if (new Date(currentMeeting.end_time) < new Date()) {
                return new Response(JSON.stringify({ message: 'Cannot reschedule a past meeting' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            const existingMeeting = db.query(
                'SELECT id FROM meetings WHERE room_id = ? AND id != ? AND NOT (end_time <= ? OR start_time >= ?)'
            ).get(room_id, meetingId, start_time, end_time);

            if (existingMeeting) {
                return new Response(JSON.stringify({ message: 'Room is booked during this time for another meeting' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
            }

            db.transaction(() => {
                db.prepare('UPDATE meetings SET room_id = ?, start_time = ?, end_time = ?, description = ? WHERE id = ?')
                  .run(room_id, start_time, end_time, description, meetingId); // No longer defaulting to null
                
                db.prepare('DELETE FROM meeting_attendees WHERE meeting_id = ?').run(meetingId);
                if (attendees.length > 0) {
                    const stmt = db.prepare('INSERT INTO meeting_attendees (meeting_id, user_id) VALUES (?, ?)');
                    for (const userId of attendees) {
                        stmt.run(meetingId, userId);
                    }
                }
            })();

            return new Response(JSON.stringify({ message: 'Meeting rescheduled successfully' }), { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error rescheduling meeting:', error);
            return new Response(JSON.stringify({ message: 'Error rescheduling meeting' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Get meeting details (for prefilling reschedule form)
    if (url.pathname.startsWith('/api/meetings/details/') && req.method === 'GET') {
        const meetingIdString = url.pathname.split('/').pop();
        if (!meetingIdString) {
            return new Response(JSON.stringify({ message: 'Meeting ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const meetingId = parseInt(meetingIdString);

        if (isNaN(meetingId)) {
            return new Response(JSON.stringify({ message: 'Invalid meeting ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const meetingForAuth = db.query('SELECT host_id FROM meetings WHERE id = ?').get(meetingId) as any;
        if (!meetingForAuth) {
            return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        const authResult = authorize(session, { allowedRoles: ['host'], ownerIdToCheck: true, resourceOwnerId: meetingForAuth.host_id });
        if (!authResult.authorized) return authResult.response;

        try {
            const meeting = db.query(
                `SELECT m.id, m.room_id, m.host_id, m.start_time, m.end_time, m.description, r.name as room_name
                 FROM meetings m
                 JOIN rooms r ON m.room_id = r.id
                 WHERE m.id = ?`
            ).get(meetingId) as any;

            const attendeesList = db.query(
                `SELECT u.id, u.name, u.email
                 FROM meeting_attendees ma
                 JOIN users u ON ma.user_id = u.id
                 WHERE ma.meeting_id = ?`
            ).all(meetingId);

            return new Response(JSON.stringify({ ...meeting, attendees: attendeesList }), { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error fetching meeting details:', error);
            return new Response(JSON.stringify({ message: 'Error fetching meeting details' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Get attendee's meetings
    if (url.pathname === '/api/attendee/my-meetings' && req.method === 'GET') {
        // Allow both 'attendee' and 'host' roles to fetch their meetings as an attendee.
        // The session.userId will ensure they only get meetings they are specifically added to as an attendee.
        const authResult = authorize(session, { allowedRoles: ['attendee', 'host'] }); 
        if (!authResult.authorized) return authResult.response;
        
        try {
            const userId = session!.userId;
            const meetings = db.query(
                `SELECT m.id, m.start_time, m.end_time, m.description, r.name as room_name, r.description as room_description,
                        r.service_uuid as ble_service_uuid, 
                        r.characteristic_uuid as ble_characteristic_uuid, 
                        r.device_name as ble_device_name, 
                        r.public_key as room_public_key,
                        ma.status as attendance_status, ma.signed_presence
                 FROM meetings m
                 JOIN rooms r ON m.room_id = r.id
                 JOIN meeting_attendees ma ON m.id = ma.meeting_id
                 WHERE ma.user_id = ?
                 ORDER BY m.start_time DESC`
            ).all(userId);
            return new Response(JSON.stringify(meetings), { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error fetching attendee meetings:', error);
            return new Response(JSON.stringify({ message: 'Error fetching meetings' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Mark presence
    if (url.pathname === '/api/meetings/mark-presence' && req.method === 'POST') {
        const authResult = authorize(session, {}); // Any authenticated user can mark presence for their meetings
        if (!authResult.authorized) return authResult.response;

        try {
            // Correctly expect meeting_id, signed_data, and timestamp_nonce from the client
            const { meeting_id, signed_data, timestamp_nonce } = await req.json() as any;
            const userId = session!.userId;

            if (!meeting_id || !timestamp_nonce) { // Check for meeting_id and timestamp_nonce
                return new Response(JSON.stringify({ message: 'Missing meeting_id or timestamp_nonce' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            if (!signed_data) { // Signature is mandatory
                return new Response(JSON.stringify({ message: 'Signature is required to mark presence.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            const meetingAttendee = db.query(
                'SELECT * FROM meeting_attendees WHERE meeting_id = ? AND user_id = ?'
            ).get(meeting_id, userId) as any;

            if (!meetingAttendee) {
                return new Response(JSON.stringify({ message: 'You are not an attendee of this meeting.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            if (meetingAttendee.status === 'present') {
                return new Response(JSON.stringify({ message: 'Presence already marked.', attendance_status: 'present' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
            }

            // Fetch meeting details including room_public_key for verification
            const meetingDetails = db.query(
                `SELECT m.start_time, m.end_time, r.public_key as room_public_key
                 FROM meetings m
                 JOIN rooms r ON m.room_id = r.id
                 WHERE m.id = ?`
            ).get(meeting_id) as any;

            if (!meetingDetails) {
                return new Response(JSON.stringify({ message: 'Meeting not found.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }
            
            if (!meetingDetails.room_public_key) {
                console.error('[/api/meetings/mark-presence] Error: Room public key not found for signature verification.');
                return new Response(JSON.stringify({ message: 'Room public key not found for signature verification.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }

            const now = new Date();
            const startTime = new Date(meetingDetails.start_time);
            const endTime = new Date(meetingDetails.end_time);

            // Check timestamp_nonce against server time (5 min clock skew tolerance)
            const clientTimestamp = new Date(timestamp_nonce);
            if (Math.abs(now.getTime() - clientTimestamp.getTime()) > 5 * 60 * 1000) {
                return new Response(JSON.stringify({ message: 'Timestamp for signature is too old or in the future.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            if (now < startTime || now > endTime) {
                return new Response(JSON.stringify({ message: 'Cannot mark presence outside of meeting time.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            // Verify signature
            const dataToVerify = `${meeting_id}:${userId}:${timestamp_nonce}`; // Correct data string
            const processedPublicKey = (meetingDetails.room_public_key as string).replace(/\\n/g, '\n');

            const verify = createVerify('RSA-SHA256');
            verify.update(dataToVerify); 
            // Use signed_data directly, and verify as 'base64'
            const isVerified = verify.verify(processedPublicKey, signed_data, 'base64'); 

            if (isVerified) {
                db.prepare(
                    'UPDATE meeting_attendees SET status = ?, signed_presence = ? WHERE meeting_id = ? AND user_id = ?'
                ).run('present', signed_data, meeting_id, userId);
                return new Response(JSON.stringify({ message: 'Presence marked successfully', attendance_status: 'present' }), { headers: { 'Content-Type': 'application/json' } });
            } else {
                console.warn('Signature verification failed for meeting_id:', meeting_id, 'user_id:', userId);
                return new Response(JSON.stringify({ message: 'Signature verification failed.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

        } catch (error) {
            console.error('Error marking presence:', error);
            // Check if error is a SyntaxError (e.g. invalid JSON in request)
            if (error instanceof SyntaxError) {
                return new Response(JSON.stringify({ message: 'Invalid request format.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ message: 'Error marking presence' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    // Host manually updates attendee status
    if (url.pathname.match(/^\/api\/meetings\/\d+\/attendees\/\d+\/status$/) && req.method === 'POST') {
        const parts = url.pathname.split('/');
        const meetingId = parseInt(parts[3]);
        const userIdToUpdate = parseInt(parts[5]);

        if (isNaN(meetingId) || isNaN(userIdToUpdate)) {
            return new Response(JSON.stringify({ message: 'Invalid meeting ID or user ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const meetingForAuth = db.query('SELECT host_id FROM meetings WHERE id = ?').get(meetingId) as any;
        if (!meetingForAuth) {
            return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        const authResult = authorize(session, { allowedRoles: ['host'], ownerIdToCheck: true, resourceOwnerId: meetingForAuth.host_id });
        if (!authResult.authorized) return authResult.response;

        try {
            const { status } = await req.json() as any;
            if (!status || !['present', 'absent', 'pending'].includes(status)) {
                return new Response(JSON.stringify({ message: 'Invalid status provided. Must be one of: present, absent, pending.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            // Check if the user is actually an attendee of this meeting
            const meetingAttendee = db.query(
                'SELECT user_id FROM meeting_attendees WHERE meeting_id = ? AND user_id = ?'
            ).get(meetingId, userIdToUpdate) as any;

            if (!meetingAttendee) {
                return new Response(JSON.stringify({ message: 'User is not an attendee of this meeting.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
            }

            // Update the status
            // If marking as 'present', we might want to clear signed_presence if it was manually set, or decide on a policy.
            // For now, we'll just update status. If they were marked present via signature, signed_presence will remain.
            // If marking as 'absent' or 'pending', clear any existing signature.
            let signedPresenceToSet = meetingAttendee.signed_presence; // Keep existing by default
            if (status === 'absent' || status === 'pending') {
                signedPresenceToSet = null;
            }

            db.prepare(
                'UPDATE meeting_attendees SET status = ?, signed_presence = ? WHERE meeting_id = ? AND user_id = ?'
            ).run(status, signedPresenceToSet, meetingId, userIdToUpdate);

            return new Response(JSON.stringify({ message: `Attendee status updated to ${status}` }), { headers: { 'Content-Type': 'application/json' } });

        } catch (error) {
            console.error('Error updating attendee status:', error);
            if (error instanceof SyntaxError) {
                return new Response(JSON.stringify({ message: 'Invalid request format.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify({ message: 'Error updating attendee status' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    return undefined; // Path not handled by this router
}
