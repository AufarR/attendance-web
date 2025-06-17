# System Summary: Bun-based Attendance Website

This project is a web-based attendance tracking system built using Bun, TypeScript, and SQLite. It provides distinct interfaces for 'host' and 'attendee' users, with a key feature being BLE-based presence signing for attendees.

**Core Technologies:**
*   **Backend:** Bun runtime, TypeScript. SQLite for the database.
*   **Frontend:** Plain HTML, CSS, and JavaScript.
*   **Database:** SQLite, with schema defined in `db/schema.sql` and runtime data in `db/attendance.db`.
*   **BLE (Bluetooth Low Energy):** Used for attendee presence verification.

**Key Architectural Points:**
*   The main application entry point is `index.ts`, which sets up the server and routes.
*   API route handlers are organized into the `src/routes/` directory (e.g., `auth.ts`, `meetings.ts`, `users.ts`, `rooms.ts`).
*   Shared backend utilities are located in `src/` (e.g., `db.ts` for database interactions, `sessions.ts` for session management, `authUtils.ts` for authentication/authorization logic, and `types.ts` for TypeScript definitions).
*   Frontend static files (HTML, JS, CSS) are served from the `public/` directory.
*   Configuration for BLE (Service UUID, Characteristic UUIDs for write and notify, device name prefix) is managed via environment variables in an `.env` file. A `.env.template` file provides a template for these variables.

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
        *   Views attendees and their status (e.g., "pending", "confirmed", "signed").
        *   For past meetings, attendees who were "pending" are displayed as "absent" if the meeting ended more than 5 minutes ago.
    *   Can view a list of users with the 'attendee' role. This is fetched from the `/api/users` endpoint, which is restricted to users with the 'host' role.

2.  **Attendee:**
    *   Authenticates via the login page to access the attendee view (`public/attendee.html`, `public/attendee.js`).
    *   Sees a welcome message upon login.
    *   Views a list of meetings they are assigned to, sorted by start time in descending order (server-side sorting).
    *   **BLE Presence Signing:**
        *   For upcoming or ongoing meetings, attendees can mark their presence using a BLE-enabled device (e.g., a dedicated hardware signer).
        *   The frontend (`public/attendee.js`) fetches BLE configuration (service UUID, characteristic UUIDs for write and notify, device name prefix) from the backend (`/api/attendee/my-meetings`).
        *   The attendee initiates a BLE scan for a device matching the configured name prefix and service UUID.
        *   Upon connecting, the frontend subscribes to a notify characteristic to receive a challenge from the BLE device.
        *   The frontend then writes a response (e.g., a signed version of the challenge, or user identifier) to a write characteristic on the BLE device.
        *   The BLE device verifies the response and, if successful, the frontend sends a confirmation to the backend (`/api/attendee/mark-presence/:meetingId`) to update the attendance status to "signed".
        *   This flow requires a real BLE device; there is no JavaScript-based simulation of the signature.
    *   Can log out using a dedicated logout button.

**Important Files/Directories:**
*   `index.ts`: Main server setup, middleware, and routing to API modules.
*   `src/routes/`: Contains backend API logic.
    *   `auth.ts`: Handles user login, logout, and session management.
    *   `meetings.ts`: CRUD operations for meetings, fetching meeting lists, and attendance status logic (including providing BLE config to attendees and handling presence marking). Includes server-side validation for meeting data.
    *   `users.ts`: User-related operations, such as fetching attendee lists for hosts.
    *   `rooms.ts`: (Presumably for managing rooms/locations for meetings).
    *   `public.ts`: Serves static files from the `public/` directory.
*   `src/db.ts`: Handles database connection and query execution using SQLite.
*   `src/sessions.ts`: Manages user sessions, likely storing session data.
*   `src/authUtils.ts`: Provides authorization helper functions, such as role-based access control.
*   `src/types.ts`: Defines shared TypeScript type definitions used across the backend.
*   `public/`: Contains all frontend assets.
    *   `host.html` & `host.js`: Interface for hosts to manage meetings and view attendees.
    *   `attendee.html` & `attendee.js`: Interface for attendees to view their meetings and perform BLE presence signing.
    *   `login.html` & `login.js`: Handles user authentication.
    *   `common.js`: Shared JavaScript functions used by multiple frontend pages (e.g., API calls, alert handling, `escapeHTML`).
    *   `style.css`: Global styles for the application.
*   `db/schema.sql`: SQL script defining the database structure. **Important:** If this file is changed, the `db/attendance.db` file must be deleted and recreated for changes to take effect (e.g., by running `bun run reset-db`).
*   `db/attendance.db`: The SQLite database file.
*   `.env`: Stores environment-specific configuration, including BLE UUIDs and device name. **Not committed to version control.**
*   `.env.template`: A template for the `.env` file, showing required environment variables.
*   `package.json`: Lists project dependencies (like Bun types) and scripts (e.g., for starting the server, resetting the database).
*   `bun.lockb`: Bun's lockfile for managing dependency versions.
*   `README.md`: Provides setup instructions, an overview of the project, and development notes.

This summary aims to provide a comprehensive overview for re-understanding the system's purpose, architecture, and key features as developed and refactored.
