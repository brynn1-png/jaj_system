// test-supabase-connection.js
// Run this file in your browser console or as a module to test Supabase connectivity
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/index.js';

const SUPABASE_URL = 'https://jxdvtnvffbfbgianfjhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZHZ0bnZmZmJmYmdpYW5mamh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NDQzODUsImV4cCI6MjA3MjAyMDM4NX0.5Tdd_zND0GfVGJh1x_dqx9gpdO5QxVkpQp4pHviTfsY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  try {
    const { data, error } = await supabase.from('students').select('*').limit(1);
    if (error) {
      console.error('Supabase connection failed:', error);
      alert('Supabase connection failed! Check the console for details.');
    } else {
      console.log('Supabase connection successful! Sample data:', data);
      alert('Supabase connection successful! Check the console for sample data.');
    }
  } catch (e) {
    console.error('Unexpected error:', e);
    alert('Unexpected error! Check the console for details.');
  }
}

testConnection();
