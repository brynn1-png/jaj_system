
// ApiService: Supabase-backed when available, with localStorage fallback for offline mode
// Exposes methods used by the app for students, attendance, and notifications.

const LS_KEYS = {
  students: 'app.students',
  attendance: 'app.attendance',
  notifications: 'app.notifications'
};

function getSupabaseClient() {
  return typeof window !== 'undefined' ? (window.supabaseClient || null) : null;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // ignore storage errors
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Students
export async function fetchStudents() {
  const supabase = getSupabaseClient();
  console.log('fetchStudents: supabase client available:', !!supabase);
  if (supabase) {
    console.log('fetchStudents: making Supabase query...');
    const { data, error } = await supabase.from('students').select('*').eq('archived', false).order('name', { ascending: true });
    console.log('fetchStudents: query result - data:', data, 'error:', error);
    if (error) {
      console.error('fetchStudents error:', error);
      return [];
    }
    const result = Array.isArray(data) ? data : [];
    console.log('fetchStudents: returning array of length:', result.length);
    return result;
  }
  console.log('fetchStudents: using localStorage fallback');
  const localData = readJson(LS_KEYS.students, []);
  console.log('fetchStudents: localStorage data length:', localData.length);
  return localData.filter(s => !s.archived);
}

export async function addStudent(student, photoFile = null) {
  const supabase = getSupabaseClient();
  if (supabase) {
    let avatarUrl = null;

    // Upload photo if provided
    if (photoFile) {
      try {
        const fileExt = photoFile.name.split('.').pop().toLowerCase();
        const fileName = `${student.student_number}_${Date.now()}.${fileExt}`;

        console.log('Uploading photo:', fileName);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, photoFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading photo:', uploadError);
          throw new Error(`Photo upload failed: ${uploadError.message}`);
        }

        console.log('Photo uploaded successfully:', uploadData);

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        avatarUrl = urlData.publicUrl;
        console.log('Public URL generated:', avatarUrl);

      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
        throw uploadError;
      }
    }

    // Validate RFID uniqueness if provided
    if (student.rfid && student.rfid.trim()) {
      const { data: existingStudent, error: checkError } = await supabase
        .from('students')
        .select('id')
        .eq('rfid', student.rfid.trim())
        .maybeSingle();

      if (checkError) {
        console.error('Error checking RFID uniqueness:', checkError);
        throw new Error('Error validating RFID uniqueness');
      }

      if (existingStudent) {
        throw new Error(`RFID "${student.rfid}" is already assigned to another student`);
      }
    }

    const studentData = { ...student, avatar: avatarUrl };

    console.log('Inserting student data:', studentData);

    const { data, error } = await supabase.from('students').insert(studentData).select('*');
    if (error) {
      console.error('Error inserting student:', error);
      throw error;
    }

    console.log('Student inserted successfully:', data);
    return data || [];
  }
  const list = readJson(LS_KEYS.students, []);
  const toInsert = { id: uid(), archived: false, ...student };
  list.push(toInsert);
  writeJson(LS_KEYS.students, list);
  return [toInsert];
}

export async function updateStudent(studentId, updates) {
  const supabase = getSupabaseClient();
  if (supabase) {
    // Validate RFID uniqueness if RFID is being updated
    if (updates.rfid && updates.rfid.trim()) {
      const { data: existingStudent, error: checkError } = await supabase
        .from('students')
        .select('id')
        .eq('rfid', updates.rfid.trim())
        .neq('id', studentId) // Exclude current student
        .maybeSingle();

      if (checkError) {
        console.error('Error checking RFID uniqueness:', checkError);
        throw new Error('Error validating RFID uniqueness');
      }

      if (existingStudent) {
        throw new Error(`RFID "${updates.rfid}" is already assigned to another student`);
      }
    }

    const { data, error } = await supabase.from('students').update(updates).eq('id', studentId).select('*');
    if (error) throw error;
    return data || [];
  }
  const list = readJson(LS_KEYS.students, []);
  const idx = list.findIndex(s => String(s.id) === String(studentId));
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    writeJson(LS_KEYS.students, list);
    return [list[idx]];
  }
  return [];
}

export async function archiveStudent(studentId) {
  return updateStudent(studentId, { archived: true, archived_at: new Date().toISOString() });
}

export async function unarchiveStudent(studentId) {
  return updateStudent(studentId, { archived: false, archived_at: null });
}

export async function fetchArchivedStudents() {
  const supabase = getSupabaseClient();
  console.log('fetchArchivedStudents: supabase client available:', !!supabase);
  if (supabase) {
    console.log('fetchArchivedStudents: making Supabase query...');
    const { data, error } = await supabase.from('students').select('*').eq('archived', true).order('name', { ascending: true });
    console.log('fetchArchivedStudents: query result - data:', data, 'error:', error);
    if (error) {
      console.error('fetchArchivedStudents error:', error);
      return [];
    }
    const result = Array.isArray(data) ? data : [];
    console.log('fetchArchivedStudents: returning array of length:', result.length);
    return result;
  }
  console.log('fetchArchivedStudents: using localStorage fallback');
  const localData = readJson(LS_KEYS.students, []);
  console.log('fetchArchivedStudents: localStorage data length:', localData.length);
  return localData.filter(s => s.archived);
}

export async function getStudentByRfid(rfid) {
  const trimmedRfid = (rfid || '').toString().trim();
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('students').select('*').ilike('rfid', trimmedRfid + '%').maybeSingle();
    return { data: data || null, error: error || null };
  }
  const students = readJson(LS_KEYS.students, []);
  const found = students.find(s => (s.rfid || '').toString().trim().startsWith(trimmedRfid));
  return { data: found || null, error: null };
}

