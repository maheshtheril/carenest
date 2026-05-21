import { useState, useEffect, useCallback } from 'react';
import MapSimulator from './MapSimulator';
import { API_BASE } from '../config';


export default function CaregiverPortal({ user, socket, token, showToast, formatPrice }) {
  const [cgStatus, setCgStatus] = useState('Offline'); // Available, Offline, Busy
  const [activeJob, setActiveJob] = useState(null);
  const [jobOffer, setJobOffer] = useState(null);
  const [offerCountdown, setOfferCountdown] = useState(15);
  const [checklist, setChecklist] = useState([]);
  const [stats, setStats] = useState({ totalJobs: 0, totalEarnings: 0, recentJobs: [] });
  const [myLocation, setMyLocation] = useState({ lat: 40.7150, lng: -74.0090 }); // Default seeded Jane RN location

  // Fetch performance metrics and active jobs
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/caregivers/${user.id}/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch (e) {
      console.error(e);
    }
  }, [user.id, token]);

  const fetchChecklist = useCallback(async (bookingId) => {
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}/checklist`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setChecklist(data);
    } catch (e) {
      console.error(e);
    }
  }, [token]);

  const fetchActiveJob = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        const active = data.find(b => !['Completed', 'Cancelled'].includes(b.status));
        if (active) {
          setActiveJob(active);
          fetchChecklist(active.id);
          setCgStatus('Busy');
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, fetchChecklist]);

  // Sync initial caregiver properties
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user && user.details) {
        setCgStatus(user.details.status || 'Offline');
        setMyLocation({
          lat: user.details.latitude || 40.7150,
          lng: user.details.longitude || -74.0090
        });
      }
      fetchStats();
      fetchActiveJob();
    }, 0);
    return () => clearTimeout(timer);
  }, [user, fetchStats, fetchActiveJob]);

  const handleDeclineOffer = useCallback(() => {
    if (!socket || !jobOffer) return;
    socket.emit('decline_request', { bookingId: jobOffer.bookingId, caregiverId: user.id });
    setJobOffer(null);
  }, [socket, jobOffer, user.id]);

  const handleAcceptOffer = useCallback(() => {
    if (!socket || !jobOffer) return;
    socket.emit('accept_request', { bookingId: jobOffer.bookingId, caregiverId: user.id });
    
    // Optimistically set status
    setCgStatus('Busy');
    setJobOffer(null);
    fetchActiveJob();
  }, [socket, jobOffer, user.id, fetchActiveJob]);

  // Job Offer Countdown Timer
  useEffect(() => {
    let timer;
    if (jobOffer && offerCountdown > 0) {
      timer = setTimeout(() => {
        setOfferCountdown(prev => prev - 1);
      }, 1000);
    } else if (jobOffer && offerCountdown === 0) {
      // Auto-Decline on timeout
      setTimeout(() => handleDeclineOffer(), 0);
    }
    return () => clearTimeout(timer);
  }, [jobOffer, offerCountdown, handleDeclineOffer]);

  // Socket triggers
  useEffect(() => {
    if (!socket) return;

    const handleIncomingJobOffer = (offer) => {
      console.log('Incoming offer payload:', offer);
      setJobOffer(offer);
      setOfferCountdown(15);
    };

    const handleJobOfferRevoked = (data) => {
      if (jobOffer && jobOffer.bookingId === data.bookingId) {
        showToast('This booking request timed out or was assigned to another caregiver.', 'info');
        setJobOffer(null);
      }
    };

    const handleBookingCancelled = (data) => {
      if (activeJob && activeJob.id === data.bookingId) {
        showToast('Active patient care session has been cancelled.', 'info');
        setActiveJob(null);
        setCgStatus('Available');
        fetchStats();
      }
    };

    socket.on('incoming_job_offer', handleIncomingJobOffer);
    socket.on('job_offer_revoked', handleJobOfferRevoked);
    socket.on('booking_cancelled', handleBookingCancelled);

    return () => {
      socket.off('incoming_job_offer', handleIncomingJobOffer);
      socket.off('job_offer_revoked', handleJobOfferRevoked);
      socket.off('booking_cancelled', handleBookingCancelled);
    };
  }, [socket, jobOffer, activeJob, showToast, fetchStats]);

  // Toggle availability status in database
  const handleStatusToggle = async () => {
    const nextStatus = cgStatus === 'Offline' ? 'Available' : 'Offline';
    try {
      // We call a PUT endpoint `/api/caregivers/:id/status` on the backend
      const statusRes = await fetch(`${API_BASE}/api/caregivers/${user.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });
      
      if (statusRes.ok) {
        setCgStatus(nextStatus);
      } else {
        // Fallback for demo
        setCgStatus(nextStatus);
      }
    } catch (e) {
      console.error(e);
      // Fallback
      setCgStatus(nextStatus);
    }
  };

  // Simulating movement updates
  const handleLocationUpdate = useCallback((lat, lng) => {
    setMyLocation({ lat, lng });
    if (!socket) return;
    
    socket.emit('update_location', {
      caregiverId: user.id,
      latitude: lat,
      longitude: lng,
      bookingId: activeJob?.id
    });
  }, [socket, user.id, activeJob?.id]);

  const handleStartWorkflow = (nextStatus) => {
    if (!socket || !activeJob) return;

    socket.emit('update_job_status', {
      bookingId: activeJob.id,
      status: nextStatus,
      caregiverId: user.id
    });

    setActiveJob(prev => ({ ...prev, status: nextStatus }));

    if (nextStatus === 'Completed') {
      setActiveJob(null);
      setCgStatus('Available');
      setChecklist([]);
      fetchStats();
    }
  };

  const toggleChecklistItem = async (itemId, isCompleted) => {
    const nextCompleted = isCompleted ? 0 : 1;
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${activeJob.id}/checklist/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_completed: nextCompleted })
      });
      if (res.ok) {
        fetchChecklist(activeJob.id);
        // Force sync checklist trigger to patient through socket
        socket.emit('update_job_status', {
          bookingId: activeJob.id,
          status: activeJob.status,
          caregiverId: user.id
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const allTasksCompleted = checklist.length > 0 && checklist.every(c => c.is_completed === 1);

  return (
    <div className="portal-grid">
      {/* Map simulator left column */}
      <div className="portal-left">
        <MapSimulator 
          caregiverLoc={{ lat: myLocation.lat, lng: myLocation.lng }}
          patientLoc={activeJob ? { lat: activeJob.pickup_latitude, lng: activeJob.pickup_longitude } : null}
          activeBooking={activeJob}
          onLocationUpdate={handleLocationUpdate}
          isCaregiverActive={true}
        />

      </div>

      {/* Dispatch console right column */}
      <div className="portal-right">
        {/* Offline/Online toggle if idle */}
        {!activeJob && (
          <div className="glass-panel" style={{ padding: '30px', textAlign: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '10px' }}>Availability Console</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              Set your state to Available to receive on-demand home care visits in this neighborhood.
            </p>
            
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: cgStatus === 'Available' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              padding: '8px 24px',
              borderRadius: '30px',
              border: `1px solid ${cgStatus === 'Available' ? 'var(--color-secondary)' : 'var(--border-glass)'}`,
              marginBottom: '20px'
            }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: cgStatus === 'Available' ? 'var(--color-secondary)' : 'var(--text-muted)',
                marginRight: '8px',
                display: 'inline-block'
              }}></span>
              <strong style={{ fontSize: '14px', textTransform: 'capitalize' }}>Status: {cgStatus}</strong>
            </div>

            <button 
              className="btn-primary" 
              onClick={handleStatusToggle}
              style={{
                background: cgStatus === 'Available' ? 'rgba(239, 68, 68, 0.2)' : 'var(--color-secondary)',
                color: cgStatus === 'Available' ? 'var(--color-danger)' : 'var(--bg-dark)',
                border: cgStatus === 'Available' ? '1px solid var(--color-danger)' : 'none',
                boxShadow: cgStatus === 'Available' ? 'none' : 'var(--shadow-glow)'
              }}
            >
              {cgStatus === 'Available' ? 'Go Offline' : 'Go Online'}
            </button>
          </div>
        )}

        {/* Earnings history moved to bottom sheet */}
        {!activeJob && (
          <div className="glass-panel" style={{ padding: '25px' }}>
            <h4 className="history-title">Visits & Earnings History</h4>
            <div className="stats-grid">
              <div className="stat-box">
                <span className="label">Total Payout</span>
                <div className="value">{formatPrice ? formatPrice(stats.totalEarnings) : `$${stats.totalEarnings}`}</div>
              </div>
              <div className="stat-box">
                <span className="label">Visits Completed</span>
                <div className="value">{stats.totalJobs}</div>
              </div>
            </div>
            
            <h5 style={{ fontSize: '14px', marginBottom: '12px' }}>Recent Payouts</h5>
            {stats.recentJobs && stats.recentJobs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No completed visits logged.</p>
            ) : (
              <div className="history-list">
                {stats.recentJobs && stats.recentJobs.map(j => (
                  <div className="history-card" key={j.id}>
                    <div className="history-info">
                      <h5>{j.patient_name}</h5>
                      <span className="date">ID: #{j.id} • Completed</span>
                    </div>
                    <div className="history-payout">{formatPrice ? formatPrice(j.payout) : `$${j.payout}`}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Job tracker */}
        {activeJob && (
          <div className="glass-panel active-match-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontFamily: 'var(--font-display)' }}>Patient Care Session</h3>
              <span className={`badge-status ${activeJob.status}`}>{activeJob.status}</span>
            </div>

            {/* Patient profile box */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border-glass)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                <img 
                  src={activeJob.patient_avatar || 'https://api.dicebear.com/7.x/adventurer/svg?seed=placeholder'} 
                  alt="Patient Avatar" 
                  style={{ width: '50px', height: '50px', borderRadius: '50%', border: '2px solid var(--color-secondary)' }}
                />
                <div>
                  <h4 style={{ fontSize: '16px' }}>{activeJob.patient_name || 'Patient'}</h4>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{activeJob.patient_phone || 'Emergency Contact'}</span>
                </div>
              </div>
              <h5 style={{ fontSize: '13px', marginBottom: '4px' }}>Address:</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>{activeJob.patient_address}</p>
              <h5 style={{ fontSize: '13px', marginBottom: '4px' }}>Medical History:</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{activeJob.medical_history || 'No medical record notes.'}</p>
            </div>

            {/* Checklist logger */}
            <div className="checklist-section" style={{ marginBottom: '25px' }}>
              <div className="checklist-title">
                <span>Clinical Tasks Checkoff</span>
                <span style={{ color: 'var(--color-secondary-light)' }}>
                  {checklist.filter(c => c.is_completed).length}/{checklist.length} Completed
                </span>
              </div>
              <ul className="checklist-list">
                {checklist.map(item => (
                  <li 
                    key={item.id} 
                    className={`checklist-item ${item.is_completed ? 'completed' : ''}`}
                    onClick={() => toggleChecklistItem(item.id, item.is_completed)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="checkbox-circle">
                      {item.is_completed === 1 && <div className="checkmark"></div>}
                    </div>
                    <span>{item.task_description}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Workflow Control Buttons */}
            {activeJob.status === 'Accepted' && (
              <button className="btn-primary" onClick={() => handleStartWorkflow('EnRoute')}>
                Depart for Patient Location
              </button>
            )}

            {activeJob.status === 'EnRoute' && (
              <button 
                className="btn-primary" 
                onClick={() => handleStartWorkflow('Arrived')}
                style={{ background: 'var(--color-accent)', boxShadow: 'none' }}
              >
                Simulate Arrival ("I Have Arrived")
              </button>
            )}

            {activeJob.status === 'Arrived' && (
              <button className="btn-primary" onClick={() => handleStartWorkflow('InProgress')}>
                Start Clinical Care
              </button>
            )}

            {activeJob.status === 'InProgress' && (
              <button 
                className="btn-primary" 
                disabled={!allTasksCompleted}
                onClick={() => handleStartWorkflow('Completed')}
                style={{ 
                  background: allTasksCompleted ? 'var(--color-secondary)' : 'rgba(255,255,255,0.05)',
                  color: allTasksCompleted ? 'var(--bg-dark)' : 'var(--text-muted)',
                  border: 'none',
                  cursor: allTasksCompleted ? 'pointer' : 'not-allowed',
                  boxShadow: allTasksCompleted ? 'var(--shadow-glow)' : 'none'
                }}
              >
                {allTasksCompleted ? 'Complete Session & Log Payout' : 'Complete All Checklist Tasks first'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Incoming job offer modal dialog */}
      {jobOffer && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel dispatch-alert">
            <div className="alert-circle">🔔</div>
            <h3 style={{ fontFamily: 'var(--font-display)' }}>INCOMING CARE REQUEST</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '8px 0 20px' }}>
              A patient requires a {jobOffer.serviceType} in your neighborhood immediate dispatch area.
            </p>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '15px',
              fontSize: '14px',
              textAlign: 'left',
              marginBottom: '20px'
            }}>
              <div><strong>Service:</strong> {jobOffer.serviceType} visit</div>
              <div style={{ marginTop: '6px' }}><strong>Est. Duration:</strong> 2 Hours Base</div>
              <div style={{ marginTop: '6px' }}><strong>Guaranteed Payout:</strong> <span style={{ color: 'var(--color-secondary-light)', fontWeight: 'bold' }}>{formatPrice ? formatPrice(user.details?.hourly_rate * 2 || 70) : `$${user.details?.hourly_rate * 2 || 70}`}</span></div>
            </div>

            <div className="alert-timer-container" style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" stroke="rgba(255,255,255,0.08)" stroke-width="6" fill="none" />
                <circle 
                  cx="60" 
                  cy="60" 
                  r="50" 
                  stroke="var(--color-secondary)" 
                  stroke-dasharray="314.16" 
                  stroke-dashoffset={(1 - offerCountdown / 15) * 314.16} 
                  stroke-width="6" 
                  fill="none" 
                  stroke-linecap="round" 
                  style={{ 
                    transition: 'stroke-dashoffset 1s linear', 
                    transform: 'rotate(-90deg)', 
                    transformOrigin: '60px 60px',
                    filter: 'drop-shadow(0 0 4px var(--color-secondary))'
                  }} 
                />
                <text x="60" y="68" text-anchor="middle" fill="white" font-size="24" font-weight="bold" font-family="var(--font-display)">
                  {offerCountdown}
                </text>
              </svg>
            </div>

            <div className="alert-actions">
              <button className="btn-danger" onClick={handleDeclineOffer}>Decline</button>
              <button className="btn-success" onClick={handleAcceptOffer}>Accept Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
