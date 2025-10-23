import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/index.js';

const SUPABASE_URL = 'https://jxdvtnvffbfbgianfjhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZHZ0bnZmZmJmYmdpYW5mamh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NDQzODUsImV4cCI6MjA3MjAyMDM4NX0.5Tdd_zND0GfVGJh1x_dqx9gpdO5QxVkpQp4pHviTfsY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getDistinctGrades() {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('grade')
      .not('grade', 'is', null)
      .neq('grade', '');

    if (error) {
      console.error('Error fetching grades:', error);
      return;
    }

    // Get distinct grades
    const grades = [...new Set(data.map(student => student.grade))].sort();

    console.log('Distinct grades in the students table:');
    grades.forEach(grade => console.log(`- ${grade}`));

    console.log(`\nTotal distinct grades: ${grades.length}`);

  } catch (e) {
    console.error('Unexpected error:', e);
  }
}

getDistinctGrades();
