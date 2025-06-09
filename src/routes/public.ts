import type { Session } from '../types'; // Assuming Session type is defined here
import type { BunFile } from 'bun';

export async function handlePublicRoutes(req: Request, url: URL, session: Session | null | undefined): Promise<Response | undefined> {
    let diskPath: string;
    let isProtected = false;
    let requiredRole: string | null = null;

    // Determine if the requested path is for a protected HTML file
    if (url.pathname === '/' || url.pathname === '/login.html' || url.pathname === '/public/login.html') {
        diskPath = './public/login.html';
        // If user is already logged in, redirect them to their respective dashboard
        if (session) {
            if (session.role === 'host') {
                return Response.redirect(`${url.origin}/host.html`, 302);
            } else if (session.role === 'attendee') {
                return Response.redirect(`${url.origin}/attendee.html`, 302);
            }
        }
    } else if (url.pathname === '/host.html' || url.pathname === '/public/host.html') {
        diskPath = './public/host.html';
        isProtected = true;
        requiredRole = 'host';
    } else if (url.pathname === '/attendee.html' || url.pathname === '/public/attendee.html') {
        diskPath = './public/attendee.html';
        isProtected = true;
        // Hosts can also access attendee page, so no specific requiredRole here, just check for a valid session.
    } else if (url.pathname.startsWith('/public/')) {
        diskPath = `.${url.pathname}`;
        // .js and .css files under /public/ are not directly protected here,
        // as they are dependencies of the HTML pages whose access is controlled.
    } else if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html')) {
        // Allow access to JS/CSS/HTML files directly if requested (e.g. /host.js, /attendee.js)
        // These are typically linked from HTML files whose access is already controlled.
        // The .html case here handles direct access to /host.html, /attendee.html if not caught by specific rules above.
        diskPath = `./public${url.pathname}`;
    } else {
        // If no specific rule matches, it might be an attempt to access a directory or an unknown file type.
        // For simplicity, return 404. More sophisticated logic could be added (e.g. index.html for directories).
        return new Response('File not found', { status: 404 });
    }

    // Authentication/Authorization check for protected HTML files
    if (isProtected) {
        if (!session) {
            return Response.redirect(`${url.origin}/login.html?redirect=${encodeURIComponent(url.pathname)}`, 302);
        }
        if (requiredRole && session.role !== requiredRole) {
             return new Response('Forbidden: Insufficient permissions.', { status: 403 });
        }
        // If requiredRole is null (e.g. for attendee.html which hosts can also access),
        // and a session exists, access is granted.
    }

    const file = Bun.file(diskPath);
    if (await file.exists()) {
        // Explicitly set Content-Type for HTML files to ensure proper rendering
        if (diskPath.endsWith('.html')) {
            return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        return new Response(file);
    } else {
        // This specific check for login.html might be redundant if diskPath is correctly set above,
        // but kept for safety from original logic.
        if (url.pathname === '/' && diskPath === './public/login.html') {
             const loginFile = Bun.file('./public/login.html');
             if (await loginFile.exists()) {
                return new Response(loginFile, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
             }
        }
        return new Response('File not found', { status: 404 });
    }
}
