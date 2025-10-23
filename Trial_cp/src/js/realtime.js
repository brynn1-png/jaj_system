// RealtimeService built on Supabase realtime; safely no-ops if client not configured

function getClient() {
  return typeof window !== 'undefined' ? (window.supabaseClient || null) : null;
}

function subscribeToStudentSMS(callback) {
  const client = getClient();
  if (!client) {
    console.warn('Realtime disabled: Supabase client not available');
    return { unsubscribe: () => {} };
  }
  const channel = client
    .channel('student_sms_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'student_sms' }, (payload) => {
      console.log('Realtime: New student SMS record:', payload.new);
      const newRecord = payload.new;
      if (typeof callback === 'function') callback(newRecord);
    })
    .subscribe((status) => {
      console.log('Student SMS subscription status:', status);
    });
  return channel;
}

function subscribeToAttendance(callback) {
  const client = getClient();
  if (!client) {
    console.warn('Realtime disabled: Supabase client not available');
    return { unsubscribe: () => {} };
  }
  const channel = client
    .channel('attendance_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, (payload) => {
      console.log('Realtime: Attendance table changed:', payload);
      if (typeof callback === 'function') callback(payload);
    })
    .subscribe((status) => {
      console.log('Attendance subscription status:', status);
    });
  return channel;
}

function subscribeToRfidScans(callback) {
  const client = getClient();
  if (!client) {
    console.warn('Realtime disabled: Supabase client not available');
    return { unsubscribe: () => {} };
  }
  const channel = client
    .channel('rfid_scans_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rfid_scans' }, async (payload) => {
      console.log('Realtime: New RFID scan received:', payload.new);
      const newRecord = payload.new;

      // Process attendance for the new RFID scan
      try {
        await processAttendanceForRfidScan(newRecord);
      } catch (error) {
        console.error('Error processing attendance for RFID scan:', error);
      }

      if (typeof callback === 'function') callback(newRecord);
    })
    .subscribe((status) => {
      console.log('RFID scans subscription status:', status);
    });
  return channel;
}

// Process attendance for a new RFID scan
async function processAttendanceForRfidScan(scanRecord) {
  const { rfid_tag } = scanRecord;

  console.log('Processing attendance for RFID scan:', rfid_tag);

  try {
    // Import ApiService dynamically to avoid circular dependencies
    const { default: ApiService } = await import('./api.js');

    // Find student by RFID
    const { data: student, error } = await ApiService.getStudentByRfid(rfid_tag);

    if (error || !student) {
      console.log(`No student found for RFID: ${rfid_tag}`);
      return;
    }

    console.log('Student found:', student.name);

    // Check if attendance already exists for today
    const today = new Date().toISOString().split('T')[0];
    const existingAttendance = await ApiService.getAttendanceByStudentAndDate(student.id, today);

    if (existingAttendance) {
      console.log(`Attendance already marked for ${student.name} today`);
      return;
    }

    // Determine attendance status based on current time
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const attendanceStatus = (currentHour > 8 || (currentHour === 8 && currentMinute > 0)) ? 'late' : 'present';

    // Create attendance record
    const attendanceRecord = {
      student_id: student.id,
      rfid_tag: rfid_tag,
      date: today,
      status: attendanceStatus,
      grade: student.grade || '',
      student_name: student.name
    };

    console.log('Creating attendance record:', attendanceRecord);

    // Insert attendance record
    const result = await ApiService.addAttendanceRecord(attendanceRecord);

    if (result && result.length > 0) {
      console.log(`Attendance marked successfully for ${student.name} (${attendanceStatus})`);

      // Notify other pages that attendance was updated
      localStorage.setItem('attendanceUpdated', Date.now());

      // Send notification to parent
      const notification = {
        student_rfid: student.rfid,
        student_name: student.name,
        parent_phone: student.parent_phone,
        message: `Your child ${student.name} has been marked ${attendanceStatus} at school`,
        timestamp: new Date().toISOString(),
        status: 'sent'
      };

      try {
        await ApiService.addNotification(notification);
        console.log('Notification sent to parent');
      } catch (notificationError) {
        console.error('Error sending notification:', notificationError);
      }
    } else {
      console.error('Failed to insert attendance record');
    }
  } catch (error) {
    console.error('Error processing attendance for RFID scan:', error);
  }
}

const RealtimeService = { subscribeToStudentSMS, subscribeToAttendance, subscribeToRfidScans };

// Attach to window for non-module consumers
if (typeof window !== 'undefined') {
  window.RealtimeService = RealtimeService;
}

export default RealtimeService;
