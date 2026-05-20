import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const { Client, Pool } = pg;

const dbUser = process.env.DB_USER || 'postgres';
const dbPassword = process.env.DB_PASSWORD || 'postgres';
const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || 5432;
const dbName = process.env.DB_NAME || 'carenest';

let pool;

// Promisified database actions for clean async/await
export const dbRun = async (query, params = []) => {
  let q = query;
  // SQLite compatibility layer: Convert placeholders from '?' to '$1', '$2', etc.
  let paramIndex = 1;
  while (q.includes('?')) {
    q = q.replace('?', `$${paramIndex++}`);
  }

  // SQLite compatibility layer: PostgreSQL INSERT requires RETURNING id to get the last ID
  if (q.trim().toUpperCase().startsWith('INSERT INTO') && !q.toUpperCase().includes('RETURNING')) {
    q += ' RETURNING id';
  }

  try {
    const result = await pool.query(q, params);
    return { 
      id: result.rows[0]?.id || null, 
      changes: result.rowCount 
    };
  } catch (err) {
    console.error('Database query error in dbRun:', err.message, '\nQuery:', q, '\nParams:', params);
    throw err;
  }
};

export const dbGet = async (query, params = []) => {
  let q = query;
  let paramIndex = 1;
  while (q.includes('?')) {
    q = q.replace('?', `$${paramIndex++}`);
  }

  try {
    const result = await pool.query(q, params);
    return result.rows[0] || null;
  } catch (err) {
    console.error('Database query error in dbGet:', err.message, '\nQuery:', q, '\nParams:', params);
    throw err;
  }
};

export const dbAll = async (query, params = []) => {
  let q = query;
  let paramIndex = 1;
  while (q.includes('?')) {
    q = q.replace('?', `$${paramIndex++}`);
  }

  try {
    const result = await pool.query(q, params);
    return result.rows;
  } catch (err) {
    console.error('Database query error in dbAll:', err.message, '\nQuery:', q, '\nParams:', params);
    throw err;
  }
};

