// CareNest Global API Production Resolution Config
export const API_BASE = import.meta.env.PROD 
  ? window.location.origin 
  : 'http://localhost:5000';
