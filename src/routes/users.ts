import db from '../db';
import { getSessionFromRequest } from '../sessions';
import { authorize } from '../authUtils';
import type { Session } from '../types';

export async function handleUserRoutes(req: Request, url: URL): Promise<Response | undefined> {
    const session = getSessionFromRequest(req);

    // Get all users (for populating dropdowns, etc.) - restricted to hosts, returns only attendees
    if (url.pathname === '/api/users' && req.method === 'GET') {
        // Corrected: use allowedRoles instead of roles
        const authResult = authorize(session, { allowedRoles: ['host'] }); 
        if (!authResult.authorized) return authResult.response;
        
        try {
            const users = db.query('SELECT id, name, email, role FROM users').all();
            return new Response(JSON.stringify(users), { headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            console.error('Error fetching users:', error);
            return new Response(JSON.stringify({ message: 'Error fetching users' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
    
    return undefined; // Path not handled by this router
}
