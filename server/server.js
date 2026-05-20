import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import {
  initDb,
  dbRun,
  dbGet,
  dbAll
} from './db.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT']
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'carenest-secret-key-321-abc';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'carenest-secret-key-321-abc')) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is required and must not be default in production mode!');
  process.exit(1);
}

// Helmet for security headers (permissive CSP to allow Leaflet maps and external avatar images)
app.use(helmet({
  contentSecurityPolicy: false
}));

// CORS setup
app.use(cors());
app.use(express.json());

// Rate limiting setup
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15, // Limit login/register to 15 requests per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login or registration attempts, please try again after 15 minutes' }
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Await database connection on startup before listening
const startServer = async () => {
  try {
    await initDb();
    server.listen(PORT, () => {
      console.log(`CareNest backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('FATAL: Database initialization failed. Exiting.', err);
    process.exit(1);
  }
};
startServer();

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access token required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
    }
    next();
  };
};

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

// User Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    let details = {};
    if (user.role === 'patient') {
      details = await dbGet('SELECT * FROM patients WHERE id = ?', [user.id]) || {};
    } else if (user.role === 'caregiver') {
      details = await dbGet('SELECT * FROM caregivers WHERE id = ?', [user.id]) || {};
    }

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar_url: user.avatar_url,
        details
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register User (Patient/Caregiver)
app.post('/api/auth/register', async (req, res) => {
  const { 
    name, email, password, role, phone, 
    specialty, hourly_rate, address, latitude, longitude, 
    emergency_contact, medical_history,
    license_number, license_state, experience_years, bio
  } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, email, password and role are required' });
  }

  try {
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const avatar = `https://api.dicebear.com/7.x/${role === 'caregiver' ? 'avataaars' : 'adventurer'}/svg?seed=${name.replace(/\s+/g, '')}`;

    const result = await dbRun(
      'INSERT INTO users (name, email, password_hash, role, phone, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hash, role, phone || '', avatar]
    );
    const userId = result.id;

    if (role === 'patient') {
      await dbRun(
        'INSERT INTO patients (id, address, latitude, longitude, emergency_contact, medical_history) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, address || '', latitude || 40.7128, longitude || -74.0060, emergency_contact || '', medical_history || '']
      );
    } else if (role === 'caregiver') {
      await dbRun(
        'INSERT INTO caregivers (id, specialty, status, latitude, longitude, rating_avg, hourly_rate, verification_status, license_number, license_state, experience_years, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, specialty || 'Nurse', 'Available', latitude || 40.7128, longitude || -74.0060, 5.0, hourly_rate || 35, 'Verified', license_number || '', license_state || '', parseInt(experience_years) || 1, bio || '']
      );
    }

    res.status(201).json({ message: 'User registered successfully', userId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Online/Available Caregivers (Admin / Patient dispatch map)
// If authenticated, returns contact details. Otherwise, sanitizes them for public search.
app.get('/api/caregivers', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  let isAuthenticated = false;

  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      isAuthenticated = true;
    } catch {
      // Invalid token, treat as unauthenticated
    }
  }

  const { status, specialty } = req.query;
  const selectFields = isAuthenticated
    ? 'u.id, u.name, u.email, u.phone, u.avatar_url, c.specialty, c.status, c.latitude, c.longitude, c.rating_avg, c.hourly_rate'
    : 'u.id, u.name, NULL as email, NULL as phone, u.avatar_url, c.specialty, c.status, c.latitude, c.longitude, c.rating_avg, c.hourly_rate';

  let query = `
    SELECT ${selectFields}
    FROM users u 
    JOIN caregivers c ON u.id = c.id
  `;
  const params = [];

  if (status || specialty) {
    query += ' WHERE';
    const conditions = [];
    if (status) {
      conditions.push(' c.status = ?');
      params.push(status);
    }
    if (specialty) {
      conditions.push(' c.specialty = ?');
      params.push(specialty);
    }
    query += conditions.join(' AND');
  }

  try {
    const list = await dbAll(query, params);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Patients list (Admin panel) - Restricted to Admin role
app.get('/api/patients', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const list = await dbAll(`
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, p.address, p.latitude, p.longitude, p.emergency_contact, p.medical_history
      FROM users u
      JOIN patients p ON u.id = p.id
    `);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a booking manually/REST (usually handled via Socket request_care)
app.post('/api/bookings', authenticateToken, async (req, res) => {
  const { caregiver_id, service_type, pickup_latitude, pickup_longitude, payout } = req.body;
  const patient_id = req.user.id;

  try {
    const result = await dbRun(
      'INSERT INTO bookings (patient_id, caregiver_id, service_type, status, payout, pickup_latitude, pickup_longitude) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [patient_id, caregiver_id || null, service_type, 'Requested', payout, pickup_latitude, pickup_longitude]
    );

    // Create checklists automatically
    const checklist = getChecklistForService(service_type);
    for (const item of checklist) {
      await dbRun('INSERT INTO booking_checklist (booking_id, task_description) VALUES (?, ?)', [result.id, item]);
    }

    res.status(201).json({ bookingId: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bookings for logged-in user
app.get('/api/bookings', authenticateToken, async (req, res) => {
  const { id, role } = req.user;
  
  try {
    let query = '';
    if (role === 'patient') {
      query = `
        SELECT b.*, u.name as caregiver_name, u.avatar_url as caregiver_avatar, c.specialty as caregiver_specialty, u.phone as caregiver_phone
        FROM bookings b
        LEFT JOIN users u ON b.caregiver_id = u.id
        LEFT JOIN caregivers c ON b.caregiver_id = c.id
        WHERE b.patient_id = ?
        ORDER BY b.id DESC
      `;
    } else if (role === 'caregiver') {
      query = `
        SELECT b.*, u.name as patient_name, u.avatar_url as patient_avatar, u.phone as patient_phone, p.address as patient_address, p.medical_history
        FROM bookings b
        JOIN users u ON b.patient_id = u.id
        JOIN patients p ON b.patient_id = p.id
        WHERE b.caregiver_id = ?
        ORDER BY b.id DESC
      `;
    } else { // Admin
      query = `
        SELECT b.*, p_u.name as patient_name, c_u.name as caregiver_name, c.specialty as caregiver_specialty
        FROM bookings b
        JOIN users p_u ON b.patient_id = p_u.id
        LEFT JOIN users c_u ON b.caregiver_id = c_u.id
        LEFT JOIN caregivers c ON b.caregiver_id = c.id
        ORDER BY b.id DESC
      `;
    }
    const params = role === 'admin' ? [] : [id];
    const list = await dbAll(query, params);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get detailed booking checklist
app.get('/api/bookings/:id/checklist', authenticateToken, async (req, res) => {
  try {
    const list = await dbAll('SELECT * FROM booking_checklist WHERE booking_id = ?', [req.params.id]);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update single checklist item completion status
app.put('/api/bookings/:id/checklist/:itemId', authenticateToken, async (req, res) => {
  const { is_completed } = req.body;
  const completed_at = is_completed ? new Date().toISOString() : null;

  try {
    await dbRun(
      'UPDATE booking_checklist SET is_completed = ?, completed_at = ? WHERE id = ? AND booking_id = ?',
      [is_completed ? 1 : 0, completed_at, req.params.itemId, req.params.id]
    );
    res.json({ message: 'Checklist item updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rate and review a caregiver after completion
app.post('/api/bookings/:id/review', authenticateToken, async (req, res) => {
  const { rating, review } = req.body;
  const bookingId = req.params.id;

  try {
    const booking = await dbGet('SELECT caregiver_id FROM bookings WHERE id = ?', [bookingId]);
    if (!booking || !booking.caregiver_id) {
      return res.status(404).json({ error: 'Booking or assigned caregiver not found' });
    }

    await dbRun(
      'UPDATE bookings SET patient_rating = ?, patient_review = ? WHERE id = ?',
      [rating, review, bookingId]
    );

    // Recalculate average caregiver score
    const avgScore = await dbGet(
      'SELECT AVG(patient_rating) as avg FROM bookings WHERE caregiver_id = ? AND patient_rating IS NOT NULL',
      [booking.caregiver_id]
    );

    if (avgScore && avgScore.avg) {
      await dbRun('UPDATE caregivers SET rating_avg = ? WHERE id = ?', [avgScore.avg.toFixed(2), booking.caregiver_id]);
    }

    res.json({ message: 'Review submitted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoint to get system performance analytics - Restricted to Admin role
app.get('/api/admin/analytics', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const totalBookings = await dbGet('SELECT COUNT(*) as count FROM bookings');
    const completedBookings = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE status = 'Completed'");
    const activeBookings = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE status NOT IN ('Completed', 'Cancelled')");
    const grossEarnings = await dbGet("SELECT SUM(payout) as sum FROM bookings WHERE status = 'Completed'");
    const onlineCaregivers = await dbGet("SELECT COUNT(*) as count FROM caregivers WHERE status != 'Offline'");

    res.json({
      totalBookings: totalBookings.count,
      completedBookings: completedBookings.count,
      activeBookings: activeBookings.count,
      grossEarnings: grossEarnings.sum || 0,
      onlineCaregivers: onlineCaregivers.count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Caregiver stats - Restricted to Admin or the matching Caregiver
app.get('/api/caregivers/:id/stats', authenticateToken, async (req, res) => {
  const caregiverId = parseInt(req.params.id);
  
  if (req.user.role !== 'admin' && req.user.id !== caregiverId) {
    return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
  }

  try {
    const totalJobs = await dbGet("SELECT COUNT(*) as count FROM bookings WHERE caregiver_id = ? AND status = 'Completed'", [caregiverId]);
    const totalEarnings = await dbGet("SELECT SUM(payout) as sum FROM bookings WHERE caregiver_id = ? AND status = 'Completed'", [caregiverId]);
    
    // Weekly earnings group helper (mocked groupings or simple summary for now)
    const recentJobs = await dbAll(
      `SELECT b.*, u.name as patient_name 
       FROM bookings b 
       JOIN users u ON b.patient_id = u.id 
       WHERE b.caregiver_id = ? AND b.status = 'Completed' 
       ORDER BY b.id DESC LIMIT 5`,
      [caregiverId]
    );

    res.json({
      totalJobs: totalJobs.count,
      totalEarnings: totalEarnings.sum || 0,
      recentJobs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update caregiver status (Online/Offline) - Restricted to Admin or the matching Caregiver
app.put('/api/caregivers/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  const caregiverId = parseInt(req.params.id);

  if (req.user.role !== 'admin' && req.user.id !== caregiverId) {
    return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
  }

  if (!['Available', 'Offline', 'Busy'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }

  try {
    await dbRun('UPDATE caregivers SET status = ? WHERE id = ?', [status, caregiverId]);
    res.json({ message: 'Status updated successfully', status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Helper checklists builder
function getChecklistForService(serviceType) {
  switch (serviceType) {
    case 'Nurse':
      return [
        'Check patient vital signs (pulse, respiration, temperature, blood pressure)',
        'Administer scheduled medications / check pill organizer',
        'Inspect, clean, and dress minor wounds if needed',
        'Review food and water intake logs',
        'Update caregiver daily progress notes'
      ];
    case 'Therapist':
      return [
        'Review target range-of-motion metrics',
        'Perform 20 mins of physical stretching exercises',
        'Guide balance and gait stability training',
        'Demonstrate home physical therapy protocols for patient/family',
        'Log progress in musculoskeletal assessment chart'
      ];
    case 'ElderCare':
      return [
        'Assist with safe transfer (bed to wheelchair/chair)',
        'Prepare healthy meal and assist with eating',
        'Help with bathroom safety and personal hygiene routine',
        'Guide minor cognitive stimulation exercises (reading, conversation)',
        'Organize and tidy room/sleeping quarters'
      ];
    case 'DementiaCare':
      return [
        'Verify immediate orientation clues are clear (clocks, calendar)',
        'Accompany patient on safe sensory walk',
        'Provide gentle validation and positive re-direction sessions',
        'Check house locks and safety alarm compliance',
        'Engage in memory association puzzle or photo album recall'
      ];
    default:
      return [
        'Check physical status',
        'Verify medicine compliance',
        'Record general notes'
      ];
  }
}

// ----------------------------------------------------
// REAL-TIME WEBSOCKET DISPATCH ENGINE (SOCKET.IO)
// ----------------------------------------------------

const activeMatches = new Map(); // bookingId -> Timeout/State
const socketToUser = new Map();  // socketId -> {userId, role}
const userToSocket = new Map();  // userId -> socketId

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Identify socket with user session
  socket.on('register_user', ({ userId, role }) => {
    socketToUser.set(socket.id, { userId, role });
    userToSocket.set(userId, socket.id);
    
    // Join specific rooms
    socket.join(`user:${userId}`);
    socket.join(`role:${role}`);
    console.log(`User ${userId} (${role}) registered on socket ${socket.id}`);
    
    // Broadcast active caregivers count update to admin room
    if (role === 'caregiver') {
      io.to('role:admin').emit('system_alert', { type: 'caregiver_online', caregiverId: userId });
    }
  });

  // Client requests a caregiver (like requesting an Uber)
  socket.on('request_care', async (data) => {
    const { patientId, serviceType, pickupLatitude, pickupLongitude, payout } = data;
    console.log(`Booking request received from Patient ${patientId} for ${serviceType}`);

    try {
      // 1. Create a database record for booking
      const result = await dbRun(
        'INSERT INTO bookings (patient_id, service_type, status, payout, pickup_latitude, pickup_longitude) VALUES (?, ?, ?, ?, ?, ?)',
        [patientId, serviceType, 'Requested', payout, pickupLatitude, pickupLongitude]
      );
      const bookingId = result.id;

      // Seed Checklist
      const checklist = getChecklistForService(serviceType);
      for (const item of checklist) {
        await dbRun('INSERT INTO booking_checklist (booking_id, task_description) VALUES (?, ?)', [bookingId, item]);
      }

      // Notify patient of initial booking registration
      socket.emit('booking_created', { bookingId, status: 'Requested' });
      io.to('role:admin').emit('booking_created', { bookingId, status: 'Requested', patientId, serviceType });

      // 2. Dispatch algorithm: Find closest online available caregiver of correct specialty
      matchCaregiverForBooking(bookingId, serviceType, pickupLatitude, pickupLongitude);
    } catch (err) {
      console.error('Failed to create booking:', err);
      socket.emit('booking_error', { message: 'Failed to request care service' });
    }
  });

  // Caregiver accepts job offer
  socket.on('accept_request', async ({ bookingId, caregiverId }) => {
    console.log(`Caregiver ${caregiverId} accepted booking ${bookingId}`);
    
    // Clear dispatch timer
    if (activeMatches.has(bookingId)) {
      clearTimeout(activeMatches.get(bookingId));
      activeMatches.delete(bookingId);
    }

    try {
      const now = new Date().toISOString();
      // Update Booking
      await dbRun(
        'UPDATE bookings SET caregiver_id = ?, status = ?, accepted_at = ? WHERE id = ?',
        [caregiverId, 'Accepted', now, bookingId]
      );
      // Update Caregiver status to Busy
      await dbRun("UPDATE caregivers SET status = 'Busy' WHERE id = ?", [caregiverId]);

      // Fetch patient & caregiver records to return detailed socket event
      const booking = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      const caregiverInfo = await dbGet(`
        SELECT u.name, u.avatar_url, u.phone, c.specialty, c.rating_avg, c.latitude, c.longitude
        FROM users u JOIN caregivers c ON u.id = c.id WHERE u.id = ?
      `, [caregiverId]);

      // Send confirmation to patient and caregiver
      io.to(`user:${booking.patient_id}`).emit('booking_accepted', {
        bookingId,
        status: 'Accepted',
        caregiver: {
          id: caregiverId,
          ...caregiverInfo
        }
      });

      socket.emit('job_confirmed', { bookingId, status: 'Accepted', booking });
      
      // Notify admins
      io.to('role:admin').emit('booking_updated', { bookingId, status: 'Accepted', caregiverId });
    } catch (err) {
      console.error('Failed to process booking acceptance:', err);
      socket.emit('booking_error', { message: 'Could not accept this booking.' });
    }
  });

  // Caregiver declines job offer
  socket.on('decline_request', ({ bookingId, caregiverId }) => {
    console.log(`Caregiver ${caregiverId} declined booking ${bookingId}`);
    handleDecline(bookingId, caregiverId);
  });

  // Caregiver location updates (sent continuously as they navigate)
  socket.on('update_location', async ({ caregiverId, latitude, longitude, bookingId }) => {
    try {
      // Update database coordinates
      await dbRun('UPDATE caregivers SET latitude = ?, longitude = ? WHERE id = ?', [latitude, longitude, caregiverId]);

      // Broadcast coordinates
      // 1. To Admins
      io.to('role:admin').emit('caregiver_moved', { caregiverId, latitude, longitude, bookingId });

      // 2. To active patient tracking this booking
      if (bookingId) {
        const booking = await dbGet('SELECT patient_id FROM bookings WHERE id = ?', [bookingId]);
        if (booking) {
          io.to(`user:${booking.patient_id}`).emit('location_sync', { caregiverId, latitude, longitude });
        }
      }
    } catch (err) {
      console.error('Location sync database error:', err);
    }
  });

  // Caregiver updates job status (EnRoute, Arrived, InProgress, Completed)
  socket.on('update_job_status', async ({ bookingId, status, caregiverId }) => {
    console.log(`Booking ${bookingId} status update to ${status} by caregiver ${caregiverId}`);
    
    try {
      const now = new Date().toISOString();
      let updateFields = 'status = ?';
      const params = [status];

      if (status === 'InProgress') {
        updateFields += ', started_at = ?';
        params.push(now);
      } else if (status === 'Completed') {
        updateFields += ', completed_at = ?';
        params.push(now);
      }
      params.push(bookingId);

      await dbRun(`UPDATE bookings SET ${updateFields} WHERE id = ?`, params);

      if (status === 'Completed') {
        // Return caregiver to Available status
        await dbRun("UPDATE caregivers SET status = 'Available' WHERE id = ?", [caregiverId]);
      }

      // Notify Patient
      const booking = await dbGet('SELECT patient_id FROM bookings WHERE id = ?', [bookingId]);
      io.to(`user:${booking.patient_id}`).emit('booking_status_updated', { bookingId, status });
      
      // Notify Admin
      io.to('role:admin').emit('booking_updated', { bookingId, status });
    } catch (err) {
      console.error('Failed status update:', err);
    }
  });

  // Force cancel booking (called by admin or customer)
  socket.on('cancel_booking', async ({ bookingId, role }) => {
    console.log(`Booking ${bookingId} cancelled by ${role}`);
    try {
      const booking = await dbGet('SELECT patient_id, caregiver_id FROM bookings WHERE id = ?', [bookingId]);
      if (booking) {
        await dbRun("UPDATE bookings SET status = 'Cancelled' WHERE id = ?", [bookingId]);
        if (booking.caregiver_id) {
          await dbRun("UPDATE caregivers SET status = 'Available' WHERE id = ?", [booking.caregiver_id]);
          io.to(`user:${booking.caregiver_id}`).emit('booking_cancelled', { bookingId });
        }
        io.to(`user:${booking.patient_id}`).emit('booking_cancelled', { bookingId });
        io.to('role:admin').emit('booking_updated', { bookingId, status: 'Cancelled' });
      }
    } catch (err) {
      console.error('Cancellation error:', err);
    }
  });

  // User disconnects
  socket.on('disconnect', () => {
    const userMeta = socketToUser.get(socket.id);
    if (userMeta) {
      console.log(`User ${userMeta.userId} disconnected.`);
      userToSocket.delete(userMeta.userId);
      socketToUser.delete(socket.id);
      
      if (userMeta.role === 'caregiver') {
        // Go offline in DB on logout/close
        dbRun("UPDATE caregivers SET status = 'Offline' WHERE id = ?", [userMeta.userId]).catch(e => console.error(e));
        io.to('role:admin').emit('system_alert', { type: 'caregiver_offline', caregiverId: userMeta.userId });
      }
    }
  });
});

// Dispatch Algorithm: Finds closest caregiver and alerts them, or rolls to next
async function matchCaregiverForBooking(bookingId, serviceType, pickupLat, pickupLng, excludedCaregivers = []) {
  try {
    const booking = await dbGet('SELECT status FROM bookings WHERE id = ?', [bookingId]);
    if (!booking || booking.status !== 'Requested') {
      return; // Already matched or cancelled
    }

    // SQLite Euclidean Distance approximation
    let query = `
      SELECT c.id, c.latitude, c.longitude, c.hourly_rate, u.name
      FROM caregivers c
      JOIN users u ON c.id = u.id
      WHERE c.status = 'Available' AND c.specialty = ?
    `;
    const params = [serviceType];

    if (excludedCaregivers.length > 0) {
      query += ` AND c.id NOT IN (${excludedCaregivers.map(() => '?').join(',')})`;
      params.push(...excludedCaregivers);
    }

    const availableCaregivers = await dbAll(query, params);

    if (availableCaregivers.length === 0) {
      console.log(`No caregivers of type ${serviceType} available for booking ${bookingId}`);
      // Notify patient no matching caregiver is available
      const bookingRecord = await dbGet('SELECT patient_id FROM bookings WHERE id = ?', [bookingId]);
      io.to(`user:${bookingRecord.patient_id}`).emit('matching_failed', { bookingId, reason: 'No caregivers available nearby. Please try again later.' });
      await dbRun("UPDATE bookings SET status = 'Cancelled' WHERE id = ?", [bookingId]);
      io.to('role:admin').emit('booking_updated', { bookingId, status: 'Cancelled' });
      return;
    }

    // Find mathematically closest caregiver
    let closestCaregiver = null;
    let minDistance = Infinity;

    for (const caregiver of availableCaregivers) {
      const distance = Math.sqrt(
        Math.pow(caregiver.latitude - pickupLat, 2) + 
        Math.pow(caregiver.longitude - pickupLng, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestCaregiver = caregiver;
      }
    }

    if (closestCaregiver) {
      console.log(`Offering booking ${bookingId} to caregiver ${closestCaregiver.name} (ID: ${closestCaregiver.id})`);
      
      const socketId = userToSocket.get(closestCaregiver.id);
      if (socketId) {
        // Send push alert via WS
        io.to(socketId).emit('incoming_job_offer', {
          bookingId,
          pickupLatitude: pickupLat,
          pickupLongitude: pickupLng,
          serviceType
        });
      }

      // Schedule job timeout (if they don't accept in 15 seconds, decline automatically)
      const timeoutId = setTimeout(() => {
        console.log(`Booking ${bookingId} offer timed out for caregiver ${closestCaregiver.id}`);
        handleDecline(bookingId, closestCaregiver.id, excludedCaregivers);
      }, 15000);

      activeMatches.set(bookingId, timeoutId);
    }
  } catch (err) {
    console.error('Error matching caregiver:', err);
  }
}

// Handle decline/timeout of job offer
async function handleDecline(bookingId, caregiverId, excludedCaregivers = []) {
  if (activeMatches.has(bookingId)) {
    clearTimeout(activeMatches.get(bookingId));
    activeMatches.delete(bookingId);
  }

  // Send decline notification to caregiver
  const cgSocket = userToSocket.get(caregiverId);
  if (cgSocket) {
    io.to(cgSocket).emit('job_offer_revoked', { bookingId });
  }

  // Push caregiver to exclusion list and re-match
  const nextExclusions = [...excludedCaregivers, caregiverId];
  const booking = await dbGet('SELECT * FROM bookings WHERE id = ?', [bookingId]);
  
  if (booking && booking.status === 'Requested') {
    matchCaregiverForBooking(bookingId, booking.service_type, booking.pickup_latitude, booking.pickup_longitude, nextExclusions);
  }
}

// Serve Vite frontend static assets in production mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

app.use(express.static(distPath));

// Fallback for SPA routing: send index.html for all non-API paths
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Server startup listener is now handled in startServer() wrapper above.
