import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../data/triage.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new Database(dbPath);
export function initializeDatabase() {
  db.exec(`CREATE TABLE IF NOT EXISTS triage_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, symptoms TEXT NOT NULL, age INTEGER, duration TEXT,
    severity INTEGER, existing_conditions TEXT, medications TEXT, location TEXT,
    urgency TEXT NOT NULL, specialty TEXT NOT NULL, reason TEXT NOT NULL,
    recommended_action TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS healthcare_facilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, city TEXT NOT NULL,
    specialties TEXT NOT NULL, facility_type TEXT NOT NULL, emergency_support INTEGER DEFAULT 0,
    address TEXT NOT NULL, contact TEXT NOT NULL
  );`);
  const count = db.prepare('SELECT COUNT(*) AS count FROM healthcare_facilities').get().count;
  if (!count) {
    const insert = db.prepare(`INSERT INTO healthcare_facilities
      (name,city,specialties,facility_type,emergency_support,address,contact) VALUES (?,?,?,?,?,?,?)`);
    const rows = [
      ['CityCare General Hospital','Noida','General Medicine,Emergency Care,Cardiology','Hospital',1,'Sector 62, Noida','011-4000-1001'],
      ['Community Health Centre','Meerut','General Medicine,Family Medicine','Community Health Centre',0,'Central Meerut','0121-400-2002'],
      ['District Referral Hospital','Lucknow','General Medicine,Cardiology,Neurology,Pediatrics','Hospital',1,'Gomti Nagar, Lucknow','0522-400-3003'],
      ['Sunrise Specialty Clinic','Noida','Cardiology,General Medicine','Clinic',0,'Sector 18, Noida','011-4000-4004'],
      ['CarePoint Medical Centre','Ghaziabad','General Medicine,Orthopedics,Dermatology','Clinic',0,'Indirapuram, Ghaziabad','0120-400-5005']
    ];
    const tx = db.transaction(items => items.forEach(r => insert.run(...r)));
    tx(rows);
  }
}
