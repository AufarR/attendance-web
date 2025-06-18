import db from '../db'; // Changed to default import
import { sessions, SESSION_DURATION_MINUTES, getSessionFromRequest } from '../sessions';
import type { Session } from '../types';
import argon2 from 'argon2';
import { randomUUID } from 'crypto';

export async function handleAuthRoutes(req: Request, url: URL): Promise<Response | undefined> {
    const session = getSessionFromRequest(req);

    if (url.pathname === '/api/login' && req.method === 'POST') {
        try {
            const { email, password } = await req.json();
            const user = db.query('SELECT * FROM users WHERE email = ?').get(email) as any;

            if (user && await argon2.verify(user.password, password)) {
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
        // getSessionFromRequest is already called at the beginning of this function
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

    return undefined; // Path not handled by this router
}