// Attendance
export async function fetchAttendanceRecords() {
  const supabase = getSupabaseClient();
  if (supabase) {
    // First fetch attendance records
    const { data: attendanceData, error: attendanceError } = await supabase
      .from('attendance')
      .select('*')
      .order('timestamp', { ascending: true });

    if (attendanceError) {
      console.error('fetchAttendanceRecords error:', attendanceError);
      return [];
    }

    if (!Array.isArray(attendanceData) || attendanceData.length === 0) {
      return [];
    }

    // Get unique student IDs
    const studentIds = [...new Set(attendanceData.map(record => record.student_id).filter(id => id))];

    if (studentIds.length === 0) {
      return attendanceData;
    }

    // Fetch student data for these IDs
    const { data: studentsData, error: studentsError } = await supabase
      .from('students')
      .select('id, grade, student_number')
      .in('id', studentIds);

    if (studentsError) {
      console.error('fetchAttendanceRecords students error:', studentsError);
      return attendanceData; // Return attendance data without student info
    }

    // Create a map of student data for quick lookup
    const studentsMap = {};
    if (Array.isArray(studentsData)) {
      studentsData.forEach(student => {
        studentsMap[student.id] = student;
      });
    }

    // Merge attendance with student data
    const processedData = attendanceData.map(record => ({
      ...record,
      grade: studentsMap[record.student_id]?.grade || '',
      student_number: studentsMap[record.student_id]?.student_number || ''
    }));

    // Sort by grade (numerical order) from students table
    processedData.sort((a, b) => {
      const gradeA = parseInt(a.grade) || 0;
      const gradeB = parseInt(b.grade) || 0;
      return gradeA - gradeB;
    });

    return processedData;
  }
  return readJson(LS_KEYS.attendance, []);
}

export async function addAttendanceRecord(record) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('attendance').insert(record).select('*');
    if (error) throw error;
    return data || [];
  }
  const list = readJson(LS_KEYS.attendance, []);
  const toInsert = { id: uid(), timestamp: new Date().toISOString(), ...record };
  list.push(toInsert);
  writeJson(LS_KEYS.attendance, list);
  return [toInsert];
}

export async function getAttendanceByStudentAndDate(studentId, date) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .eq('date', date)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('getAttendanceByStudentAndDate error:', error);
    }
    return data || null;
  }
  const list = readJson(LS_KEYS.attendance, []);
  return list.find(r => String(r.student_id) === String(studentId) && r.date === date) || null;
}

// Notifications
export async function addNotification(notification) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('student_sms').insert(notification).select('*');
    if (error) throw error;
    return data || [];
  }
  const list = readJson(LS_KEYS.notifications, []);
  const toInsert = { id: uid(), createdAt: new Date().toISOString(), ...notification };
  list.push(toInsert);
  writeJson(LS_KEYS.notifications, list);
  return [toInsert];
}

// RFID Scans
export async function addRfidScan(scanData) {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('rfid_scans').insert(scanData).select('*');
    if (error) throw error;
    return data || [];
  }
  // For localStorage, we could store in a separate key, but since we're centralizing to Supabase, return empty
  return [];
}

export async function fetchNewRfidScans(lastScanId = 0) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      // Try using id column first (as per schema)
      const { data, error } = await supabase
        .from('rfid_scans')
        .select('*')
        .eq('processed', false)
        .gt('id', lastScanId)
        .order('id', { ascending: true });

      if (error && error.code === '42703') {
        // Column doesn't exist, fallback to created_at ordering
        console.warn('id column not found in rfid_scans, using created_at ordering');
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('rfid_scans')
          .select('*')
          .eq('processed', false)
          .order('created_at', { ascending: true });

        if (fallbackError) {
          console.error('fetchNewRfidScans fallback error:', fallbackError);
          return [];
        }
        return Array.isArray(fallbackData) ? fallbackData : [];
      }

      if (error) {
        console.error('fetchNewRfidScans error:', error);
        return [];
      }
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('fetchNewRfidScans exception:', e);
      return [];
    }
  }
  return [];
}

export async function markRfidScanProcessed(scanId, scanData = null) {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      let query = supabase
        .from('rfid_scans')
        .update({ processed: true })
        .select('*');

      // Try using id column first if available
      if (scanId && scanId !== 'undefined' && scanId !== 'null') {
        query = query.eq('id', scanId);
      } else if (scanData) {
        // Fallback to rfid_tag and scanned_at for unique identification
        query = query
          .eq('rfid_tag', scanData.rfid_tag)
          .eq('scanned_at', scanData.scanned_at);
      } else {
        console.error('markRfidScanProcessed: No valid identifier provided');
        return [];
      }

      const { data, error } = await query;

      if (error) {
        console.error('markRfidScanProcessed error:', error);
        return [];
      }

      return data || [];
    } catch (e) {
      console.error('markRfidScanProcessed exception:', e);
      return [];
    }
  }
  return [];
}

// Fetch all notifications from student_sms
export async function fetchNotifications() {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('student_sms').select('*').order('timestamp', { ascending: false });
    if (error) {
      console.error('fetchNotifications error:', error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }
  return readJson(LS_KEYS.notifications, []);
}

// Default export object for convenience
const ApiService = {
  fetchStudents,
  fetchArchivedStudents,
  fetchAttendanceRecords,
  getStudentByRfid,
  addAttendanceRecord,
  addNotification,
  fetchNotifications,
  getAttendanceByStudentAndDate,
  addStudent,
  updateStudent,
  archiveStudent,
  unarchiveStudent,
  addRfidScan,
  fetchNewRfidScans,
  markRfidScanProcessed
};

// Attach to window for non-module consumers as well
if (typeof window !== 'undefined') {
  window.ApiService = ApiService;
}

export default ApiService;
