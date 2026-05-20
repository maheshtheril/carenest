import { useState } from 'react';
import { API_BASE } from '../config';


export default function LandingPage({ onLoginSuccess, formatPrice }) {
  const [role, setRole] = useState(null); // 'patient', 'caregiver', 'admin'
  const [isRegister, setIsRegister] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Patient fields
  const [address, setAddress] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');

  // Caregiver fields
  const [specialty, setSpecialty] = useState('Nurse');
  const [hourlyRate, setHourlyRate] = useState(35);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseState, setLicenseState] = useState('');
  const [experienceYears, setExperienceYears] = useState(2);
  const [bio, setBio] = useState('');
  
  // Mock file uploads
  const [licenseFile, setLicenseFile] = useState(null);
  const [idFile, setIdFile] = useState(null);
  const [backgroundConsent, setBackgroundConsent] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRoleSelection = (selectedRole) => {
    setRole(selectedRole);
    setIsRegister(false);
    setRegStep(1);
    setError('');
    // Auto-fill admin credentials for easy local testing
    if (selectedRole === 'admin') {
      setEmail('admin@carenest.com');
      setPassword('carenest123');
    } else {
      setEmail('');
      setPassword('');
      setName('');
      setPhone('');
    }
  };

  const getPasswordStrength = (pass) => {
    if (!pass) return { score: 0, label: 'None', color: '#ef4444' };
    let score = 0;
    if (pass.length >= 6) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    
    if (score <= 1) return { score, label: 'Weak', color: '#ef4444', percent: '25%' };
    if (score === 2) return { score, label: 'Fair', color: '#f59e0b', percent: '50%' };
    if (score === 3) return { score, label: 'Good', color: '#6366f1', percent: '75%' };
    return { score, label: 'Strong', color: '#10b981', percent: '100%' };
  };

  const passInfo = getPasswordStrength(password);

  const handleNextStep = (e) => {
    e.preventDefault();
    setError('');

    // Validation per step
    if (regStep === 1) {
      if (!name || !email || !password || !phone) {
        setError('Please fill in all account fields.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      setRegStep(2);
    } else if (regStep === 2 && role === 'caregiver') {
      if (!licenseNumber || !licenseState) {
        setError('License credentials are required for verification.');
        return;
      }
      setRegStep(3);
    }
  };

  const handlePrevStep = () => {
    setError('');
    setRegStep(prev => Math.max(1, prev - 1));
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const url = isRegister 
      ? `${API_BASE}/api/auth/register` 
      : `${API_BASE}/api/auth/login`;

    const payload = isRegister 
      ? {
          name,
          email,
          password,
          role,
          phone,
          ...(role === 'patient' ? { address, medical_history: medicalHistory, emergency_contact: emergencyContact } : {}),
          ...(role === 'caregiver' ? { 
            specialty, 
            hourly_rate: parseInt(hourlyRate),
            license_number: licenseNumber,
            license_state: licenseState,
            experience_years: parseInt(experienceYears),
            bio
          } : {})
        }
      : { email, password };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (isRegister) {
        setIsRegister(false);
        setRegStep(1);
        setPassword('');
        setError('Registration successful! Please login with your credentials.');
        setLoading(false);
      } else {
        onLoginSuccess(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Drag and drop mock triggers
  const handleMockUpload = (type) => {
    if (type === 'license') {
      setLicenseFile({ name: `${specialty}_License_Cert.pdf`, size: '2.4 MB' });
    } else {
      setIdFile({ name: 'Govt_Issued_ID.jpg', size: '1.8 MB' });
    }
  };

  return (
    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
      {!role ? (
        <>
          <div className="landing-hero">
            <div className="hero-tag">On-Demand Care Network</div>
            <h1>
              Professional Care, <span className="gradient-text">Dispatched in Minutes</span>
            </h1>
            <p>
              CareNest connects qualified registered nurses, physical therapists, and elderly care companions with patients requiring specialized home care. Track caregiver arrivals in real-time.
            </p>
          </div>

          <div className="landing-cards">
            {/* Card 1: Patient */}
            <div className="landing-card glass-panel" onClick={() => handleRoleSelection('patient')}>
              <div>
                <div className="card-icon-wrapper">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  </svg>
                </div>
                <h3>I Need Care</h3>
                <p>Request specialized nursing, mobility assistance, physical therapy, or companion care for you or your loved ones immediately.</p>
              </div>
              <span className="action-link">
                Request Services
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </span>
            </div>

            {/* Card 2: Caregiver */}
            <div className="landing-card glass-panel" onClick={() => handleRoleSelection('caregiver')}>
              <div>
                <div className="card-icon-wrapper">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                  </svg>
                </div>
                <h3>I Want to Work</h3>
                <p>Are you a Registered Nurse, Physical Therapist, or Care Aide? Sign up to accept home visits, manage check-lists, and track earnings.</p>
              </div>
              <span className="action-link">
                Join Network
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </span>
            </div>

            {/* Card 3: Admin */}
            <div className="landing-card glass-panel" onClick={() => handleRoleSelection('admin')}>
              <div>
                <div className="card-icon-wrapper">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </div>
                <h3>Platform Admin</h3>
                <p>Simulate caregiver coordinates, override dispatch, trigger emergencies, monitor server logs, and see global network volume metrics.</p>
              </div>
              <span className="action-link">
                Admin Console
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="auth-container">
          <div className="auth-box glass-panel" style={{ maxWidth: (isRegister && role === 'caregiver') ? '550px' : '450px', transition: 'all 0.3s ease' }}>
            <button className="switch-btn" onClick={() => setRole(null)} style={{ marginBottom: '15px' }}>
              &larr; Back to Roles
            </button>
            
            <h2 className="auth-title">
              {role === 'admin' ? 'Administrator Portal' : isRegister ? 'Clinical Registration' : 'Welcome Back'}
            </h2>
            <p className="auth-subtitle">
              {role === 'admin' 
                ? 'Sign in to access system simulator controls' 
                : `Portal access verification for CareNest ${role === 'patient' ? 'Patients' : 'Certified Caregivers'}`}
            </p>

            {/* Stepper progress indicator dots */}
            {isRegister && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '25px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyCenter: 'center',
                  background: regStep >= 1 ? 'var(--color-secondary)' : 'rgba(255, 255, 255, 0.05)',
                  color: 'white', fontSize: '11px', fontWeight: 'bold', justifyContent: 'center'
                }}>1</div>
                <div style={{ width: '40px', height: '2px', background: regStep >= 2 ? 'var(--color-secondary)' : 'rgba(255, 255, 255, 0.05)' }}></div>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyCenter: 'center',
                  background: regStep >= 2 ? 'var(--color-secondary)' : 'rgba(255, 255, 255, 0.05)',
                  color: 'white', fontSize: '11px', fontWeight: 'bold', justifyContent: 'center'
                }}>2</div>
                {role === 'caregiver' && (
                  <>
                    <div style={{ width: '40px', height: '2px', background: regStep >= 3 ? 'var(--color-secondary)' : 'rgba(255, 255, 255, 0.05)' }}></div>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyCenter: 'center',
                      background: regStep >= 3 ? 'var(--color-secondary)' : 'rgba(255, 255, 255, 0.05)',
                      color: 'white', fontSize: '11px', fontWeight: 'bold', justifyContent: 'center'
                    }}>3</div>
                  </>
                )}
              </div>
            )}

            {error && (
              <div style={{
                background: error.includes('successful') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${error.includes('successful') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: error.includes('successful') ? 'var(--color-secondary-light)' : 'var(--color-danger)',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '13px',
                textAlign: 'center'
              }}>
                {error}
              </div>
            )}

            {/* A. Login View */}
            {!isRegister ? (
              <form onSubmit={handleAuthSubmit}>
                <div className="form-group">
                  <label>Email Address</label>
                  <input 
                    type="email" 
                    className="form-control" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder="Enter registered email" 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    className="form-control" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    required 
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '10px' }}>
                  {loading ? 'Verifying...' : 'Sign In'}
                </button>
              </form>
            ) : (
              /* B. Registration Stepper Views */
              <form onSubmit={handleAuthSubmit}>
                {/* STEP 1: Basic Account Setup (Shared) */}
                {regStep === 1 && (
                  <div>
                    <h4 style={{ fontSize: '14px', marginBottom: '15px', color: 'var(--color-secondary-light)' }}>Step 1: Account Identification</h4>
                    <div className="form-group">
                      <label>Full Legal Name</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        placeholder="e.g. Dr. Jane Doe" 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>Professional Email Address</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        placeholder="name@institution.com" 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>Mobile Number</label>
                      <input 
                        type="tel" 
                        className="form-control" 
                        value={phone} 
                        onChange={(e) => setPhone(e.target.value)} 
                        placeholder="+1 (555) 000-0000" 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>Access Password</label>
                      <input 
                        type="password" 
                        className="form-control" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        placeholder="Choose complex password" 
                        required 
                      />
                      {password && (
                        <div style={{ marginTop: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                            <span>Password Strength: <strong>{passInfo.label}</strong></span>
                          </div>
                          <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: passInfo.percent, background: passInfo.color, transition: 'all 0.3s ease' }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <button type="button" className="btn-primary" onClick={handleNextStep} style={{ marginTop: '15px' }}>
                      Next: Details &amp; Verification &rarr;
                    </button>
                  </div>
                )}

                {/* STEP 2: Clinical Details / Address Profiles */}
                {regStep === 2 && role === 'patient' && (
                  <div>
                    <h4 style={{ fontSize: '14px', marginBottom: '15px', color: 'var(--color-secondary-light)' }}>Step 2: Medical Profile &amp; Location</h4>
                    <div className="form-group">
                      <label>Physical Home Address (For Routing)</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={address} 
                        onChange={(e) => setAddress(e.target.value)} 
                        placeholder="Street, Springfield" 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>Emergency Primary Contact</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={emergencyContact} 
                        onChange={(e) => setEmergencyContact(e.target.value)} 
                        placeholder="Full Name (Contact Number)" 
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label>Medical History Details / Nurse Notes</label>
                      <textarea 
                        className="form-control" 
                        rows="4" 
                        value={medicalHistory} 
                        onChange={(e) => setMedicalHistory(e.target.value)} 
                        placeholder="List active prescriptions, respiratory/cardiac health constraints, mobility assistance guidelines, or allergies..."
                      ></textarea>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                      <button type="button" className="btn-secondary" onClick={handlePrevStep} style={{ flex: 1 }}>
                        &larr; Back
                      </button>
                      <button type="submit" className="btn-primary" disabled={loading} style={{ flex: 2 }}>
                        {loading ? 'Saving Profile...' : 'Complete Registration'}
                      </button>
                    </div>
                  </div>
                )}

                {regStep === 2 && role === 'caregiver' && (
                  <div>
                    <h4 style={{ fontSize: '14px', marginBottom: '15px', color: 'var(--color-secondary-light)' }}>Step 2: Clinical Credentials</h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="form-group">
                        <label>Specialty License</label>
                        <select 
                          className="form-control" 
                          value={specialty} 
                          onChange={(e) => setSpecialty(e.target.value)}
                        >
                          <option value="Nurse">Registered Nurse (RN)</option>
                          <option value="Therapist">Physical Therapist (PT)</option>
                          <option value="ElderCare">Elderly Care Companion</option>
                          <option value="DementiaCare">Dementia Specialist Aide</option>
                        </select>
                      </div>
                      
                      <div className="form-group">
                        <label>Experience (Years)</label>
                        <input 
                          type="number" 
                          className="form-control" 
                          value={experienceYears} 
                          onChange={(e) => setExperienceYears(e.target.value)} 
                          min="1" 
                          max="40" 
                          required 
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="form-group">
                        <label>State License Number</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          value={licenseNumber} 
                          onChange={(e) => setLicenseNumber(e.target.value)} 
                          placeholder="e.g. RN-982410-TX" 
                          required 
                        />
                      </div>
                      <div className="form-group">
                        <label>State of Licensure</label>
                        <input 
                          type="text" 
                          className="form-control" 
                          value={licenseState} 
                          onChange={(e) => setLicenseState(e.target.value)} 
                          placeholder="e.g. Texas" 
                          required 
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <label>Base Hourly Booking Rate</label>
                        <span style={{ color: 'var(--color-secondary-light)', fontWeight: 'bold' }}>{formatPrice ? formatPrice(hourlyRate) : `$${hourlyRate}`}/hour</span>
                      </div>
                      <input 
                        type="range" 
                        min="20" 
                        max="150" 
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        style={{ width: '100%', accentColor: 'var(--color-secondary)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                      <button type="button" className="btn-secondary" onClick={handlePrevStep} style={{ flex: 1 }}>
                        &larr; Back
                      </button>
                      <button type="button" className="btn-primary" onClick={handleNextStep} style={{ flex: 2 }}>
                        Next: Background Verification &rarr;
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Verification / Document Uploads (Caregiver Only) */}
                {regStep === 3 && role === 'caregiver' && (
                  <div>
                    <h4 style={{ fontSize: '14px', marginBottom: '15px', color: 'var(--color-secondary-light)' }}>Step 3: Identity &amp; Background Verification</h4>
                    
                    <div className="form-group">
                      <label>Clinical Biography (Bio Summary)</label>
                      <textarea 
                        className="form-control" 
                        rows="3" 
                        value={bio} 
                        onChange={(e) => setBio(e.target.value)} 
                        maxLength="300"
                        placeholder="Write a brief professional summary that patients will see when you are matched (max 300 chars)..."
                      ></textarea>
                      <div style={{ textAlign: 'right', fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {bio.length} / 300 characters
                      </div>
                    </div>

                    {/* Drag-and-drop License upload block */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <label style={{ fontSize: '12px', marginBottom: '6px', display: 'block' }}>Board Certification / License</label>
                        {!licenseFile ? (
                          <div 
                            onClick={() => handleMockUpload('license')}
                            style={{
                              border: '1px dashed rgba(255,255,255,0.15)',
                              borderRadius: '8px', padding: '15px', textAlign: 'center', cursor: 'pointer',
                              background: 'rgba(255,255,255,0.01)', fontSize: '11px', color: 'var(--text-muted)',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--color-secondary)'}
                            onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
                          >
                            📁 Drop License here or <strong style={{ color: 'var(--color-secondary-light)' }}>Upload</strong>
                          </div>
                        ) : (
                          <div style={{
                            border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)',
                            borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px'
                          }}>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>✓ {licenseFile.name}</span>
                            <span style={{ color: 'var(--color-secondary-light)', cursor: 'pointer' }} onClick={() => setLicenseFile(null)}>✕</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ fontSize: '12px', marginBottom: '6px', display: 'block' }}>Government ID / Driver's License</label>
                        {!idFile ? (
                          <div 
                            onClick={() => handleMockUpload('id')}
                            style={{
                              border: '1px dashed rgba(255,255,255,0.15)',
                              borderRadius: '8px', padding: '15px', textAlign: 'center', cursor: 'pointer',
                              background: 'rgba(255,255,255,0.01)', fontSize: '11px', color: 'var(--text-muted)',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.borderColor = 'var(--color-secondary)'}
                            onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
                          >
                            🪪 Drop ID Document here or <strong style={{ color: 'var(--color-secondary-light)' }}>Upload</strong>
                          </div>
                        ) : (
                          <div style={{
                            border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)',
                            borderRadius: '8px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px'
                          }}>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }}>✓ {idFile.name}</span>
                            <span style={{ color: 'var(--color-secondary-light)', cursor: 'pointer' }} onClick={() => setIdFile(null)}>✕</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '20px' }}>
                      <input 
                        type="checkbox" 
                        id="backgroundCheck" 
                        checked={backgroundConsent}
                        onChange={e => setBackgroundConsent(e.target.checked)}
                        style={{ marginTop: '3px', accentColor: 'var(--color-secondary)' }}
                        required
                      />
                      <label htmlFor="backgroundCheck" style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4', cursor: 'pointer' }}>
                        I authorize CareNest to conduct background screening queries, verification of board license certifications, and medical history audits.
                      </label>
                    </div>

                    <div style={{ display: 'flex', gap: '15px' }}>
                      <button type="button" className="btn-secondary" onClick={handlePrevStep} style={{ flex: 1 }}>
                        &larr; Back
                      </button>
                      <button type="submit" className="btn-primary" disabled={loading || !backgroundConsent} style={{ flex: 2 }}>
                        {loading ? 'Submitting File audits...' : 'Submit Profile Application'}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}

            {/* Auth view togglers (Sign in <=> Register) */}
            {role !== 'admin' && (
              <div className="auth-footer">
                {isRegister ? (
                  <>
                    Already have an account? <span onClick={() => { setIsRegister(false); setRegStep(1); }}>Sign In</span>
                  </>
                ) : (
                  <>
                    Don't have a CareNest account? <span onClick={() => { setIsRegister(true); setRegStep(1); }}>Register Now</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
