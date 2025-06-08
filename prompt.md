# System Summary: Bun-based Attendance Website

This project is a web-based attendance tracking system built using Bun, TypeScript, and SQLite. It provides distinct interfaces for 'host' and 'attendee' users.

**Core Technologies:**
*   **Backend:** Bun runtime, TypeScript. SQLite for the database.
*   **Frontend:** Plain HTML, CSS, and JavaScript.
*   **Database:** SQLite, with schema defined in `db/schema.sql` and runtime data in `db/attendance.db`.

**Key Architectural Points:**
*   The main application entry point is `index.ts`, which sets up the server and routes.
*   API route handlers are organized into the `src/routes/` directory (e.g., `auth.ts`, `meetings.ts`, `users.ts`, `rooms.ts`).
*   Shared backend utilities are located in `src/` (e.g., `db.ts` for database interactions, `sessions.ts` for session management, `authUtils.ts` for authentication/authorization logic, and `types.ts` for TypeScript definitions).
*   Frontend static files (HTML, JS, CSS) are served from the `public/` directory.

**User Roles & Functionality:**

1.  **Host:**
    *   Authenticates via the login page (`public/login.html`, `public/login.js`) to access the host dashboard (`public/host.html`, `public/host.js`).
    *   Manages meetings:
        *   Creates new meetings with a title, start time, and end time. This includes client-side and server-side datetime validation (start time cannot be in the past, allowing for the current minute; end time must be after start time).
        *   Views a list of all created meetings, sorted by start time in descending order (server-side sorting).
        *   Reschedules upcoming meetings. The UI reuses the main meeting creation form, dynamically updating its title and button text. Other meetings are hidden during edit mode.
        *   Deletes upcoming meetings.
        *   Actions like "Reschedule" and "Delete" are hidden for meetings whose start time has passed.
        *   Meeting times in the edit form are displayed correctly considering potential timezone differences using a helper function (`toLocalISOStringShort`).
    *   Manages attendees for their meetings:
        *   Views attendees and their status (e.g., "pending", "confirmed").
        *   For past meetings, attendees who were "pending" are displayed as "absent" if the meeting ended more than 5 minutes ago.
    *   Can view a list of users with the 'attendee' role. This is fetched from the `/api/users` endpoint, which is restricted to users with the 'host' role.

2.  **Attendee:**
    *   Authenticates via the login page to access the attendee view (`public/attendee.html`, `public/attendee.js`).
    *   Sees a welcome message upon login.
    *   Views a list of meetings they are assigned to, sorted by start time in descending order (server-side sorting).
    *   The mechanism for an attendee to mark their presence for a meeting is a core function of an attendance system, though specific UI/API interactions for this were not detailed in the refactoring requests beyond viewing meetings.
    *   Can log out using a dedicated logout button.

**Important Files/Directories:**
*   `index.ts`: Main server setup, middleware, and routing to API modules.
*   `src/routes/`: Contains backend API logic.
    *   `auth.ts`: Handles user login, logout, and session management.
    *   `meetings.ts`: CRUD operations for meetings, fetching meeting lists, and potentially attendance status logic. Includes server-side validation for meeting data.
    *   `users.ts`: User-related operations, such as fetching attendee lists for hosts.
    *   `rooms.ts`: (Presumably for managing rooms/locations for meetings, though less detailed in recent discussions).
*   `src/db.ts`: Handles database connection and query execution using SQLite.
*   `src/sessions.ts`: Manages user sessions, likely storing session data.
*   `src/authUtils.ts`: Provides authorization helper functions, such as role-based access control.
*   `src/types.ts`: Defines shared TypeScript type definitions used across the backend.
*   `public/`: Contains all frontend assets.
    *   `host.html` & `host.js`: Interface for hosts to manage meetings and view attendees.
    *   `attendee.html` & `attendee.js`: Interface for attendees to view their meetings.
    *   `login.html` & `login.js`: Handles user authentication.
    *   `common.js`: Shared JavaScript functions used by multiple frontend pages (e.g., API calls, alert handling).
    *   `style.css`: Global styles for the application.
*   `db/schema.sql`: SQL script defining the database structure (tables, columns, relationships).
*   `db/attendance.db`: The SQLite database file.
*   `package.json`: Lists project dependencies (like Bun types) and scripts (e.g., for starting the server).
*   `bun.lockb`: Bun's lockfile for managing dependency versions.

This summary aims to provide a comprehensive overview for re-understanding the system's purpose, architecture, and key features as developed and refactored.
