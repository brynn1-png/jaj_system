import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
// Supabase configuration and client bootstrap
// Provide credentials by setting window.SUPABASE_URL and window.SUPABASE_ANON_KEY before this script loads
// Example (for local testing only, do NOT commit keys):
// <script>window.SUPABASE_URL = 'https://...'; window.SUPABASE_ANON_KEY = '...';</script>


const SUPABASE_URL = 'https://jxdvtnvffbfbgianfjhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZHZ0bnZmZmJmYmdpYW5mamh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NDQzODUsImV4cCI6MjA3MjAyMDM4NX0.5Tdd_zND0GfVGJh1x_dqx9gpdO5QxVkpQp4pHviTfsY';

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Failed to initialize Supabase client:', e);
    supabase = null;
  }
} else {
  console.warn('Supabase credentials not provided. Running in offline mode.');
}

// Expose to window so ApiService and other modules can detect/use it
if (typeof window !== 'undefined') {
  window.supabaseClient = supabase;
}

export { supabase };
