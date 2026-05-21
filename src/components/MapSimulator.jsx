import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icon asset resolution issues in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function MapSimulator({ 
  caregiverLoc, 
  patientLoc, 
  activeBooking, 
  onLocationUpdate, 
  isCaregiverActive = false, 
  onlineCaregivers = [] 
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  
  // Layers references to easily clear/re-add
  const markersRef = useRef({});
  const routePolylineRef = useRef(null);
  const onlineCgMarkersRef = useRef([]);

  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [navigatingIndex, setNavigatingIndex] = useState(-1);

  // 1. Initialize Map instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialLat = patientLoc?.lat || caregiverLoc?.lat || 40.7128;
    const initialLng = patientLoc?.lng || caregiverLoc?.lng || -74.0060;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      zoomControl: true,
      fadeAnimation: true
    });

    // Standard bright map tiles for maximum visibility
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    mapRef.current = map;

    // Fix dynamic container size calculation bug
    const sizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(sizeTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Plot Patient and Primary Caregiver markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    if (markersRef.current.patient) {
      map.removeLayer(markersRef.current.patient);
      delete markersRef.current.patient;
    }
    if (markersRef.current.caregiver) {
      map.removeLayer(markersRef.current.caregiver);
      delete markersRef.current.caregiver;
    }

    const patientIcon = L.divIcon({
      className: 'custom-patient-marker',
      html: `
        <div style="position: relative;">
          <div style="background-color: var(--color-primary); width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 12px var(--color-primary);"></div>
          <span style="position: absolute; left: 18px; top: -3px; background: rgba(0,0,0,0.85); color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-glass); white-space: nowrap; font-weight: bold;">
            Patient Home
          </span>
        </div>
      `,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const caregiverIcon = L.divIcon({
      className: 'custom-caregiver-marker',
      html: `
        <div style="position: relative;">
          <div style="background: var(--gradient-secondary); width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--color-secondary-light); box-shadow: 0 0 15px var(--color-secondary); display: flex; align-items: center; justify-content: center; font-size: 13px;">
            🩺
          </div>
          <span style="position: absolute; left: 32px; top: 3px; background: rgba(0,0,0,0.85); color: var(--color-secondary-light); font-size: 10px; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--color-secondary); white-space: nowrap; font-weight: bold;">
            Caregiver
          </span>
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const bounds = [];

    if (patientLoc) {
      const patientMarker = L.marker([patientLoc.lat, patientLoc.lng], { icon: patientIcon }).addTo(map);
      markersRef.current.patient = patientMarker;
      bounds.push([patientLoc.lat, patientLoc.lng]);
    }

    if (caregiverLoc) {
      const caregiverMarker = L.marker([caregiverLoc.lat, caregiverLoc.lng], { icon: caregiverIcon }).addTo(map);
      markersRef.current.caregiver = caregiverMarker;
      bounds.push([caregiverLoc.lat, caregiverLoc.lng]);
    }

    // Fit map view bounds to show both markers
    if (bounds.length > 0) {
      // If single point, just pan center
      if (bounds.length === 1) {
        map.panTo(bounds[0]);
      } else {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [patientLoc, caregiverLoc]);

  // 3. Draw Route Path using Open Source Routing Machine (OSRM)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old line
    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    if (!patientLoc || !caregiverLoc || !activeBooking || activeBooking.status === 'Requested') {
      setTimeout(() => setRouteCoordinates([]), 0);
      return;
    }

    const fetchOSRMRoute = async () => {
      // OSRM requires coordinates in lng,lat format
      const url = `https://router.project-osrm.org/route/v1/driving/${caregiverLoc.lng},${caregiverLoc.lat};${patientLoc.lng},${patientLoc.lat}?geometries=geojson&overview=full`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes[0]) {
          const coords = data.routes[0].geometry.coordinates.map(pt => [pt[1], pt[0]]); // convert to [lat, lng]
          setRouteCoordinates(coords);
          
          // Draw new line with primary glow color
          const polyline = L.polyline(coords, {
            color: 'var(--color-secondary-light)',
            weight: 4,
            opacity: 0.8,
            dashArray: '5, 8'
          }).addTo(map);
          routePolylineRef.current = polyline;
        }
      } catch (err) {
        console.error('Failed to query OSRM routing engine:', err);
      }
    };

    fetchOSRMRoute();
  }, [patientLoc, caregiverLoc, activeBooking]);

  // 4. Render all online available caregivers (for patient dashboard before requesting)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeBooking) {
      // Clear all online caregiver markers when booking becomes active
      onlineCgMarkersRef.current.forEach(m => map.removeLayer(m));
      onlineCgMarkersRef.current = [];
      return;
    }

    // Clear old markers
    onlineCgMarkersRef.current.forEach(m => map.removeLayer(m));
    onlineCgMarkersRef.current = [];

    const availableIcon = L.divIcon({
      className: 'available-cg-leaflet-icon',
      html: `
        <div class="available-cg-icon">
          <div class="available-cg-dot"></div>
          <div class="available-cg-radar"></div>
        </div>
      `,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const newMarkers = onlineCaregivers.map(cg => {
      const marker = L.marker([cg.latitude, cg.longitude], { icon: availableIcon })
        .addTo(map)
        .bindPopup(`<strong>${cg.name}</strong><br>${cg.specialty} (${cg.status})`);
      return marker;
    });

    onlineCgMarkersRef.current = newMarkers;
  }, [onlineCaregivers, activeBooking]);

  // 5. Navigate simulation (Active Caregiver GPS Drive)
  useEffect(() => {
    if (!isCaregiverActive || !activeBooking || activeBooking.status !== 'EnRoute' || routeCoordinates.length === 0) {
      const timer = setTimeout(() => setNavigatingIndex(-1), 0);
      return () => clearTimeout(timer);
    }

    // Start navigating from coordinate index 0
    const timer = setTimeout(() => setNavigatingIndex(0), 0);
    return () => clearTimeout(timer);
  }, [isCaregiverActive, activeBooking, routeCoordinates]);

  useEffect(() => {
    if (navigatingIndex === -1 || navigatingIndex >= routeCoordinates.length) return;

    const interval = setTimeout(() => {
      const nextPoint = routeCoordinates[navigatingIndex];
      
      // Update caregiver coordinate trigger (tells parent and server!)
      onLocationUpdate(nextPoint[0], nextPoint[1]);

      if (navigatingIndex < routeCoordinates.length - 1) {
        setNavigatingIndex(prev => prev + 1);
      } else {
        // Arrived! Stop navigation simulation
        setNavigatingIndex(-1);
      }
    }, 1500); // Drive speed step duration

    return () => clearTimeout(interval);
  }, [navigatingIndex, routeCoordinates, onLocationUpdate]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}></div>
      
      {/* Route Navigation info HUD Overlay */}
      {activeBooking && activeBooking.status === 'EnRoute' && (
        <div style={{
          position: 'absolute',
          bottom: '15px',
          left: '15px',
          background: 'rgba(10, 15, 30, 0.9)',
          border: '1px solid var(--color-secondary)',
          borderRadius: '8px',
          padding: '8px 15px',
          color: 'white',
          fontSize: '12px',
          zIndex: 1000,
          pointerEvents: 'none',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(5px)'
        }}>
          {navigatingIndex !== -1 ? (
            <span>🚀 <strong>Navigating streets:</strong> GPS point {navigatingIndex + 1}/{routeCoordinates.length}</span>
          ) : (
            <span>📍 <strong>Destination Reached!</strong> Tap "I Have Arrived".</span>
          )}
        </div>
      )}
    </div>
  );
}
