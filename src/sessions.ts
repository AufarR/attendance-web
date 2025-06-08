import type { Session } from './types';

export const SESSION_DURATION_MINUTES = 60 * 24; // 1 day
export const sessions = new Map<string, Session>();

export function getSessionFromRequest(req: Request): Session | undefined {
    const cookieHeader = req.headers.get('Cookie');
    if (!cookieHeader) return undefined;

    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=').map(decodeURIComponent)));
    const sessionId = cookies['sessionId'];

    if (!sessionId) return undefined;

    const session = sessions.get(sessionId);
    if (session && session.expires > new Date()) {
        return session;
    } else if (session) {
        // Session expired
        sessions.delete(sessionId);
    }
    return undefined;
}
