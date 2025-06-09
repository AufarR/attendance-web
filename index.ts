import db from './src/db';
import { getSessionFromRequest } from './src/sessions'; 
import { handleAuthRoutes } from './src/routes/auth'; 
import { handleMeetingRoutes } from './src/routes/meetings'; 
import { handleUserRoutes } from './src/routes/users'; // Import user router
import { handleRoomRoutes } from './src/routes/rooms'; // Import room router
import { handlePublicRoutes } from './src/routes/public'; // Import public router

console.log("Hello via Bun!");

const port = process.env.PORT || 3000; 

const server = Bun.serve({
    port: Number(port), 
    websocket: undefined, 
    async fetch(req) {
        const url = new URL(req.url);
        const session = getSessionFromRequest(req); // Fetch session for all requests
        const isApiRoute = url.pathname.startsWith('/api/');

        // Handle auth routes first (these are public or have their own internal checks)
        if (url.pathname.startsWith('/api/login') || url.pathname.startsWith('/api/logout') || url.pathname.startsWith('/api/auth/me')) {
            const authResponse = await handleAuthRoutes(req, url);
            if (authResponse) return authResponse;
        }

        // Handle meeting routes
        if (url.pathname.startsWith('/api/meetings') || url.pathname.startsWith('/api/host/my-meetings') || url.pathname.startsWith('/api/attendee/my-meetings')) {
            const meetingResponse = await handleMeetingRoutes(req, url);
            if (meetingResponse) return meetingResponse;
        }

        // Handle user routes
        if (url.pathname.startsWith('/api/users')) {
            const userResponse = await handleUserRoutes(req, url);
            if (userResponse) return userResponse;
        }

        // Handle room routes
        if (url.pathname.startsWith('/api/rooms')) {
            const roomResponse = await handleRoomRoutes(req, url);
            if (roomResponse) return roomResponse;
        }

        // Handle public file serving and route protection
        if (!isApiRoute) {
            const publicResponse = await handlePublicRoutes(req, url, session);
            if (publicResponse) return publicResponse;
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