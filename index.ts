import db from './src/db';
import bcrypt from 'bcrypt';
import { randomUUID, createVerify } from 'crypto'; // Added createVerify

const saltRounds = 10;

// In-memory session store (for PoC purposes)
// In a production app, use a more robust session store like Redis or a database table
interface SessionData {
    userId: number;
    role: string;
    email: string;
    name: string;
    expires: Date;
}
const sessions: Map<string, SessionData> = new Map();
const SESSION_DURATION_MINUTES = 60;

function getSession(req: Request): SessionData | null {
    const cookieHeader = req.headers.get('Cookie');
    if (!cookieHeader) return null;

    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
    const sessionId = cookies['sessionId'];

    if (!sessionId) return null;

    const session = sessions.get(sessionId);
    if (session && session.expires > new Date()) {
        // Extend session
        session.expires = new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000);
        sessions.set(sessionId, session);
        return session;
    }
    if (session) {
        // Session expired
        sessions.delete(sessionId);
    }
    return null;
}


console.log("Hello via Bun!");

const server = Bun.serve({
    port: 3000,
    websocket: undefined, // ADDED for type error
    async fetch(req) {
        const url = new URL(req.url);
        const session = getSession(req);

        // Serve static files from 'public' directory
        if (url.pathname === '/' || url.pathname.startsWith('/public')) {
            // If root, serve login.html. Otherwise, serve the requested file from public.
            const filePath = url.pathname === '/' ? '/public/login.html' : url.pathname;
            // Ensure filePath still starts with /public if it's not the root
            const safeFilePath = filePath.startsWith('/public/') ? filePath : (filePath === '/public/login.html' ? filePath : `/public${filePath}`);

            const file = Bun.file(`.${safeFilePath}`);
            if (await file.exists()) {
                return new Response(file);
            }
            // Fallback for root if login.html somehow not found, or other specific files
            if (url.pathname === '/') {
                 const loginFile = Bun.file('./public/login.html');
                 if (await loginFile.exists()) return new Response(loginFile);
            }
            return new Response('File not found', { status: 404 });
        }

        // API routes
        if (url.pathname === '/api/login' && req.method === 'POST') {
            try {
                const { email, password } = await req.json();
                const user = db.query('SELECT * FROM users WHERE email = ?').get(email) as any;

                if (user && await bcrypt.compare(password, user.password)) {
                    const sessionId = randomUUID();
                    const expires = new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000);
                    sessions.set(sessionId, { 
                        userId: user.id, 
                        role: user.role, 
                        email: user.email, 
                        name: user.name,
                        expires 
                    });

                    const headers = new Headers();
                    headers.append('Content-Type', 'application/json');
                    headers.append('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=${SESSION_DURATION_MINUTES * 60}; SameSite=Lax`);
                    
                    return new Response(JSON.stringify({ 
                        message: 'Login successful', 
                        userId: user.id, 
                        role: user.role,
                        name: user.name,
                        email: user.email
                    }), { headers });
                } else {
                    return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
                }
            } catch (error) {
                console.error('Login error:', error);
                return new Response(JSON.stringify({ message: 'Error during login' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }

        if (url.pathname === '/api/logout' && req.method === 'POST') {
            const cookieHeader = req.headers.get('Cookie');
            if (cookieHeader) {
                const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
                const sessionId = cookies['sessionId'];
                if (sessionId) {
                    sessions.delete(sessionId);
                }
            }
            const headers = new Headers();
            headers.append('Content-Type', 'application/json');
            // Instruct browser to delete cookie
            headers.append('Set-Cookie', 'sessionId=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
            return new Response(JSON.stringify({ message: 'Logout successful' }), { headers });
        }

        if (url.pathname === '/api/auth/me' && req.method === 'GET') {
            if (session) {
                return new Response(JSON.stringify({ 
                    userId: session.userId, 
                    role: session.role,
                    email: session.email,
                    name: session.name
                }), { headers: { 'Content-Type': 'application/json' } });
            } else {
                return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
        }


        // --- Host Routes ---
        // Create meeting
        if (url.pathname === '/api/meetings' && req.method === 'POST') {
            if (!session || session.role !== 'host') {
                return new Response(JSON.stringify({ message: 'Unauthorized or not a host' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                // host_id will now come from session
                const { room_id, start_time, end_time, attendees } = await req.json() as any;
                const host_id = session.userId;
                
                // Basic validation
                if (!room_id || !host_id || !start_time || !end_time || !attendees || !Array.isArray(attendees)) {
                    return new Response(JSON.stringify({ message: 'Missing required fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                // Check for room availability (simplified)
                const existingMeeting = db.query(
                    'SELECT id FROM meetings WHERE room_id = ? AND NOT (end_time <= ? OR start_time >= ?)'
                ).get(room_id, start_time, end_time);

                if (existingMeeting) {
                    return new Response(JSON.stringify({ message: 'Room is booked during this time' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
                }

                const meetingInsertResult = db.prepare(
                    'INSERT INTO meetings (room_id, host_id, start_time, end_time) VALUES (?, ?, ?, ?)'
                ).run(room_id, host_id, start_time, end_time);
                
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

        // Get host's meetings (updated to /api/host/my-meetings)
        if (url.pathname === '/api/host/my-meetings' && req.method === 'GET') {
            if (!session || session.role !== 'host') {
                return new Response(JSON.stringify({ message: 'Unauthorized or not a host' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                const hostId = session.userId; // Use userId from session
                const meetings = db.query(
                    `SELECT m.id, m.start_time, m.end_time, r.name as room_name, r.description as room_description
                     FROM meetings m
                     JOIN rooms r ON m.room_id = r.id
                     WHERE m.host_id = ?
                     ORDER BY m.start_time DESC`
                ).all(hostId);

                const meetingsWithAttendees = meetings.map((meeting: any) => {
                    const attendees = db.query(
                        `SELECT u.id, u.name, u.email, ma.status, ma.signed_presence
                         FROM meeting_attendees ma
                         JOIN users u ON ma.user_id = u.id
                         WHERE ma.meeting_id = ?`
                    ).all(meeting.id);
                    return { ...meeting, attendees };
                });

                return new Response(JSON.stringify(meetingsWithAttendees), { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                console.error('Error fetching host meetings:', error);
                return new Response(JSON.stringify({ message: 'Error fetching meetings' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }
        
        // Delete meeting (updated with authorization)
        if (url.pathname.startsWith('/api/meetings/') && req.method === 'DELETE') {
            if (!session || session.role !== 'host') {
                return new Response(JSON.stringify({ message: 'Unauthorized or not a host' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
            const meetingIdString = url.pathname.split('/').pop();
            if (!meetingIdString) {
                return new Response(JSON.stringify({ message: 'Meeting ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            const meetingId = parseInt(meetingIdString);
            
            if (isNaN(meetingId)) {
                return new Response(JSON.stringify({ message: 'Invalid meeting ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                const meeting = db.query('SELECT host_id, end_time FROM meetings WHERE id = ?').get(meetingId) as any;
                if (!meeting) {
                    return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
                }
                if (meeting.host_id !== session.userId) {
                    return new Response(JSON.stringify({ message: 'Forbidden: You are not the host of this meeting' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                }
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

        // Reschedule meeting (updated with authorization)
        if (url.pathname.startsWith('/api/meetings/') && req.method === 'PUT') {
            if (!session || session.role !== 'host') {
                return new Response(JSON.stringify({ message: 'Unauthorized or not a host' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
            const meetingIdString = url.pathname.split('/').pop();
            if (!meetingIdString) {
                return new Response(JSON.stringify({ message: 'Meeting ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            const meetingId = parseInt(meetingIdString);

            if (isNaN(meetingId)) {
                return new Response(JSON.stringify({ message: 'Invalid meeting ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                const { room_id, start_time, end_time, attendees } = await req.json() as any;

                if (!room_id || !start_time || !end_time || !attendees || !Array.isArray(attendees)) {
                     return new Response(JSON.stringify({ message: 'Missing required fields for rescheduling' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                const currentMeeting = db.query('SELECT host_id, end_time FROM meetings WHERE id = ?').get(meetingId) as any;
                if (!currentMeeting) {
                    return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
                }
                if (currentMeeting.host_id !== session.userId) {
                    return new Response(JSON.stringify({ message: 'Forbidden: You are not the host of this meeting' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                }
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
                    db.prepare('UPDATE meetings SET room_id = ?, start_time = ?, end_time = ? WHERE id = ?')
                      .run(room_id, start_time, end_time, meetingId);
                    
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
            if (!session || session.role !== 'host') {
                return new Response(JSON.stringify({ message: 'Unauthorized or not a host' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
            const meetingIdString = url.pathname.split('/').pop();
            if (!meetingIdString) {
                return new Response(JSON.stringify({ message: 'Meeting ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }
            const meetingId = parseInt(meetingIdString);

            if (isNaN(meetingId)) {
                return new Response(JSON.stringify({ message: 'Invalid meeting ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            try {
                const meeting = db.query(
                    `SELECT m.id, m.room_id, m.host_id, m.start_time, m.end_time, r.name as room_name
                     FROM meetings m
                     JOIN rooms r ON m.room_id = r.id
                     WHERE m.id = ?`
                ).get(meetingId) as any;

                if (!meeting) {
                    return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
                }

                if (meeting.host_id !== session.userId) {
                    return new Response(JSON.stringify({ message: 'Forbidden: You are not the host of this meeting' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                }

                const attendees = db.query(
                    `SELECT u.id, u.name, u.email
                     FROM meeting_attendees ma
                     JOIN users u ON ma.user_id = u.id
                     WHERE ma.meeting_id = ?`
                ).all(meetingId);

                return new Response(JSON.stringify({ ...meeting, attendees }), { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                console.error('Error fetching meeting details:', error);
                return new Response(JSON.stringify({ message: 'Error fetching meeting details' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // --- Attendee Routes ---
        // Get attendee's meetings (replaces the previous incomplete /api/attendee/meetings/:userId)
        if (url.pathname === '/api/attendee/my-meetings' && req.method === 'GET') {
            if (!session) {
                return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                const userId = session.userId;
                const meetings = db.query(
                    `SELECT m.id, m.start_time, m.end_time, r.name as room_name, r.description as room_description,
                            r.ble_service_uuid, r.ble_characteristic_uuid, r.ble_device_name, r.public_key as room_public_key,
                            ma.status as attendance_status, ma.signed_presence
                     FROM meetings m
                     JOIN rooms r ON m.room_id = r.id
                     JOIN meeting_attendees ma ON m.id = ma.meeting_id
                     WHERE ma.user_id = ?
                     ORDER BY m.start_time ASC`
                ).all(userId);
                return new Response(JSON.stringify(meetings), { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                console.error('Error fetching attendee meetings:', error);
                return new Response(JSON.stringify({ message: 'Error fetching meetings' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // Mark presence
        if (url.pathname === '/api/meetings/mark-presence' && req.method === 'POST') {
            if (!session) {
                return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                const { meeting_id, signed_data, timestamp_nonce } = await req.json() as any; // Added timestamp_nonce
                const user_id = session.userId;

                if (!meeting_id || !timestamp_nonce) { // Ensure timestamp_nonce is present
                    return new Response(JSON.stringify({ message: 'Missing meeting_id or timestamp_nonce' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                const attendeeCheck = db.query(
                    'SELECT user_id FROM meeting_attendees WHERE meeting_id = ? AND user_id = ?'
                ).get(meeting_id, user_id);

                if (!attendeeCheck) {
                    return new Response(JSON.stringify({ message: 'User is not an attendee of this meeting or meeting does not exist.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                }
                
                const meetingDetails = db.query(
                    `SELECT m.start_time, m.end_time, r.public_key as room_public_key
                     FROM meetings m
                     JOIN rooms r ON m.room_id = r.id
                     WHERE m.id = ?`
                ).get(meeting_id) as any;

                if (!meetingDetails) {
                    return new Response(JSON.stringify({ message: 'Meeting not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
                }
                const now = new Date();
                // Allow a 5 minute grace period for clock skew when checking timestamp_nonce for signature
                const clientTimestamp = new Date(timestamp_nonce);
                if (Math.abs(now.getTime() - clientTimestamp.getTime()) > 5 * 60 * 1000 && signed_data) {
                    return new Response(JSON.stringify({ message: 'Timestamp for signature is too old or in the future.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                }

                if (now < new Date(meetingDetails.start_time) || now > new Date(meetingDetails.end_time)) {
                     return new Response(JSON.stringify({ message: 'Meeting is not active' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
                }

                let signatureVerified = false;
                if (signed_data) {
                    if (!meetingDetails.room_public_key) {
                        return new Response(JSON.stringify({ message: 'Room public key not found for signature verification.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
                    }
                    try {
                        const dataToVerify = `${meeting_id}:${user_id}:${timestamp_nonce}`;
                        const verify = createVerify('RSA-SHA256');
                        verify.update(dataToVerify);
                        signatureVerified = verify.verify(meetingDetails.room_public_key, signed_data, 'base64');
                        
                        if (!signatureVerified) {
                            return new Response(JSON.stringify({ message: 'Invalid signature.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
                        }
                    } catch (e: any) {
                        console.error('Error verifying signature:', e);
                        return new Response(JSON.stringify({ message: 'Error verifying signature.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
                    }
                } else {
                    // For now, if no signature is provided, we can allow marking presence (simulated)
                    // In a real scenario, you might make signed_data mandatory if BLE is expected
                    console.log(`Presence marked for meeting ${meeting_id}, user ${user_id} without signature (simulated).`);
                }

                db.prepare(
                    'UPDATE meeting_attendees SET status = ?, signed_presence = ? WHERE meeting_id = ? AND user_id = ?'
                ).run('present', signed_data || null, meeting_id, user_id);

                return new Response(JSON.stringify({ message: 'Presence marked successfully', signatureVerified }), { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                console.error('Error marking presence:', error);
                return new Response(JSON.stringify({ message: 'Error marking presence' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // --- Generic Routes ---
        // Get all users (for populating dropdowns, etc.)
        if (url.pathname === '/api/users' && req.method === 'GET') {
            if (!session) { // Basic auth check, refine roles if needed
                 return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                const users = db.query('SELECT id, name, email, role FROM users').all();
                return new Response(JSON.stringify(users), { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                console.error('Error fetching users:', error);
                return new Response(JSON.stringify({ message: 'Error fetching users' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // Get all rooms (for populating dropdowns, etc.)
        if (url.pathname === '/api/rooms' && req.method === 'GET') {
             if (!session) { // Basic auth check, refine roles if needed
                 return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
            }
            try {
                // Exclude sensitive BLE details from general room listing
                const rooms = db.query('SELECT id, name, description FROM rooms').all();
                return new Response(JSON.stringify(rooms), { headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                console.error('Error fetching rooms:', error);
                return new Response(JSON.stringify({ message: 'Error fetching rooms' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
            }
        }
        
        // Fallback for API routes not found
        if (url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ message: 'API endpoint not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // Fallback for non-API, non-static file routes
        return new Response('Not Found', { status: 404 });
    } // Closing brace for fetch
}); // Closing brace for Bun.serve

console.log(`Listening on http://localhost:${server.port} ...`);