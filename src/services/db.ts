import * as SQLite from 'expo-sqlite';

// Single source of truth for the DB connection
const db = SQLite.openDatabaseSync('triptracker.db');

export const initDB = () => {
  // 1. Create tables if they don't exist at all
  db.execSync(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startTime INTEGER,
      endTime INTEGER,
      distance REAL,
      toll REAL,
      totalFare REAL,
      averageSpeed REAL,
      path TEXT
    );
    CREATE TABLE IF NOT EXISTS coordinates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tripId INTEGER,
      latitude REAL,
      longitude REAL,
      speed REAL,
      timestamp INTEGER,
      FOREIGN KEY(tripId) REFERENCES trips(id)
    );
  `);

  // 2. Quick Migration: Try to add the 'path' column for older test databases.
  // We wrap this in a try/catch because if the column already exists, SQLite throws an error.
  try {
    db.execSync(`ALTER TABLE trips ADD COLUMN path TEXT;`);
    console.log("Migration successful: Added 'path' column to trips table.");
  } catch (e) {
    // Silently fail: This just means the column is already there!
  }
};

export interface SavedTrip {
  id: number;
  startTime: number;
  endTime: number;
  distance: number;
  toll: number;
  totalFare: number;
  path: { latitude: number, longitude: number }[];
  averageSpeed?: number;
}

export const fetchAllTrips = async (): Promise<SavedTrip[]> => {
  return await db.getAllAsync<SavedTrip>(
    'SELECT * FROM trips ORDER BY startTime DESC'
  );
};

export const updateTripFareDetails = async (
  id: number, 
  toll: number, 
  totalFare: number
) => {
  // Use the global 'db' instance instead of opening a new one
  await db.runAsync(
    'UPDATE trips SET toll = ?, totalFare = ? WHERE id = ?',
    [toll, totalFare, id]
  );
};

export const deleteTrip = async (id: number) => {
  // Use the global 'db' instance here too
  await db.runAsync('DELETE FROM coordinates WHERE tripId = ?', [id]); 
  await db.runAsync('DELETE FROM trips WHERE id = ?', [id]);
};

export default db;