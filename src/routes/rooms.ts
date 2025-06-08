import db from '../db';
import { getSessionFromRequest } from '../sessions';
import { authorize } from '../authUtils';
import type { Session } from '../types';

export async function handleRoomRoutes(req: Request, url: URL): Promise<Response | undefined> {
    const session = getSessionFromRequest(req);

    // Get all rooms (for populating dropdowns, etc.)
    if (url.pathname === '/api/rooms' && req.method === 'GET') {
        // For now, any authenticated user can fetch the room list.
        // In a real app, you might restrict this further.
        const authResult = authorize(session, {});
        if (!authResult.authorized) return authResult.response;

        try {
            // Exclude sensitive BLE details from general room listing
            const rooms = db.query('SELECT id, name, description FROM rooms').all();
            return new Response(JSON.stringify(rooms), { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error fetching rooms:', error);
            return new Response(JSON.stringify({ message: 'Error fetching rooms' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    return undefined; // Path not handled by this router
}