// Initialize schema and seed data
export async function initDb() {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    console.log('Production DATABASE_URL detected. Initializing database pool with SSL support...');
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false // standard for Render/Railway/Heroku hosting environments
      }
    });
  } else {
    console.log('Connecting to PostgreSQL default database to verify carenest database exists...');
    
    // 1. Connect to postgres default database first to ensure carenest DB exists
    const client = new Client({
      user: dbUser,
      password: dbPassword,
      host: dbHost,
      port: dbPort,
      database: 'postgres' // connect to default pg db
    });

    try {
      await client.connect();
      
      // Check if carenest database exists
      const res = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
      if (res.rowCount === 0) {
        console.log(`Database "${dbName}" does not exist. Creating database...`);
        await client.query(`CREATE DATABASE ${dbName}`);
        console.log(`Database "${dbName}" created successfully.`);
      } else {
        console.log(`Database "${dbName}" exists.`);
      }
    } catch (err) {
      console.error('Error verifying database existence:', err.message);
      throw err;
    } finally {
      await client.end();
    }

    // 2. Initialize connection pool for carenest database
    pool = new Pool({
      user: dbUser,
      password: dbPassword,
      host: dbHost,
      port: dbPort,
      database: dbName
    });
  }

  console.log('PostgreSQL connection pool initialized.');

  // Create Users Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL CHECK (role IN ('patient', 'caregiver', 'admin')),
      phone VARCHAR(50),
      avatar_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create Patients Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      address TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      emergency_contact TEXT,
      medical_history TEXT
    )
  `);

  // Create Caregivers Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS caregivers (
      id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      specialty VARCHAR(50) NOT NULL CHECK (specialty IN ('Nurse', 'Therapist', 'ElderCare', 'DementiaCare')),
      status VARCHAR(50) NOT NULL DEFAULT 'Offline' CHECK (status IN ('Available', 'Offline', 'Busy')),
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      rating_avg DOUBLE PRECISION DEFAULT 5.0,
      hourly_rate INTEGER NOT NULL,
      verification_status VARCHAR(50) DEFAULT 'Pending' CHECK (verification_status IN ('Pending', 'Verified', 'Rejected')),
      license_number VARCHAR(100),
      license_state VARCHAR(100),
      experience_years INTEGER,
      bio TEXT
    )
  `);

  // Ensure these columns exist for pre-existing databases (backwards compatibility migrations)
  try {
    await dbRun(`ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS license_number VARCHAR(100)`);
    await dbRun(`ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS license_state VARCHAR(100)`);
    await dbRun(`ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS experience_years INTEGER`);
    await dbRun(`ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS bio TEXT`);
  } catch {
    console.log('Caregiver migration column check complete.');
  }

  // Create Bookings Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      patient_id INTEGER NOT NULL REFERENCES patients(id),
      caregiver_id INTEGER REFERENCES caregivers(id),
      service_type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Accepted', 'EnRoute', 'Arrived', 'InProgress', 'Completed', 'Cancelled')),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      accepted_at TIMESTAMP WITH TIME ZONE,
      started_at TIMESTAMP WITH TIME ZONE,
      completed_at TIMESTAMP WITH TIME ZONE,
      payout INTEGER NOT NULL,
      patient_rating DOUBLE PRECISION,
      patient_review TEXT,
      pickup_latitude DOUBLE PRECISION,
      pickup_longitude DOUBLE PRECISION
    )
  `);

  // Create Booking Checklist Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS booking_checklist (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      task_description TEXT NOT NULL,
      is_completed INTEGER DEFAULT 0 CHECK (is_completed IN (0, 1)),
      completed_at TIMESTAMP WITH TIME ZONE
    )
  `);

  console.log('PostgreSQL database tables successfully created.');

  // Seed default data if users table is empty
  const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
  if (parseInt(userCount.count) === 0) {
    console.log('Seeding default PostgreSQL database records...');

    const salt = bcrypt.genSaltSync(10);
    const defaultPasswordHash = bcrypt.hashSync('carenest123', salt);

    // 1. Seed Admin
    await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      ['CareNest Admin', 'admin@carenest.com', defaultPasswordHash, 'admin', '+15550001111', 'https://api.dicebear.com/7.x/bottts/svg?seed=admin']
    );

    // 2. Seed Patients
    const patient1User = await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      ['Alice Johnson', 'alice@gmail.com', defaultPasswordHash, 'patient', '+15552223333', 'https://api.dicebear.com/7.x/adventurer/svg?seed=alice']
    );
    await dbRun(
      'INSERT INTO patients (id, address, latitude, longitude, emergency_contact, medical_history) VALUES (?, ?, ?, ?, ?, ?)',
      [patient1User.id, '742 Evergreen Terrace, Springfield', 40.7128, -74.0060, 'Bob Johnson (+15552224444)', 'Mild asthma, high blood pressure. Recovering from minor hip replacement surgery. Needs assistance with movement and vitals monitoring.']
    );

    const patient2User = await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      ['Bob Vance', 'bob@vance.com', defaultPasswordHash, 'patient', '+15553334444', 'https://api.dicebear.com/7.x/adventurer/svg?seed=bob']
    );
    await dbRun(
      'INSERT INTO patients (id, address, latitude, longitude, emergency_contact, medical_history) VALUES (?, ?, ?, ?, ?, ?)',
      [patient2User.id, '1725 Slough Avenue, Scranton', 40.7306, -73.9352, 'Phyllis Vance (+15553335555)', 'Type 2 Diabetes. Requires daily blood sugar monitoring, insulin assistance, and wound care check-ups on foot ulcer.']
    );

    // 3. Seed Caregivers
    // Caregiver 1 - Registered Nurse
    const nurseUser = await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      ['Jane Doe, RN', 'jane@carenest.com', defaultPasswordHash, 'caregiver', '+15559998888', 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane']
    );
    await dbRun(
      'INSERT INTO caregivers (id, specialty, status, latitude, longitude, rating_avg, hourly_rate, verification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [nurseUser.id, 'Nurse', 'Available', 40.7150, -74.0090, 4.92, 45, 'Verified']
    );

    // Caregiver 2 - Physical Therapist
    const therapistUser = await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      ['Dr. John Smith, PT', 'john@carenest.com', defaultPasswordHash, 'caregiver', '+15558887777', 'https://api.dicebear.com/7.x/avataaars/svg?seed=john']
    );
    await dbRun(
      'INSERT INTO caregivers (id, specialty, status, latitude, longitude, rating_avg, hourly_rate, verification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [therapistUser.id, 'Therapist', 'Available', 40.7110, -74.0010, 4.85, 55, 'Verified']
    );

    // Caregiver 3 - Elderly Care Aide
    const elderUser = await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      ['Sarah Jenkins', 'sarah@carenest.com', defaultPasswordHash, 'caregiver', '+15557776666', 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah']
    );
    await dbRun(
      'INSERT INTO caregivers (id, specialty, status, latitude, longitude, rating_avg, hourly_rate, verification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [elderUser.id, 'ElderCare', 'Available', 40.7180, -74.0040, 4.98, 25, 'Verified']
    );

    // Caregiver 4 - Dementia Specialist
    const dementiaUser = await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      ['Michael Ross', 'mike@carenest.com', defaultPasswordHash, 'caregiver', '+15556665555', 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike']
    );
    await dbRun(
      'INSERT INTO caregivers (id, specialty, status, latitude, longitude, rating_avg, hourly_rate, verification_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [dementiaUser.id, 'DementiaCare', 'Offline', 40.7210, -74.0150, 4.78, 35, 'Verified']
    );

    console.log('PostgreSQL database successfully seeded with mock profiles.');
  } else {
    console.log('PostgreSQL users table already contains records. Skipping seed.');
  }
}
