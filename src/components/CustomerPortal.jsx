import { useState, useEffect, useCallback } from 'react';
import MapSimulator from './MapSimulator';
import { API_BASE } from '../config';


export default function CustomerPortal({ user, socket, token, showToast, formatPrice }) {
  const [activeBooking, setActiveBooking] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedService, setSelectedService] = useState('Nurse');
  const [caregiverLoc, setCaregiverLoc] = useState(null);
  const [onlineCaregivers, setOnlineCaregivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Review Form States
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  
  const [checklist, setChecklist] = useState([]);

  const services = [
    { type: 'Nurse', name: 'Registered Nurse', icon: '🩺', rate: 45, desc: 'Wound care, vitals, meds' },
    { type: 'Therapist', name: 'Physical Therapist', icon: '🚶', rate: 55, desc: 'Mobility & physical rehab' },
    { type: 'ElderCare', name: 'Elderly Care Aide', icon: '👵', rate: 25, desc: 'Daily activities & companionship' },
    { type: 'DementiaCare', name: 'Dementia Specialist', icon: '🧠', rate: 35, desc: 'Cognitive aid & safety checks' }
  ];

  const currentServiceDetails = services.find(s => s.type === selectedService);

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

  // Fetch initial booking status and history
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch history
      const histRes = await fetch(`${API_BASE}/api/bookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const histData = await histRes.json();
      if (histRes.ok) {
        setHistory(histData);
        // Find if there is an active booking
        const active = histData.find(b => !['Completed', 'Cancelled'].includes(b.status));
        if (active) {
          setActiveBooking(active);
          fetchChecklist(active.id);
          if (active.caregiver_id) {
            // Get caregiver's location
            setCaregiverLoc({ lat: active.pickup_latitude + 0.005, lng: active.pickup_longitude + 0.005 });
          }
        } else {
          setActiveBooking(null);
        }
      }

      // 2. Fetch online caregivers for map seeding
      const cgRes = await fetch(`${API_BASE}/api/caregivers?status=Available`);
      const cgData = await cgRes.json();
      if (cgRes.ok) {
        setOnlineCaregivers(cgData);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      // 600ms premium transition delay
      setTimeout(() => setIsLoading(false), 600);
    }
  }, [token, fetchChecklist]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // WebSocket listeners
  useEffect(() => {
    if (!socket) return;

    const handleBookingCreated = (data) => {
      setActiveBooking(prev => ({ ...prev, id: data.bookingId, status: data.status }));
    };

    const handleBookingAccepted = (data) => {
      setActiveBooking(prev => ({ 
        ...prev, 
        id: data.bookingId, 
        status: data.status, 
        caregiver_name: data.caregiver.name,
        caregiver_avatar: data.caregiver.avatar_url,
        caregiver_phone: data.caregiver.phone,
        caregiver_specialty: data.caregiver.specialty,
        caregiver_rating_avg: data.caregiver.rating_avg
      }));
      setCaregiverLoc({ lat: data.caregiver.latitude, lng: data.caregiver.longitude });
      fetchChecklist(data.bookingId);
      showToast(`${data.caregiver.name} accepted your booking request!`, 'success');
    };

    const handleLocationSync = (data) => {
      setCaregiverLoc({ lat: data.latitude, lng: data.longitude });
    };

    const handleBookingStatusUpdated = (data) => {
      setActiveBooking(prev => {
        if (prev && prev.id === data.bookingId) {
          const updated = { ...prev, status: data.status };
          if (data.status === 'Completed') {
            setShowReviewModal(true);
            fetchData();
          } else {
            showToast(`Visit status updated: ${data.status}`, 'info');
          }
          return updated;
        }
        return prev;
      });
      fetchChecklist(data.bookingId);
    };

    const handleBookingCancelled = (data) => {
      if (activeBooking && activeBooking.id === data.bookingId) {
        showToast('Your care booking request was cancelled.', 'info');
        setActiveBooking(null);
        fetchData();
      }
    };

    const handleMatchingFailed = (data) => {
      showToast(data.reason, 'error');
      setActiveBooking(null);
      fetchData();
    };

    socket.on('booking_created', handleBookingCreated);
    socket.on('booking_accepted', handleBookingAccepted);
    socket.on('location_sync', handleLocationSync);
    socket.on('booking_status_updated', handleBookingStatusUpdated);
    socket.on('booking_cancelled', handleBookingCancelled);
    socket.on('matching_failed', handleMatchingFailed);

    return () => {
      socket.off('booking_created', handleBookingCreated);
      socket.off('booking_accepted', handleBookingAccepted);
      socket.off('location_sync', handleLocationSync);
      socket.off('booking_status_updated', handleBookingStatusUpdated);
      socket.off('booking_cancelled', handleBookingCancelled);
      socket.off('matching_failed', handleMatchingFailed);
    };
  }, [socket, activeBooking, showToast, fetchData, fetchChecklist]);

  const handleRequestCare = () => {
    if (!socket) return;

    const hourly = currentServiceDetails.rate;
    const estimatedPayout = hourly * 2;

    const patientLat = user.details?.latitude || 40.7128;
    const patientLng = user.details?.longitude || -74.0060;

    const bookingRequest = {
      patientId: user.id,
      serviceType: selectedService,
      pickupLatitude: patientLat,
      pickupLongitude: patientLng,
      payout: estimatedPayout
    };

    setActiveBooking({
      status: 'Requested',
      service_type: selectedService,
      payout: estimatedPayout,
      pickup_latitude: patientLat,
      pickup_longitude: patientLng
    });

    socket.emit('request_care', bookingRequest);
  };

  const handleCancelRequest = () => {
    if (!socket || !activeBooking?.id) {
      setActiveBooking(null);
      return;
    }
    socket.emit('cancel_booking', { bookingId: activeBooking.id, role: 'patient' });
    setActiveBooking(null);
  };

  const submitReview = async () => {
    if (!activeBooking) return;
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${activeBooking.id}/review`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ rating, review })
      });
      if (res.ok) {
        setShowReviewModal(false);
        setRating(5);
        setReview('');
        setActiveBooking(null);
        showToast('Thank you for your feedback!', 'success');
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 3D Tilt Card Event Listeners
  const handleMouseMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const xc = rect.width / 2;
    const yc = rect.height / 2;
    
    const angleX = -(y - yc) / 5;
    const angleY = (x - xc) / 5;
    
    card.style.setProperty('--rx', `${angleX}deg`);
    card.style.setProperty('--ry', `${angleY}deg`);
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--o', `1`);
  };

  const handleMouseLeave = (e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', `0deg`);
    card.style.setProperty('--ry', `0deg`);
    card.style.setProperty('--o', `0`);
  };

  const getStatusStepIndex = (status) => {
    const steps = ['Accepted', 'EnRoute', 'Arrived', 'InProgress', 'Completed'];
    return steps.indexOf(status);
  };

  return (
    <div className="portal-grid">
      {/* Map simulator left column */}
      <div className="portal-left">
        <MapSimulator 
          caregiverLoc={caregiverLoc}
          patientLoc={user.details ? { lat: user.details.latitude, lng: user.details.longitude } : { lat: 40.7128, lng: -74.0060 }}
          activeBooking={activeBooking}
          onLocationUpdate={() => {}}
          onlineCaregivers={onlineCaregivers}
        />
        
        {/* Booking History list below map */}
        <div className="glass-panel" style={{ padding: '25px' }}>
          <h4 className="history-title">Your Care History</h4>
          {isLoading ? (
            <div className="history-list">
              <div className="skeleton-card">
                <div className="skeleton-header">
                  <div className="skeleton-avatar" style={{ width: '38px', height: '38px' }}></div>
                  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div className="skeleton-line title" style={{ width: '50%' }}></div>
                    <div className="skeleton-line subtitle" style={{ width: '30%' }}></div>
                  </div>
                </div>
              </div>
              <div className="skeleton-card">
                <div className="skeleton-header">
                  <div className="skeleton-avatar" style={{ width: '38px', height: '38px' }}></div>
                  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div className="skeleton-line title" style={{ width: '65%' }}></div>
                    <div className="skeleton-line subtitle" style={{ width: '25%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          ) : history.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>No past bookings found.</p>
          ) : (
            <div className="history-list">
              {history.map(b => (
                <div className="history-card" key={b.id}>
                  <div className="history-info">
                    <h5>{b.service_type} - {b.caregiver_name || 'Caregiver'}</h5>
                    <span className="date">ID: #{b.id} • Status: <strong className={`badge-status ${b.status}`}>{b.status}</strong></span>
                    {b.patient_rating && (
                      <div style={{ color: 'var(--color-accent)', fontSize: '12px', marginTop: '4px' }}>
                        {'★'.repeat(b.patient_rating)}{'☆'.repeat(5 - b.patient_rating)}
                      </div>
                    )}
                  </div>
                  <div className="history-payout">{formatPrice ? formatPrice(b.payout) : `$${b.payout}`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Booking Form/Workflows right column */}
      <div className="portal-right">
        {!activeBooking ? (
          <div className="glass-panel booking-form">
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '20px' }}>Request Home Care</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '25px' }}>
              Select a clinical service. We will match you with the nearest qualified caregiver available.
            </p>

            <div className="service-selector">
              {services.map(s => (
                <div className="tilt-card-container" key={s.type}>
                  <div 
                    className={`service-option tilt-card ${selectedService === s.type ? 'selected' : ''}`}
                    onClick={() => setSelectedService(s.type)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                  >
                    <span className="icon">{s.icon}</span>
                    <span className="name">{s.name}</span>
                    <span className="rate">{formatPrice ? formatPrice(s.rate) : `$${s.rate}`}/hr</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-glass)',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '25px'
            }}>
              <h5 style={{ fontSize: '14px', marginBottom: '8px' }}>Service Detail Summary</h5>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>{currentServiceDetails.desc}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600' }}>
                <span>Estimated Payout (2h base):</span>
                <span style={{ color: 'var(--color-secondary-light)' }}>{formatPrice ? formatPrice(currentServiceDetails.rate * 2) : `$${currentServiceDetails.rate * 2}`}</span>
              </div>
            </div>

            <button className="btn-primary" onClick={handleRequestCare}>
              Request {currentServiceDetails.name}
            </button>
          </div>
        ) : activeBooking.status === 'Requested' ? (
          <div className="glass-panel matching-overlay">
            {/* Conic sweep radar with floating avatars */}
            <div className="matching-radar-container">
              <div className="matching-radar-sweep"></div>
              <div className="matching-radar-ring matching-radar-ring-1"></div>
              <div className="matching-radar-ring matching-radar-ring-2"></div>
              <div className="matching-radar-ring matching-radar-ring-3"></div>
              <div style={{ zIndex: 10, fontSize: '38px', animation: 'active-pulse 1.8s infinite' }}>🩺</div>
              
              <img 
                className="matching-avatar-floating" 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Jane" 
                style={{ '--tx': '-60px', '--ty': '-70px', animationDelay: '0s', left: '84px', top: '84px' }} 
              />
              <img 
                className="matching-avatar-floating" 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=John" 
                style={{ '--tx': '70px', '--ty': '-40px', animationDelay: '1.5s', left: '84px', top: '84px' }} 
              />
              <img 
                className="matching-avatar-floating" 
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Sara" 
                style={{ '--tx': '-20px', '--ty': '80px', animationDelay: '3.0s', left: '84px', top: '84px' }} 
              />
            </div>
            
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '10px' }}>Finding Your Caregiver</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '300px', margin: '0 auto' }}>
              Broadcasting your request to qualified {activeBooking.service_type}s nearby...
            </p>
            <button className="cancel-matching-btn" onClick={handleCancelRequest}>
              Cancel Request
            </button>
          </div>
        ) : (
          <div className="glass-panel active-match-panel">
            <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '20px' }}>Active Care Booking</h3>
            
            {/* Caregiver Profile Card */}
            <div className="caregiver-profile-card">
              <img 
                src={activeBooking.caregiver_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=placeholder'} 
                alt="Caregiver avatar"
                className="cg-card-avatar"
              />
              <div className="cg-card-info">
                <span className="specialty-badge">{activeBooking.caregiver_specialty || activeBooking.service_type}</span>
                <h4>{activeBooking.caregiver_name || 'Caregiver Assigned'}</h4>
                <div className="rating">
                  <span>★ {activeBooking.caregiver_rating_avg || '5.0'}</span>
                  <span style={{ color: 'var(--text-muted)' }}>• {activeBooking.caregiver_phone || 'Contact'}</span>
                </div>
              </div>
            </div>

            {/* Status Tracker */}
            <div className="status-tracker">
              <div className={`status-step ${getStatusStepIndex(activeBooking.status) >= 0 ? 'completed' : ''} ${activeBooking.status === 'Accepted' ? 'active' : ''}`}>
                <div className="status-dot"></div>
                <span className="status-label">Matched</span>
              </div>
              <div className={`status-step ${getStatusStepIndex(activeBooking.status) >= 1 ? 'completed' : ''} ${activeBooking.status === 'EnRoute' ? 'active' : ''}`}>
                <div className="status-dot"></div>
                <span className="status-label">En Route</span>
              </div>
              <div className={`status-step ${getStatusStepIndex(activeBooking.status) >= 2 ? 'completed' : ''} ${activeBooking.status === 'Arrived' ? 'active' : ''}`}>
                <div className="status-dot"></div>
                <span className="status-label">Arrived</span>
              </div>
              <div className={`status-step ${getStatusStepIndex(activeBooking.status) >= 3 ? 'completed' : ''} ${activeBooking.status === 'InProgress' ? 'active' : ''}`}>
                <div className="status-dot"></div>
                <span className="status-label">In Care</span>
              </div>
            </div>

            {/* Live checklist (Syncs checklist in real-time) */}
            <div className="checklist-section">
              <div className="checklist-title">
                <span>Care Tasks Log</span>
                <span style={{ color: 'var(--color-secondary-light)' }}>
                  {checklist.filter(c => c.is_completed).length}/{checklist.length} Completed
                </span>
              </div>
              
              <ul className="checklist-list">
                {checklist.map(item => (
                  <li key={item.id} className={`checklist-item ${item.is_completed ? 'completed' : ''}`}>
                    <div className="checkbox-circle" style={{ cursor: 'default' }}>
                      {item.is_completed && <div className="checkmark"></div>}
                    </div>
                    <span>{item.task_description}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <button className="cancel-matching-btn" onClick={handleCancelRequest} style={{ width: '100%', marginTop: '20px' }}>
              Cancel Care Session
            </button>
          </div>
        )}
      </div>

      {/* Rating Review Modal */}
      {showReviewModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3 style={{ fontFamily: 'var(--font-display)', textAlign: 'center', marginBottom: '10px' }}>Care Session Completed!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginBottom: '20px' }}>
              How was your service with {activeBooking?.caregiver_name}?
            </p>
            
            <div className="stars-rating">
              {[1,2,3,4,5].map(star => (
                <span 
                  key={star} 
                  className={`star ${rating >= star ? 'active' : ''}`}
                  onClick={() => setRating(star)}
                >
                  ★
                </span>
              ))}
            </div>

            <div className="form-group">
              <label>Leave Feedback / Review Notes</label>
              <textarea 
                className="form-control" 
                rows="3" 
                value={review}
                onChange={e => setReview(e.target.value)}
                placeholder="Share your experience (optional)..."
              ></textarea>
            </div>

            <button className="btn-primary" onClick={submitReview} style={{ marginTop: '10px' }}>
              Submit Feedback & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
