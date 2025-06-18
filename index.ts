import db from './src/db';
import { getSessionFromRequest } from './src/sessions'; 
import { handleAuthRoutes } from './src/routes/auth'; 
import { handleMeetingRoutes } from './src/routes/meetings'; 
import { handleUserRoutes } from './src/routes/users';
import { handleRoomRoutes } from './src/routes/rooms';
import { handlePublicRoutes } from './src/routes/public';

console.log("Hello via Bun!");

const port = process.env.PORT || 443;
const sslCertPath = process.env.SSL_CERT_PATH;
const sslKeyPath = process.env.SSL_KEY_PATH;

let tls = undefined;
if (sslCertPath && sslKeyPath) {
    tls = {
        cert: Bun.file(sslCertPath),
        key: Bun.file(sslKeyPath)
    };
}

const server = Bun.serve({
    port: Number(port),
    websocket: undefined,
    tls,
    async fetch(req) {
        const url = new URL(req.url);
        const session = getSessionFromRequest(req);
        const isApiRoute = url.pathname.startsWith('/api/');

        if (url.pathname.startsWith('/api/login') || url.pathname.startsWith('/api/logout') || url.pathname.startsWith('/api/auth/me')) {
            const authResponse = await handleAuthRoutes(req, url);
            if (authResponse) return authResponse;
        }

        if (url.pathname.startsWith('/api/meetings') || url.pathname.startsWith('/api/host/my-meetings') || url.pathname.startsWith('/api/attendee/my-meetings')) {
            const meetingResponse = await handleMeetingRoutes(req, url);
            if (meetingResponse) return meetingResponse;
        }

        if (url.pathname.startsWith('/api/users')) {
            const userResponse = await handleUserRoutes(req, url);
            if (userResponse) return userResponse;
        }

        if (url.pathname.startsWith('/api/rooms')) {
            const roomResponse = await handleRoomRoutes(req, url);
            if (roomResponse) return roomResponse;
        }

        if (!isApiRoute) {
            const publicResponse = await handlePublicRoutes(req, url, session);
            if (publicResponse) return publicResponse;
        }
        
        if (url.pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ message: 'API endpoint not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response('Not Found', { status: 404 });
    }
});

// HTTP to HTTPS redirect server
if (tls) {
    const httpPort = 80;
    Bun.serve({
        port: httpPort,
        fetch(req) {
            const url = new URL(req.url);
            url.protocol = 'https:';
            url.port = port.toString();
            return Response.redirect(url.toString(), 301);
        }
    });
}