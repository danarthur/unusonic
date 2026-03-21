/**
 * Application-wide constants
 */

// Python Backend Configuration
export const PYTHON_BACKEND_URL = 
  process.env.PYTHON_API_URL || 'http://127.0.0.1:8000/api/chat';

// Site Information
export const SITE_CONFIG = {
  title: 'Signal',
  description: 'The Event Operating System',
  owner: 'ION',
  contactEmail: 'hello@runsignal.live',
  socialX: 'https://x.com/runsignal_live',
} as const;

// API Routes
export const API_ROUTES = {
  ion: '/api/ion',
  capture: '/api/capture',
} as const;

// Session / trust & inactivity (client-side UX; no DB/RLS)
/** Inactivity logout after this many ms when device is not trusted. */
export const INACTIVITY_LOGOUT_MS = 30 * 60 * 1000; // 30 minutes
/** Cookie name for "trust this device" (keep me signed in). */
export const TRUSTED_DEVICE_COOKIE_NAME = 'signal_trusted_device';
/** Max age for trusted-device cookie (1 year). */
export const TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;