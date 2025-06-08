import db from './src/db';
import { getSessionFromRequest } from './src/sessions'; 
import { handleAuthRoutes } from './src/routes/auth'; 
import { handleMeetingRoutes } from './src/routes/meetings'; 
import { handleUserRoutes } from './src/routes/users'; // Import user router
import { handleRoomRoutes } from './src/routes/rooms'; // Import room router

console.log("Hello via Bun!");

const port = process.env.PORT || 3000; 

const server = Bun.serve({
    port: Number(port), 
    websocket: undefined, 
    async fetch(req) {
        const url = new URL(req.url);
        // const session = getSessionFromRequest(req); // Session is now fetched within individual route handlers
        const isApiRoute = url.pathname.startsWith('/api/');

        // Handle auth routes first
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

        if (!isApiRoute) {
            let diskPath; 

            if (url.pathname === '/') {
                diskPath = './public/login.html';
            } else if (url.pathname.startsWith('/public/')) {
                diskPath = `.${url.pathname}`;
            } else if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
                diskPath = `./public${url.pathname}`;
            } else {
                return new Response('File not found', { status: 404 });
            }

            const file = Bun.file(diskPath);
            if (await file.exists()) {
                return new Response(file);
            } else {
                if (url.pathname === '/' && diskPath === './public/login.html') {
                     const loginFile = Bun.file('./public/login.html');
                     if (await loginFile.exists()) {
                        return new Response(loginFile);
                     }
                }
                return new Response('File not found', { status: 404 });
            }
        }

        // API routes
        // All /api/login, /api/logout, /api/auth/me routes moved to src/routes/auth.ts
        // All /api/meetings/*, /api/host/my-meetings, /api/attendee/my-meetings routes moved to src/routes/meetings.ts

        // --- Host Routes ---
        // Create meeting
        // MOVED to src/routes/meetings.ts

        // Get host's meetings (updated to /api/host/my-meetings)
        // MOVED to src/routes/meetings.ts
        
        // Delete meeting (updated with authorization)
        // MOVED to src/routes/meetings.ts

        // Reschedule meeting (updated with authorization)
        // MOVED to src/routes/meetings.ts

        // Get meeting details (for prefilling reschedule form)
        // MOVED to src/routes/meetings.ts

        // --- Attendee Routes ---
        // Get attendee's meetings (replaces the previous incomplete /api/attendee/meetings/:userId)
        // MOVED to src/routes/meetings.ts

        // Mark presence
        // MOVED to src/routes/meetings.ts

        // --- Generic Routes ---
        // Get all users (for populating dropdowns, etc.)
        // MOVED to src/routes/users.ts

        // Get all rooms (for populating dropdowns, etc.)
        // MOVED to src/routes/rooms.ts
        
        // Fallback for API routes not found
        if (url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ message: 'API endpoint not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        // Fallback for non-API, non-static file routes
        return new Response('Not Found', { status: 404 });
    } // Closing brace for fetch
}); // Closing brace for Bun.serve

console.log(`Listening on http://localhost:${server.port} ...`);