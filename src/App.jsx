import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import LandingPage from './components/LandingPage';
import CustomerPortal from './components/CustomerPortal';
import CaregiverPortal from './components/CaregiverPortal';
import AdminDashboard from './components/AdminDashboard';
import './App.css';
import { API_BASE } from './config';
import { EXCHANGE_RATES, COUNTRY_TO_CURRENCY, LOCALE_TO_CURRENCY } from './constants';

function App() {
  const [token, setToken] = useState(localStorage.getItem('carenest_token') || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('carenest_user')) || null);
  const [activeRole, setActiveRole] = useState(user?.role || null);
  const [socket, setSocket] = useState(null);
  
  // Dynamic currency states
  const [currency, setCurrency] = useState(localStorage.getItem('carenest_currency') || 'USD');

  // Custom Toast State
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove toast after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const handleCurrencyChange = (newCurrency) => {
    setCurrency(newCurrency);
    localStorage.setItem('carenest_currency', newCurrency);
    showToast(`Currency set to ${EXCHANGE_RATES[newCurrency].name}`, 'success');
  };

  // Automatically detect user location and locale
  const detectUserCurrency = useCallback(async () => {
    try {
      // 1. Try IP Geolocation API
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        const country = data.country_code;
        const guessed = COUNTRY_TO_CURRENCY[country];
        if (guessed) {
          setCurrency(guessed);
          localStorage.setItem('carenest_currency', guessed);
          showToast(`📍 Auto-detected location: ${data.city || data.country_name}. Switched currency to ${guessed} (${EXCHANGE_RATES[guessed].symbol})`, 'success');
          return;
        }
      }
    } catch {
      console.log('IP Geolocation failed or was blocked. Falling back to browser locale detection.');
    }

    // 2. Fallback to Browser Locale Detection
    const browserLocale = navigator.language || 'en-US';
    const cleanLocale = browserLocale.split('-')[0];
    const guessed = LOCALE_TO_CURRENCY[browserLocale] || LOCALE_TO_CURRENCY[cleanLocale] || 'USD';
    
    setCurrency(guessed);
    localStorage.setItem('carenest_currency', guessed);
    showToast(`🌐 System locale auto-detected: ${browserLocale}. Switched currency to ${guessed} (${EXCHANGE_RATES[guessed].symbol})`, 'info');
  }, [showToast]);

  // Auto-detect currency on first load
  useEffect(() => {
    if (!localStorage.getItem('carenest_currency')) {
      setTimeout(() => {
        detectUserCurrency();
      }, 0);
    }
  }, [detectUserCurrency]);


  // Convert and format USD values according to standard international formats
  const formatPrice = (usdAmount) => {
    const config = EXCHANGE_RATES[currency];
    const converted = usdAmount * config.rate;
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2
    }).format(converted);
  };

  // Sync token to localStorage
  const handleLoginSuccess = (newToken, loggedInUser) => {
    localStorage.setItem('carenest_token', newToken);
    localStorage.setItem('carenest_user', JSON.stringify(loggedInUser));
    setToken(newToken);
    setUser(loggedInUser);
    setActiveRole(loggedInUser.role);
    showToast(`Welcome back, ${loggedInUser.name}!`, 'success');
  };

  const handleLogout = () => {
    if (socket) {
      socket.disconnect();
    }
    localStorage.removeItem('carenest_token');
    localStorage.removeItem('carenest_user');
    setToken(null);
    setUser(null);
    setActiveRole(null);
    setSocket(null);
    showToast('Logged out successfully.', 'info');
  };

  // Socket Connection management
  useEffect(() => {
    if (!token || !user) return;

    const newSocket = io(API_BASE, {
      transports: ['websocket'],
      autoConnect: true
    });

    newSocket.on('connect', () => {
      console.log('Connected to CareNest WebSocket Server.');
      newSocket.emit('register_user', {
        userId: user.id,
        role: user.role
      });
    });

    setTimeout(() => {
      setSocket(newSocket);
    }, 0);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user]);

  return (
    <div className="app-container">
      {/* Toast Notification HUD */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-card toast-${t.type}`}>
            <span className="toast-icon">
              {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="toast-message">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Dev Mode Role Bar for convenient simulation testing */}
      {token && user && (
        <div className="role-switcher-bar">
          <div className="role-title">
            <span style={{ opacity: 0.7 }}>Logged in as:</span>
            <strong>{user.name}</strong>
            <span className="role-badge">{user.role}</span>
          </div>
          
          <div className="switcher-buttons">
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', marginRight: '6px' }}>
              Simulator Mode:
            </span>
            <button 
              className={`switch-btn ${activeRole === 'patient' ? 'active' : ''}`}
              onClick={() => setActiveRole('patient')}
            >
              Patient View
            </button>
            <button 
              className={`switch-btn ${activeRole === 'caregiver' ? 'active' : ''}`}
              onClick={() => setActiveRole('caregiver')}
            >
              Caregiver View
            </button>
            <button 
              className={`switch-btn ${activeRole === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveRole('admin')}
            >
              Admin Board
            </button>
          </div>
        </div>
      )}

      {/* Main navigation header */}
      <header className="main-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="logo" onClick={() => { if(!token) setActiveRole(null); }}>
          <div className="logo-icon">C</div>
          <span>CareNest</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Global Currency Picker */}
          <div className="currency-selector-wrapper">
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '6px' }}>Currency:</span>
            <select 
              value={currency} 
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="currency-select"
            >
              {Object.keys(EXCHANGE_RATES).map((code) => (
                <option key={code} value={code}>
                  {code} ({EXCHANGE_RATES[code].symbol})
                </option>
              ))}
            </select>
          </div>

          {token && user && (
            <div className="nav-user-profile">
              <img src={user.avatar_url} alt="Profile" className="user-avatar" />
              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '13px', marginRight: '10px' }}>
                <span style={{ fontWeight: 'bold' }}>{user.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.email}</span>
              </div>
              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content views rendering */}
      {!token ? (
        <LandingPage onLoginSuccess={handleLoginSuccess} showToast={showToast} formatPrice={formatPrice} currency={currency} />
      ) : (
        <>
          {activeRole === 'patient' && (
            <CustomerPortal 
              user={user} 
              socket={socket} 
              token={token} 
              onLogout={handleLogout} 
              showToast={showToast}
              formatPrice={formatPrice}
            />
          )}

          {activeRole === 'caregiver' && (
            <CaregiverPortal 
              user={user} 
              socket={socket} 
              token={token} 
              showToast={showToast}
              formatPrice={formatPrice}
            />
          )}

          {activeRole === 'admin' && (
            <AdminDashboard 
              token={token} 
              socket={socket} 
              showToast={showToast}
              formatPrice={formatPrice}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
