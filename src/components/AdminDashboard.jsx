import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config';


export default function AdminDashboard({ token, socket, formatPrice }) {
  const [metrics, setMetrics] = useState({ totalBookings: 0, completedBookings: 0, activeBookings: 0, grossEarnings: 0, onlineCaregivers: 0 });
  const [caregivers, setCaregivers] = useState([]);
  const [patients, setPatients] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeBookingsList, setActiveBookingsList] = useState([]);

  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]); // cap logs at 50 entries
  }, []);

  // Fetch admin metrics
  const fetchAdminData = useCallback(async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      // 1. Fetch metrics
      const metricsRes = await fetch(`${API_BASE}/api/admin/analytics`, { headers });
      const metricsData = await metricsRes.json();
      if (metricsRes.ok) setMetrics(metricsData);

      // 2. Fetch caregivers
      const cgRes = await fetch(`${API_BASE}/api/caregivers`, { headers });
      const cgData = await cgRes.json();
      if (cgRes.ok) setCaregivers(cgData);

      // 3. Fetch patients
      const ptRes = await fetch(`${API_BASE}/api/patients`, { headers });
      const ptData = await ptRes.json();
      if (ptRes.ok) setPatients(ptData);

      // 4. Fetch all bookings
      const bkRes = await fetch(`${API_BASE}/api/bookings`, { headers });
      const bkData = await bkRes.json();
      if (bkRes.ok) {
        setActiveBookingsList(bkData.filter(b => !['Completed', 'Cancelled'].includes(b.status)));
      }
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAdminData();
      addLog('System initialized. Waiting for WebSocket events...');
    }, 0);

    const interval = setInterval(fetchAdminData, 5000); // refresh registries periodically
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchAdminData, addLog]);

  // WebSockets administrative listeners
  useEffect(() => {
    if (!socket) return;

    const handleBookingCreated = (data) => {
      addLog(`[DISPATCH] Booking #${data.bookingId} requested for ${data.serviceType} by Patient ID: ${data.patientId}`);
      fetchAdminData();
    };

    const handleBookingUpdated = (data) => {
      addLog(`[BOOKING] Booking #${data.bookingId} status changed to: ${data.status} ${data.caregiverId ? `(Caregiver: ${data.caregiverId})` : ''}`);
      fetchAdminData();
    };

    const handleSystemAlert = (data) => {
      if (data.type === 'caregiver_online') {
        addLog(`[NETWORK] Caregiver ID: ${data.caregiverId} registered online.`);
      } else if (data.type === 'caregiver_offline') {
        addLog(`[NETWORK] Caregiver ID: ${data.caregiverId} went offline.`);
      }
      fetchAdminData();
    };

    socket.on('booking_created', handleBookingCreated);
    socket.on('booking_updated', handleBookingUpdated);
    socket.on('system_alert', handleSystemAlert);

    return () => {
      socket.off('booking_created', handleBookingCreated);
      socket.off('booking_updated', handleBookingUpdated);
      socket.off('system_alert', handleSystemAlert);
    };
  }, [socket, addLog, fetchAdminData]);

  const handleSpawnCaregiver = async () => {
    const firstNames = ['Emily', 'David', 'Sophia', 'James', 'Mia', 'Robert'];
    const lastNames = ['Clark', 'Baker', 'Green', 'Stewart', 'Bell', 'Campbell'];
    const specialties = ['Nurse', 'Therapist', 'ElderCare', 'DementiaCare'];
    
    const randomName = `${firstNames[Math.floor(Math.random()*firstNames.length)]} ${lastNames[Math.floor(Math.random()*lastNames.length)]}`;
    const randomEmail = `${randomName.toLowerCase().replace(/\s/g, '')}@carenest.com`;
    const randomSpecialty = specialties[Math.floor(Math.random()*specialties.length)];
    const randomRate = randomSpecialty === 'Nurse' ? 45 : randomSpecialty === 'Therapist' ? 55 : randomSpecialty === 'ElderCare' ? 25 : 35;
    
    // Coordinates within Springfield map bounding box
    const randLat = 40.7128 + (Math.random() - 0.5) * 0.015;
    const randLng = -74.0060 + (Math.random() - 0.5) * 0.015;

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: randomName,
          email: randomEmail,
          password: 'carenest123',
          role: 'caregiver',
          phone: `+1555${Math.floor(1000000 + Math.random()*9000000)}`,
          specialty: randomSpecialty,
          hourly_rate: randomRate,
          latitude: randLat,
          longitude: randLng
        })
      });

      if (res.ok) {
        addLog(`[SIMULATOR] Spawned new caregiver "${randomName}" (${randomSpecialty}) at coordinate [${randLat.toFixed(4)}, ${randLng.toFixed(4)}]`);
        fetchAdminData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleForceCancelJob = (bookingId) => {
    if (!socket) return;
    socket.emit('cancel_booking', { bookingId, role: 'admin' });
    addLog(`[SIMULATOR] Force cancelled Booking #${bookingId}`);
    fetchAdminData();
  };

  // Math plotting logic for interactive bezier curve chart
  const currentGross = metrics.grossEarnings || 0;
  const maxScaleVal = Math.max(600, currentGross * 1.2); // scale dynamically with earnings growth
  const computeYCoordinate = (val) => {
    return Math.max(20, Math.min(170, 170 - (val / maxScaleVal) * 140));
  };

  // 7-day revenue points structure
  const chartPoints = [
    { x: 60, y: computeYCoordinate(120), label: 'Mon', val: 120 },
    { x: 145, y: computeYCoordinate(240), label: 'Tue', val: 240 },
    { x: 230, y: computeYCoordinate(190), label: 'Wed', val: 190 },
    { x: 315, y: computeYCoordinate(340), label: 'Thu', val: 340 },
    { x: 400, y: computeYCoordinate(280), label: 'Fri', val: 280 },
    { x: 485, y: computeYCoordinate(460), label: 'Sat', val: 460 },
    { x: 570, y: computeYCoordinate(currentGross), label: 'Sun (Today)', val: currentGross }
  ];

  // Draw smooth cubic bezier curve
  const pathD = `M ${chartPoints[0].x} ${chartPoints[0].y} ` + 
    chartPoints.slice(1).map((p, i) => {
      const prev = chartPoints[i];
      const cpX1 = prev.x + (p.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (p.x - prev.x) / 2;
      const cpY2 = p.y;
      return `C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p.x} ${p.y}`;
    }).join(' ');

  const areaD = `${pathD} L ${chartPoints[chartPoints.length-1].x} 170 L ${chartPoints[0].x} 170 Z`;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      {/* 1. Metric widgets */}
      <div className="admin-metrics">
        <div className="glass-panel stat-box">
          <span className="label">Total Bookings</span>
          <div className="value">{metrics.totalBookings}</div>
        </div>
        <div className="glass-panel stat-box">
          <span className="label">Gross Revenue</span>
          <div className="value" style={{ color: 'var(--color-secondary-light)' }}>{formatPrice ? formatPrice(metrics.grossEarnings) : `$${metrics.grossEarnings}`}</div>
        </div>
        <div className="glass-panel stat-box">
          <span className="label">Active Sessions</span>
          <div className="value" style={{ color: 'var(--color-accent)' }}>{metrics.activeBookings}</div>
        </div>
        <div className="glass-panel stat-box">
          <span className="label">Nurses / Companions Online</span>
          <div className="value">{metrics.onlineCaregivers}</div>
        </div>
      </div>

      {/* 2. Interactive SVG Bezier Chart */}
      <div className="chart-container-panel glass-panel">
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '16px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Platform Revenue Trend</span>
          <span style={{ fontSize: '11px', color: 'var(--color-secondary-light)', fontWeight: 'bold', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '12px' }}>
            Live Syncing
          </span>
        </h3>
        <div style={{ height: '220px', width: '100%' }}>
          <svg viewBox="0 0 630 200" className="chart-svg" style={{ width: '100%', height: '100%' }}>
            <defs>
              <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-secondary)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="chartLineGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-secondary)" />
                <stop offset="100%" stopColor="var(--color-secondary-light)" />
              </linearGradient>
            </defs>
            
            {/* Grid Y lines */}
            <line x1="50" y1="30" x2="590" y2="30" className="chart-grid-line" />
            <line x1="50" y1="76" x2="590" y2="76" className="chart-grid-line" />
            <line x1="50" y1="123" x2="590" y2="123" className="chart-grid-line" />
            <line x1="50" y1="170" x2="590" y2="170" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
            
            {/* Y Scale coordinates */}
            <text x="38" y="34" fill="var(--text-muted)" fontSize="9" textAnchor="end">{formatPrice ? formatPrice(Math.round(maxScaleVal)) : `$${Math.round(maxScaleVal)}`}</text>
            <text x="38" y="80" fill="var(--text-muted)" fontSize="9" textAnchor="end">{formatPrice ? formatPrice(Math.round(maxScaleVal * 0.66)) : `$${Math.round(maxScaleVal * 0.66)}`}</text>
            <text x="38" y="127" fill="var(--text-muted)" fontSize="9" textAnchor="end">{formatPrice ? formatPrice(Math.round(maxScaleVal * 0.33)) : `$${Math.round(maxScaleVal * 0.33)}`}</text>
            <text x="38" y="174" fill="var(--text-muted)" fontSize="9" textAnchor="end">{formatPrice ? formatPrice(0) : '$0'}</text>

            {/* Glowing Gradient Area fill */}
            <path d={areaD} fill="url(#chartGlow)" className="chart-area-fill" />

            {/* Main Bezier Line */}
            <path d={pathD} fill="none" stroke="url(#chartLineGrad)" strokeWidth="3" className="chart-line-gradient" />

            {/* Floating Data Points circles */}
            {chartPoints.map((p, idx) => (
              <g key={idx}>
                <circle 
                  cx={p.x} 
                  cy={p.y} 
                  r="5" 
                  fill="var(--bg-dark)" 
                  stroke="var(--color-secondary)" 
                  strokeWidth="2" 
                  className="chart-dot"
                >
                  <title>{p.label}: {formatPrice ? formatPrice(p.val) : `$${p.val}`}</title>
                </circle>
                <text x={p.x} y="190" fill="var(--text-muted)" fontSize="10" textAnchor="middle">{p.label}</text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* 3. Simulator Panel & Logs row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
        {/* Simulator controls */}
        <div className="glass-panel simulator-controls">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
            Platform Simulator Toolkit
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '8px' }}>
            Administrative sandbox triggers to test scaling, dispatch flows, and multi-actor WebSockets:
          </p>
          
          <div className="sim-btn-group">
            <button className="sim-btn" onClick={handleSpawnCaregiver}>
              Spawn Random Caregiver
            </button>
            
            {activeBookingsList.map(b => (
              <button 
                key={b.id} 
                className="sim-btn" 
                onClick={() => handleForceCancelJob(b.id)}
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: 'var(--color-danger)' }}
              >
                Force Cancel Booking #{b.id}
              </button>
            ))}

            {activeBookingsList.length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
                No active bookings to intercept.
              </span>
            )}
          </div>
        </div>

        {/* Real-time System Logger */}
        <div className="glass-panel log-panel">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}>WebSocket Network Logs</h3>
          <div className="log-content">
            {logs.map((log, idx) => (
              <div className="log-row" key={idx}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Caregivers and Patients Database Registry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Caregiver roster */}
        <div className="glass-panel" style={{ padding: '25px', maxHeight: '400px', overflowY: 'auto' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '15px' }}>Caregiver Registry</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-glass)' }}>
                <th style={{ padding: '10px' }}>Name</th>
                <th style={{ padding: '10px' }}>Specialty</th>
                <th style={{ padding: '10px' }}>Status</th>
                <th style={{ padding: '10px' }}>Rate</th>
                <th style={{ padding: '10px' }}>Rating</th>
              </tr>
            </thead>
            <tbody>
              {caregivers.map(cg => (
                <tr key={cg.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  <td style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src={cg.avatar_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                    {cg.name}
                  </td>
                  <td style={{ padding: '10px' }}>{cg.specialty}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ 
                      color: cg.status === 'Available' ? 'var(--color-secondary-light)' : cg.status === 'Busy' ? 'var(--color-accent)' : 'var(--text-muted)',
                      fontWeight: 'bold'
                    }}>
                      {cg.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px' }}>{formatPrice ? formatPrice(cg.hourly_rate) : `$${cg.hourly_rate}`}/hr</td>
                  <td style={{ padding: '10px', color: 'var(--color-accent)' }}>★ {cg.rating_avg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Patient list */}
        <div className="glass-panel" style={{ padding: '25px', maxHeight: '400px', overflowY: 'auto' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', marginBottom: '15px' }}>Patient Registry</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-glass)' }}>
                <th style={{ padding: '10px' }}>Name</th>
                <th style={{ padding: '10px' }}>Home Address</th>
                <th style={{ padding: '10px' }}>Emergency Contact</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(pt => (
                <tr key={pt.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  <td style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img src={pt.avatar_url} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                    {pt.name}
                  </td>
                  <td style={{ padding: '10px' }}>{pt.address}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{pt.emergency_contact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
