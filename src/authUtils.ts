import type { Session } from './types';

export interface AuthResult {
    authorized: boolean;
    status?: number;
    message?: string;
    response?: Response; 
}

export function authorize(
    session: Session | undefined | null,
    {
        allowedRoles,
        ownerIdToCheck,
        resourceOwnerId,
    }: {
        allowedRoles?: string[];
        ownerIdToCheck?: boolean; 
        resourceOwnerId?: number; 
    } = {}
): AuthResult {
    if (!session) {
        const message = 'Unauthorized. Session not found.';
        return {
            authorized: false,
            status: 401,
            message,
            response: new Response(JSON.stringify({ message }), { status: 401, headers: { 'Content-Type': 'application/json' } })
        };
    }

    if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(session.role)) {
            const message = `Forbidden: Role '${session.role}' is not one of allowed roles: ${allowedRoles.join(', ')}.`;
            return {
                authorized: false,
                status: 403,
                message,
                response: new Response(JSON.stringify({ message }), { status: 403, headers: { 'Content-Type': 'application/json' } })
            };
        }
    }

    if (ownerIdToCheck && resourceOwnerId !== undefined) {
        if (session.userId !== resourceOwnerId) {
            const message = 'Forbidden: You do not own this resource.';
            return {
                authorized: false,
                status: 403,
                message,
                response: new Response(JSON.stringify({ message }), { status: 403, headers: { 'Content-Type': 'application/json' } })
            };
        }
    }

    return { authorized: true };
}
