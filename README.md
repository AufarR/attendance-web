# Simple Meeting Attendance Management Web App

Aufar Ramadhan 18221163

## Notes

This project is the web component of an attendance system and works in conjunction with the [aufarr/attendance-sign](https://github.com/aufarr/attendance-sign) repository, which handles BLE signing. Please refer to that repository for the BLE peripheral setup.

## Setup

1.  **Environment Variables**: Copy the `.env.template` file to a new file named `.env`.
    ```bash
    cp .env.template .env
    ```
    Review the `.env` file and customize variables as needed (e.g., `PORT`, `BLE_SERVICE_UUID`, `BLE_CHARACTERISTIC_UUID_WRITE`, `BLE_CHARACTERISTIC_UUID_NOTIFY`).

2.  **Install Dependencies**:
    ```bash
    bun install
    ```

3.  **Database Setup**:
    The database schema is defined in `db/schema.sql`. The application uses `db/attendance.db` as the SQLite database file.
    *   If you make changes to `db/schema.sql` (e.g., alter tables, add new tables), you will need to **delete the existing `db/attendance.db` file** for the changes to be applied when the application restarts and recreates the database based on the new schema.
    *   The database is automatically seeded with initial data if it's created from scratch.

## Running the Application

To run the development server:

```bash
bun run index.ts
```
