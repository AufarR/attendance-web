import { Database } from 'bun:sqlite';

const db = new Database('./db/attendance.db', { create: true });

// Function to initialize the database schema if it's empty
const initDb = async () => {
  try {
    // Check if tables exist (simple check, could be more robust)
    const roomsTable = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms';").get();
    if (!roomsTable) {
      console.log('Database schema not found, initializing...');
      const schema = Bun.file('./db/schema.sql');
      const schemaSql = await schema.text(); // Await the promise here
      db.exec(schemaSql);
      console.log('Database initialized with schema.');
    } else {
      console.log('Database already initialized.');
    }
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDb();

export default db;
