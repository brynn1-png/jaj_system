// Render notifications in notification-list as a table
async function renderNotifications() {
    const tableBody = document.getElementById('notification-table-body');
    if (!tableBody) return;

    // Fetch notifications from DB
    let notifications = [];
    try {
        notifications = await ApiService.fetchNotifications();
    } catch (e) {
        console.error('Failed to fetch notifications:', e);
    }

    // Sort
    const sortBy = document.getElementById('sort-notifications')?.value || 'timestamp';
    notifications.sort((a, b) => {
        if (sortBy === 'student_name') {
            return (a.student_name || '').localeCompare(b.student_name || '');
        } else if (sortBy === 'student_rfid') {
            return (a.student_rfid || '').localeCompare(b.student_rfid || '');
        } else {
            return new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt);
        }
    });

    tableBody.innerHTML = '';
    if (notifications.length === 0) {
        tableBody.innerHTML = `<tr class=\"empty-state\"><td colspan=\"6\" style=\"text-align:center;\"><i class=\"fas fa-bell-slash\"></i> <p style=\"display:inline;\">No notifications yet</p></td></tr>`;
        return;
    }
    notifications.forEach(n => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${n.student_name || ''}</td>
            <td>${n.student_rfid || ''}</td>
            <td>${n.message || ''}</td>
            <td>${n.parent_phone || ''}</td>
            <td>${n.timestamp ? new Date(n.timestamp).toLocaleString('en-GB', { hour12: false }) : ''}</td>
            <td>${n.status || ''}</td>
        `;
        tableBody.appendChild(row);
    });

    // Update notifications count display
    const notificationsCountEl = document.getElementById('notifications-count');
    if (notificationsCountEl) {
        notificationsCountEl.textContent = notifications.length;
    }
}
// Import the new API and real-time services
import ApiService from './api.js';
import RealtimeService from './realtime.js';
import { supabase } from './supabase-config.js';
import { isLoggedIn, redirectToLogin, logout } from './auth.js';

// Apply saved theme immediately to prevent flash
(function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();

// Check authentication on page load
if (!isLoggedIn()) {
    redirectToLogin();
} else {
    // Initialize app only if logged in
    document.addEventListener('DOMContentLoaded', function() {
        initializeApp();
    // If on notifications page, render notifications
        if (window.location.pathname.includes('notifications.html')) {
            renderNotifications();
            // Re-render on sort change
            const sortSel = document.getElementById('sort-notifications');
            if (sortSel) sortSel.addEventListener('change', renderNotifications);
        }

        // If on dashboard page, render attendance
        if (window.location.pathname.includes('dashboard.html')) {
            renderAttendance();
            updateStats();
        }
    });
}

// Application state
let isConnected = false;
if (typeof window !== 'undefined') {
    window.isConnected = isConnected;
}
// Bind global notification helper provided by ui.js
const showNotification = (typeof window !== 'undefined' && window.showNotification)
  ? window.showNotification
  : (msg => console.log('[info]', msg));
let students = [];
let attendanceRecords = [];
let studentSMSRecords = [];
let notifications = [];
let realtimeSubscription = null;
let isProcessingScan = false;
let lastProcessedScanId = 0; // Track last processed RFID scan ID
let lastScannedStudent = null; // Track last scanned student for dashboard display

// Function to display last scanned student
function displayLastScannedStudent(student) {
    const scanResultContent = document.getElementById('scan-result-content');
    if (!scanResultContent) return;

    // Find existing elements (they should already be there from initial page load)
    let studentInfo = scanResultContent.querySelector('.student-scan-info');
    let avatar = scanResultContent.querySelector('.student-avatar');
    let name = scanResultContent.querySelector('.student-name');
    let info = scanResultContent.querySelector('.student-info');
    let timestamp = scanResultContent.querySelector('.scan-timestamp');

    // If elements don't exist, create them (fallback)
    if (!studentInfo) {
        scanResultContent.innerHTML = `
            <div class="student-scan-info">
                <div class="student-avatar"></div>
                <div class="student-details">
                    <div class="student-name"></div>
                    <div class="student-info"></div>
                    <div class="scan-timestamp"></div>
                </div>
            </div>
        `;
        studentInfo = scanResultContent.querySelector('.student-scan-info');
        avatar = scanResultContent.querySelector('.student-avatar');
        name = scanResultContent.querySelector('.student-name');
        info = scanResultContent.querySelector('.student-info');
        timestamp = scanResultContent.querySelector('.scan-timestamp');
    }

    // Update the content
    if (!student) {
        // Show unknown student message
        avatar.textContent = '?';
        name.textContent = 'Unknown Student';
        info.innerHTML = `<span><i class="fas fa-id-card"></i> RFID: N/A</span>`;
        timestamp.textContent = `Scanned at ${new Date().toLocaleTimeString()}`;
    } else {
    // Show student details
        const avatarText = student.avatars || student.avatar || student.name.split(' ').map(n => n[0]).join('').toUpperCase();
        if (student.avatars || student.avatar) {
            // If avatar URL exists, create an image element
            avatar.innerHTML = `<img src="${student.avatars || student.avatar}" alt="${student.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            // Fallback to initials
            avatar.textContent = avatarText;
        }
        name.textContent = student.name;
        info.innerHTML = `
            <span><i class="fas fa-graduation-cap"></i> Grade ${student.grade || 'N/A'}</span>
            <span><i class="fas fa-id-card"></i> RFID: ${student.rfid}</span>
        `;
        timestamp.textContent = `Scanned at ${new Date().toLocaleTimeString()}`;
    }

    // Make sure it's visible
    studentInfo.style.opacity = '1';

    // Flash for 15 seconds by toggling opacity every 500ms
    let flashInterval = setInterval(() => {
        if (studentInfo) {
            studentInfo.style.opacity = studentInfo.style.opacity === '1' ? '0' : '1';
        }
    }, 500); // Toggle every 500ms

    // Stop flashing and hide after 15 seconds
    setTimeout(() => {
        clearInterval(flashInterval);
        if (studentInfo) {
            studentInfo.style.opacity = '0';
            studentInfo.style.transition = 'opacity 0.5s ease-out';
        }
    }, 15000); // 15 seconds total
}
let rfidScanCooldowns = {}; // Track last scan time for each RFID to prevent rapid scanning

// Helpers
function todayYmdLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function validateRfidFormat(rfid) {
    if (!rfid || typeof rfid !== 'string') return false;
    const trimmed = rfid.trim();
    // Allow alphanumeric and dashes/underscores, 3-32 chars
    return /^[A-Za-z0-9_-]{3,32}$/.test(trimmed);
}

function getAttendanceStatus() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if after 8:00 AM
    if (currentHour > 8 || (currentHour === 8 && currentMinute > 0)) {
        return 'late';
    }
    return 'present';
}

// Initialize the application
async function initializeApp() {
    setupEventListeners();
    updateStats();
    // Automatically connect to Supabase on page load
    await connectToSupabase();
    // Show notification if not connected
    if (!isConnected) {
        showNotification('System is not connected to the database. Some features may be unavailable.', 'error');
    }
    // Load initial data (will use Supabase if connected, otherwise local data)
    loadInitialData();
}

// Setup event listeners
function setupEventListeners() {
    // Sorting by grade and section (for students page)
    const gradeSort = document.getElementById('grade-sort');
    const sectionSort = document.getElementById('section-sort');
    if (gradeSort) {
        gradeSort.addEventListener('change', renderStudentsWithSort);
    }
    if (sectionSort) {
        sectionSort.addEventListener('change', renderStudentsWithSort);
    }

    // Student sort dropdown (for students page)
    const studentSort = document.getElementById('student-sort');
    if (studentSort) {
        studentSort.addEventListener('change', handleStudentSort);
    }

    // Refresh data button
    const refreshBtn = document.getElementById('refresh-data');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadInitialData);
    }

    // Add student form
    const addStudentForm = document.getElementById('student-form');
    if (addStudentForm) {
        addStudentForm.addEventListener('submit', handleAddStudent);
    }

    // Search functionality for student page
    const searchInput = document.getElementById('student-search');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            renderStudentsWithSort();
        });
    }

    // Connect to Supabase button
    const connectBtn = document.getElementById('supabase-connect');
    if (connectBtn) {
        connectBtn.addEventListener('click', connectToSupabase);
    }

    // RFID Scanner
    setupRfidScanner();
}

// Load initial data
async function loadInitialData() {
    console.log('Loading initial data...');
    updateConnectionStatus();
    
    if (isConnected) {
        // Load data from Supabase if connected
        await loadDataFromSupabase();
    } else {
        // Use sample data if not connected to Supabase
        await loadSampleDataIfAvailable();
        renderStudents();
        updateStats();
        renderAttendance();
    }
}

// Load sample data if available
async function loadSampleDataIfAvailable() {
    if (typeof loadSampleData === 'function') {
        loadSampleData();
        showNotification('Loaded sample data for demonstration');
    } else {
        console.log('Sample data function not available');
    }
}

// Update connection status
function updateConnectionStatus() {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = isConnected ? 'Connected to Supabase' : 'Offline Mode';
        statusElement.className = `status-banner ${isConnected ? 'connected' : 'offline'}`;
    }
}

    // Update statistics
    async function updateStats() {
        const totalStudentsEl = document.getElementById('total-students');
        const totalPresentEl = document.getElementById('total-present');
        const totalAbsentEl = document.getElementById('total-absent');
        const attendanceRateEl = document.getElementById('attendance-rate');

        // Get total students count (active + archived)
        let totalStudents = students.length;
        if (isConnected) {
            try {
                const allStudents = await ApiService.fetchStudents();
                const archivedStudents = await ApiService.fetchArchivedStudents();
                totalStudents = allStudents.length + archivedStudents.length;
            } catch (error) {
                console.error('Error fetching total student count:', error);
            }
        }

        if (totalStudentsEl) totalStudentsEl.textContent = totalStudents;

        // Get active and archived counts
        let activeStudents = students.length;
        let archivedStudents = 0;
        if (isConnected) {
            try {
                const archived = await ApiService.fetchArchivedStudents();
                archivedStudents = archived.length;
                activeStudents = totalStudents - archivedStudents;
            } catch (error) {
                console.error('Error fetching archived student count:', error);
            }
        }

        // Update active and archived student counts
        const activeStudentsEl = document.getElementById('active-students');
        const archivedStudentsEl = document.getElementById('archived-students');
        if (activeStudentsEl) activeStudentsEl.textContent = activeStudents;
        if (archivedStudentsEl) archivedStudentsEl.textContent = archivedStudents;

        // Calculate today's RFID scans (unique students scanned)
        let todaysScans = [];
        if (isConnected) {
            try {
                const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('rfid_scans')
                    .select('rfid_tag')
                    .gte('scanned_at', today + 'T00:00:00')
                    .lte('scanned_at', today + 'T23:59:59');
                if (!error && data) {
                    // Get unique RFID tags
                    const uniqueRfids = [...new Set(data.map(scan => scan.rfid_tag))];
                    todaysScans = uniqueRfids;
                }
            } catch (error) {
                console.error('Error fetching today\'s RFID scans:', error);
            }
        }

        const presentToday = todaysScans.length;
        const absentToday = Math.max(0, activeStudents - presentToday);
        const attendanceRate = activeStudents > 0 ? Math.round((presentToday / activeStudents) * 100) : 0;

        if (totalPresentEl) totalPresentEl.textContent = presentToday;
        if (totalAbsentEl) totalAbsentEl.textContent = absentToday;
        if (attendanceRateEl) attendanceRateEl.textContent = `${attendanceRate}%`;
    }

// Render students
function renderStudents() {
    const container = document.getElementById('students-grid');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (students.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No students found</p>
            </div>
        `;
        return;
    }
    
    students.forEach(student => {
        const studentCard = createStudentCard(student);
        container.appendChild(studentCard);
    });
}

// Handle student sort dropdown change
function handleStudentSort() {
    renderStudentsWithSort();
}

// Render students with sorting by grade and section
function renderStudentsWithSort() {
    const container = document.getElementById('students-grid');
    if (!container) return;

    let list = Array.isArray(students) ? [...students] : [];

    // Apply grade filter
    const gradeSelect = document.getElementById('grade-sort');
    const selectedGrade = gradeSelect ? gradeSelect.value.trim() : 'all';
    if (selectedGrade && selectedGrade !== 'all') {
        list = list.filter(s => String(s.grade).trim() === selectedGrade);
    }

    // Apply section filter
    const sectionSelect = document.getElementById('section-sort');
    const selectedSection = sectionSelect ? sectionSelect.value.trim().toUpperCase() : 'ALL';
    if (selectedSection && selectedSection !== 'ALL') {
        list = list.filter(s => {
            const sec = (s.section || s.section_name || s.sectionName || '').toString().trim().toUpperCase();
            return sec === selectedSection;
        });
    }

            // Search filter
            const searchInput = document.getElementById('student-search');
            const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
            if (searchTerm) {
                list = list.filter(student =>
                    (student.name || '').toLowerCase().includes(searchTerm) ||
                    (student.email || '').toLowerCase().includes(searchTerm) ||
                    (student.rfid || '').toLowerCase().includes(searchTerm) ||
                    (student.student_number || '').toLowerCase().includes(searchTerm) ||
                    (String(student.grade || '')).toLowerCase().includes(searchTerm) ||
                    ((student.section || student.section_name || student.sectionName || '') + '').toLowerCase().includes(searchTerm)
                );
            }

    // Apply student sort dropdown
    const sortSelect = document.getElementById('student-sort');
    const sortBy = sortSelect ? sortSelect.value : 'grade-asc';

    if (sortBy === 'grade-asc') {
        // Sort by grade (numeric), section, then name
        list.sort((a, b) => {
            const ga = parseInt(a.grade, 10) || 99;
            const gb = parseInt(b.grade, 10) || 99;
            if (ga < gb) return -1;
            if (ga > gb) return 1;
            const sa = (a.section || a.section_name || a.sectionName || 'ZZ').toString().trim().toUpperCase();
            const sb = (b.section || b.section_name || b.sectionName || 'ZZ').toString().trim().toUpperCase();
            if (sa < sb) return -1;
            if (sa > sb) return 1;
            const na = (a.name || '').toLowerCase();
            const nb = (b.name || '').toLowerCase();
            if (na < nb) return -1;
            if (na > nb) return 1;
            return 0;
        });
    } else if (sortBy === 'grade-desc') {
        // Sort by grade descending
        list.sort((a, b) => {
            const ga = parseInt(a.grade, 10) || 99;
            const gb = parseInt(b.grade, 10) || 99;
            if (ga > gb) return -1;
            if (ga < gb) return 1;
            const sa = (a.section || a.section_name || a.sectionName || 'ZZ').toString().trim().toUpperCase();
            const sb = (b.section || b.section_name || b.sectionName || 'ZZ').toString().trim().toUpperCase();
            if (sa < sb) return -1;
            if (sa > sb) return 1;
            const na = (a.name || '').toLowerCase();
            const nb = (b.name || '').toLowerCase();
            if (na < nb) return -1;
            if (na > nb) return 1;
            return 0;
        });
    } else if (sortBy === 'name-asc') {
        // Sort by name ascending
        list.sort((a, b) => {
            const na = (a.name || '').toLowerCase();
            const nb = (b.name || '').toLowerCase();
            if (na < nb) return -1;
            if (na > nb) return 1;
            return 0;
        });
    } else if (sortBy === 'name-desc') {
        // Sort by name descending
        list.sort((a, b) => {
            const na = (a.name || '').toLowerCase();
            const nb = (b.name || '').toLowerCase();
            if (na > nb) return -1;
            if (na < nb) return 1;
            return 0;
        });
    }

    container.innerHTML = '';
    if (list.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No students found</p>
            </div>
        `;
        return;
    }

    list.forEach(student => {
        const studentCard = createStudentCard(student);
        container.appendChild(studentCard);
    });
}



// Handle search
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filteredStudents = students.filter(student => 
        student.name.toLowerCase().includes(searchTerm) ||
        student.email.toLowerCase().includes(searchTerm) ||
        student.grade.toLowerCase().includes(searchTerm) ||
        student.rfid.toLowerCase().includes(searchTerm)
    );
    
    const container = document.getElementById('students-grid');
    if (container) {
        container.innerHTML = '';
        filteredStudents.forEach(student => {
            container.appendChild(createStudentCard(student));
        });
    }
}

// Render RFID scans as cards (showing scanned students)
async function renderAttendance() {
    const attendanceList = document.getElementById('attendance-list');
    if (!attendanceList) return;

    // Fetch today's RFID scans
    let rfidScans = [];
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase
            .from('rfid_scans')
            .select('*')
            .gte('scanned_at', today + 'T00:00:00')
            .lte('scanned_at', today + 'T23:59:59')
            .order('scanned_at', { ascending: false });
        if (error) {
            console.error('Error fetching RFID scans:', error);
        } else {
            rfidScans = data || [];
        }
    } catch (e) {
        console.error('Failed to fetch RFID scans:', e);
    }

    attendanceList.innerHTML = '';
    if (rfidScans.length === 0) {
        attendanceList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No RFID scans yet. Start scanning!</p>
            </div>
        `;
        return;
    }

    for (const scan of rfidScans) {
        // Try to find student by RFID
        let studentName = 'Unknown Student';
        let statusClass = 'absent';
        let statusText = 'Not Found';
        let iconClass = 'fa-times-circle';

        try {
            const { data: student } = await ApiService.getStudentByRfid(scan.rfid_tag);
            if (student) {
                studentName = student.name;
                statusClass = 'present';
                statusText = 'Scanned';
                iconClass = 'fa-check-circle';
            }
        } catch (e) {
            console.error('Error finding student for RFID:', scan.rfid_tag, e);
        }

        const attendanceCard = document.createElement('div');
        attendanceCard.className = 'attendance-record-card';

        const time = new Date(scan.scanned_at).toLocaleTimeString('en-GB', { hour12: false });

        attendanceCard.innerHTML = `
            <div class="attendance-record-content">
                <div class="student-info">
                    <div class="student-name">${studentName}</div>
                    <div class="attendance-time">${time}</div>
                </div>
                <div class="attendance-status ${statusClass}">
                    <i class="fas ${iconClass}"></i>
                    ${statusText}
                </div>
            </div>
        `;

        attendanceList.appendChild(attendanceCard);
    }
}

// Load attendance records (legacy function for backward compatibility)
function loadAttendanceRecords() {
    renderAttendance();
}

// Connect to Supabase
async function connectToSupabase() {
    console.log('Connecting to Supabase...');
    if (!supabase) {
        showNotification('Supabase client is not initialized. Check your supabase-config.js import.', 'error');
        console.error('Supabase client is not initialized.');
        isConnected = false;
        updateConnectionStatus();
        return;
    }
    try {
        // Test connection by fetching a simple query
        const { data, error } = await supabase.from('students').select('id').limit(1);
        if (error) {
            showNotification('Failed to connect to Supabase: ' + error.message, 'error');
            console.error('Supabase connection error:', error);
            isConnected = false;
            if (typeof window !== 'undefined') window.isConnected = isConnected;
            updateConnectionStatus();
            return;
        }
        isConnected = true;
        if (typeof window !== 'undefined') window.isConnected = isConnected;
        updateConnectionStatus();
        showNotification('Connected to Supabase successfully!', 'success');
        // Load data from Supabase
        await loadDataFromSupabase();
        // Setup real-time subscriptions
        setupRealtimeSubscriptions();
    } catch (error) {
        showNotification('Unexpected error connecting to Supabase: ' + error.message, 'error');
        console.error('Unexpected Supabase connection error:', error);
        isConnected = false;
        if (typeof window !== 'undefined') window.isConnected = isConnected;
        updateConnectionStatus();
    }
}

// Load data from Supabase using the new API service
async function loadDataFromSupabase() {
    if (!isConnected) {
        console.log('Not connected to Supabase, skipping data load');
        return;
    }
    
    try {
        console.log('Loading data from Supabase using API service...');
        
        // Load students using the new API service
        students = await ApiService.fetchStudents();
        console.log(`Loaded ${students.length} students from Supabase`);
        renderStudents();
        
        // Load attendance records using the new API service
        attendanceRecords = await ApiService.fetchAttendanceRecords();
        console.log(`Loaded ${attendanceRecords.length} attendance records from Supabase`);
        renderAttendance();

        updateStats();
        showNotification('Data loaded from Supabase', 'success');
        console.log('✅ Data loading completed successfully');
        
    } catch (error) {
        console.error('Error loading data from Supabase:', error);
        showNotification('Error loading data from Supabase', 'error');
    }
}

    // Setup real-time subscriptions using the new RealtimeService
    function setupRealtimeSubscriptions() {
        if (!isConnected || realtimeSubscription) return;

        // Subscribe to student_sms table changes
        RealtimeService.subscribeToStudentSMS((newRecord) => {
            console.log('New student SMS record received:', newRecord);
            // Update UI with new record (includes notification popup)
            updateRealTimeUI(newRecord);
            // Re-render notifications if on notifications page
            if (window.location.pathname.includes('notifications.html')) {
                renderNotifications();
            }
            // Always update stats globally after new notification
            updateStats();
        });

        // Subscribe to attendance table changes
        RealtimeService.subscribeToAttendance((payload) => {
            console.log('Attendance table changed:', payload);
            // Always update stats globally
            updateStats();

            // Update attendance display on all relevant pages
            if (window.location.pathname.includes('dashboard.html')) {
                renderAttendance();
                updateDashboardStats();
            } else if (window.location.pathname.includes('attendance.html')) {
                loadCurrentAttendance();
                renderAttendance();
            } else {
                // On other pages, just update stats without full re-render
                updateStats();
            }
        });

        // Subscribe to RFID scans table changes
        RealtimeService.subscribeToRfidScans(async (newScan) => {
            console.log('New RFID scan received:', newScan);
            // Attendance processing is now handled in realtime.js
            // Just update the UI

            // Always update stats globally after RFID scan processing
            updateStats();

            // Update attendance display on relevant pages
            if (window.location.pathname.includes('dashboard.html')) {
                renderAttendance();
                updateDashboardStats();
            } else if (window.location.pathname.includes('attendance.html')) {
                renderAttendance();
                loadCurrentAttendance();
            } else {
                // On other pages, just update stats
                updateStats();
            }
        });

        // Subscribe to students table changes
        if (window.supabaseClient) {
            const studentsChannel = window.supabaseClient
                .channel('students_changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, async (payload) => {
                    console.log('Students table changed:', payload);
                    // Always refresh students data globally
                    if (isConnected) {
                        students = await ApiService.fetchStudents();
                        updateStats();

                        // Update UI based on current page
                        if (window.location.pathname.includes('students.html')) {
                            renderStudents();
                            renderStudentsWithSort();
                        } else if (window.location.pathname.includes('dashboard.html')) {
                            updateDashboardStats();
                        } else {
                            // On other pages, just update stats
                            updateStats();
                        }
                    }
                })
                .subscribe();
        }

        showNotification('Real-time subscriptions enabled', 'success');
    }

// Process new RFID scan from real-time subscription
async function processNewRfidScan(scanData) {
    console.log('Processing new RFID scan:', scanData);

    if (isProcessingScan) {
        console.log('Scan ignored: another scan is in progress');
        return;
    }

    isProcessingScan = true;
    setScanUiState(true);

    try {
        // Extract RFID tag from scan data
        const rfid = scanData.rfid_tag;
        if (!rfid) {
            console.error('No RFID tag found in scan data:', scanData);
            showNotification('Invalid RFID scan data received', 'error');
            return;
        }

        // Ignore specific RFID
        if (rfid === '38103006') {
            console.log(`RFID ${rfid} scan ignored: blocked RFID`);
            return;
        }

        // Check cooldown to prevent rapid scanning of the same RFID
        const now = Date.now();
        const lastScanTime = rfidScanCooldowns[rfid] || 0;
        const cooldownMs = 5000; // 5 seconds cooldown

        if (now - lastScanTime < cooldownMs) {
            console.log(`RFID ${rfid} scan ignored: cooldown active (${cooldownMs - (now - lastScanTime)}ms remaining)`);
            showNotification(`RFID scan ignored: please wait ${Math.ceil((cooldownMs - (now - lastScanTime)) / 1000)} seconds`, 'info');
            return;
        }

        // Update cooldown timestamp
        rfidScanCooldowns[rfid] = now;

        const timestamp = new Date(scanData.scanned_at);
        console.log(`Processing RFID scan: ${rfid} at ${timestamp}`);

        // Find student by RFID
        const { data: student, error } = await ApiService.getStudentByRfid(rfid);
        if (error || !student) {
            showNotification('Student not found with RFID: ' + rfid, 'error');
            console.log(`RFID scan failed: ${rfid} not found in database.`);
            // Update last scanned student to null when not found
            lastScannedStudent = null;
            displayLastScannedStudent(null);
            return;
        }

        // Log successful scan
        console.log(`Student recognized: ${student.name} (RFID: ${rfid})`);

        // Fetch the latest student data to ensure we have the current grade
        const { data: freshStudent, error: freshError } = await ApiService.getStudentByRfid(rfid);
        if (freshError || !freshStudent) {
            console.warn('Could not fetch fresh student data, using cached data');
        }
        const currentStudent = freshStudent || student;

        // Update last scanned student
        lastScannedStudent = currentStudent;
        displayLastScannedStudent(currentStudent);

        // Mark attendance automatically
        const attendanceStatus = getAttendanceStatus();
        const attendance = {
            student_id: currentStudent.id,
            date: todayYmdLocal(),
            status: attendanceStatus,
            grade: currentStudent.grade
        };

        try {
            // Check if attendance record already exists
            const existingAttendance = await ApiService.getAttendanceByStudentAndDate(student.id, attendance.date);

            if (existingAttendance) {
                showNotification(`Attendance already marked for ${student.name} today`, 'info');
            } else {
                const result = await ApiService.addAttendanceRecord(attendance);
                const saved = result[0] || attendance;
                attendanceRecords.push(saved);
                showNotification(`Attendance marked for ${student.name} (${attendanceStatus}) (saved to Supabase)`, 'success');

                // Log notification after successful attendance
                const notification = {
                    student_rfid: student.rfid,
                    student_name: student.name,
                    parent_phone: student.parent_phone,
                    message: `Your child ${student.name} has been marked ${attendanceStatus}`,
                    timestamp: new Date().toISOString(),
                    status: 'sent'
                };
                try {
                    const notifRes = await ApiService.addNotification(notification);
                    notifications.push((notifRes && notifRes[0]) || notification);
                } catch (e) {
                    console.error('Failed to log notification:', e);
                    notification.id = Date.now();
                    notifications.push(notification);
                }
            }
        } catch (error) {
            console.error('Error saving attendance:', error);
            // Fallback to local storage
            attendance.id = Date.now();
            attendanceRecords.push(attendance);
            showNotification(`Attendance marked for ${student.name} (${attendanceStatus}) (offline mode)`, 'warning');

            // Try to log notification even in offline mode
            const notification = {
                student_rfid: student.rfid,
                student_name: student.name,
                parent_phone: student.parent_phone,
                message: `Your child ${student.name} has been marked ${attendanceStatus}`,
                timestamp: new Date().toISOString(),
                status: 'sent'
            };
            try {
                const notifRes = await ApiService.addNotification(notification);
                notifications.push((notifRes && notifRes[0]) || notification);
            } catch (e) {
                console.error('Failed to log notification (offline):', e);
                notification.id = Date.now();
                notifications.push(notification);
            }
        }

        updateStats();
        renderAttendance();

        // Update current attendance table on attendance page
        if (window.location.pathname.includes('attendance.html')) {
            loadCurrentAttendance();
        }

        // Mark scan as processed
        await ApiService.markRfidScanProcessed(scanData.id);
        lastProcessedScanId = scanData.id;

    } finally {
        isProcessingScan = false;
        setScanUiState(false);
    }
}



// Update UI with real-time data
function updateRealTimeUI(newRecord) {
    // Update notifications count globally
    const notificationsSentEl = document.getElementById('notifications-sent');
    if (notificationsSentEl) {
        const currentCount = parseInt(notificationsSentEl.textContent) || 0;
        notificationsSentEl.textContent = currentCount + 1;
    }

    // Update notifications count on dashboard if present
    const dashboardNotificationsEl = document.getElementById('total-notifications');
    if (dashboardNotificationsEl) {
        const currentCount = parseInt(dashboardNotificationsEl.textContent) || 0;
        dashboardNotificationsEl.textContent = currentCount + 1;
    }

    // Add to notification table if on notifications page
    if (window.location.pathname.includes('notifications.html')) {
        const tableBody = document.getElementById('notification-table-body');
        if (tableBody) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${newRecord.student_name || ''}</td>
                <td>${newRecord.student_rfid || ''}</td>
                <td>${newRecord.message || ''}</td>
                <td>${newRecord.parent_phone || ''}</td>
                <td>${newRecord.timestamp ? new Date(newRecord.timestamp).toLocaleString('en-GB', { hour12: false }) : ''}</td>
                <td>${newRecord.status || ''}</td>
            `;
            // Remove empty state if present
            const emptyRow = tableBody.querySelector('.empty-state');
            if (emptyRow) {
                emptyRow.remove();
            }
            tableBody.insertBefore(row, tableBody.firstChild);
        }
    }

    // Show notification popup regardless of current page
    showNotification(`New notification: ${newRecord.message}`, 'info');
}

async function handleRfidScan(rfid) {
    console.log('RFID scanned:', rfid);

    if (isProcessingScan) {
        console.log('Scan ignored: another scan is in progress');
        return;
    }

    // Basic RFID validation before any processing
    if (!validateRfidFormat(rfid)) {
        showNotification('Invalid RFID format. Use 3-32 alphanumeric characters.', 'error');
        return;
    }

    // Ignore specific RFID
    if (rfid === '38103006') {
        console.log(`RFID ${rfid} scan ignored: blocked RFID`);
        return;
    }

    // Check cooldown to prevent rapid scanning of the same RFID
    const now = Date.now();
    const lastScanTime = rfidScanCooldowns[rfid] || 0;
    const cooldownMs = 5000; // 5 seconds cooldown

    if (now - lastScanTime < cooldownMs) {
        console.log(`RFID ${rfid} scan ignored: cooldown active (${cooldownMs - (now - lastScanTime)}ms remaining)`);
        showNotification(`RFID scan ignored: please wait ${Math.ceil((cooldownMs - (now - lastScanTime)) / 1000)} seconds`, 'info');
        return;
    }

    // Update cooldown timestamp
    rfidScanCooldowns[rfid] = now;

    isProcessingScan = true;
    setScanUiState(true);

    try {
        // Check if Supabase is connected
        if (!isConnected) {
            showNotification('Please connect to Supabase before scanning RFID.', 'error');
            return;
        }

        // Find student by RFID in the database
        const { data: student, error } = await ApiService.getStudentByRfid(rfid);
        if (error || !student) {
            showNotification('Student not found with RFID: ' + rfid, 'error');
            console.log(`RFID scan failed: ${rfid} not found in database.`);
            // Update last scanned student to null when not found
            lastScannedStudent = null;
            displayLastScannedStudent(null);
            return;
        }

        // Log successful scan
        console.log(`Student recognized: ${student.name} (RFID: ${rfid})`);

        // Fetch the latest student data to ensure we have the current grade
        const { data: freshStudent, error: freshError } = await ApiService.getStudentByRfid(rfid);
        if (freshError || !freshStudent) {
            console.warn('Could not fetch fresh student data, using cached data');
        }
        const currentStudent = freshStudent || student;

        // Update last scanned student
        lastScannedStudent = currentStudent;
        displayLastScannedStudent(currentStudent);

        // Mark attendance automatically
        const attendanceStatus = getAttendanceStatus();
        const attendance = {
            student_id: currentStudent.id, // Use student_id instead of rfid
            date: todayYmdLocal(), // Only the date part in local time
            status: attendanceStatus,
            grade: currentStudent.grade
        };

        try {
            // Check if attendance record already exists
            const existingAttendance = await ApiService.getAttendanceByStudentAndDate(student.id, attendance.date);

            if (existingAttendance) {
                showNotification(`Attendance already marked for ${student.name} today`, 'info');
            } else {
                const result = await ApiService.addAttendanceRecord(attendance);
                const saved = result[0] || attendance;
                attendanceRecords.push(saved);
                showNotification(`Attendance marked for ${student.name} (${attendanceStatus}) (saved to Supabase)`, 'success');

                // Log notification after successful attendance
                const notification = {
                    student_rfid: student.rfid,
                    student_name: student.name,
                    parent_phone: student.parent_phone,
                    message: `Your child ${student.name} has been marked ${attendanceStatus}`,
                    timestamp: new Date().toISOString(),
                    status: 'sent'
                };
                try {
                    const notifRes = await ApiService.addNotification(notification);
                    notifications.push((notifRes && notifRes[0]) || notification);
                } catch (e) {
                    console.error('Failed to log notification:', e);
                    notification.id = Date.now();
                    notifications.push(notification);
                }
            }
        } catch (error) {
            console.error('Error saving attendance:', error);
            // Fallback to local storage
            attendance.id = Date.now();
            attendanceRecords.push(attendance);
            showNotification(`Attendance marked for ${student.name} (offline mode)`, 'warning');

            // Try to log notification even in offline mode
            const notification = {
                student_rfid: student.rfid,
                student_name: student.name,
                parent_phone: student.parent_phone,
                message: `Your child ${student.name} has been marked present`,
                timestamp: new Date().toISOString(),
                status: 'sent'
            };
            try {
                const notifRes = await ApiService.addNotification(notification);
                notifications.push((notifRes && notifRes[0]) || notification);
            } catch (e) {
                console.error('Failed to log notification (offline):', e);
                notification.id = Date.now();
                notifications.push(notification);
            }
        }

        updateStats();
        loadAttendanceRecords();

        // Update current attendance table on attendance page
        if (window.location.pathname.includes('attendance.html')) {
            loadCurrentAttendance();
        }
    } finally {
        isProcessingScan = false;
        setScanUiState(false);
    }
}

// Enhanced send notification with Supabase using API service
async function sendNotification(rfid) {
        const student = students.find(s => s.rfid === rfid);
        if (!student) {
            showNotification(`Student not found with RFID: ${rfid}`, 'error');
            return;
        }
    
    const notification = {
        student_rfid: rfid,
        student_name: student.name,
        parent_phone: student.parent_phone,
        message: `Your child ${student.name} has arrived at school`,
        timestamp: new Date().toISOString(),
        status: 'sent'
    };
    
    if (isConnected) {
        try {
            const result = await ApiService.addNotification(notification);
            notifications.push(result[0]);
            showNotification(`Notification sent to ${student.parent_phone} (saved to Supabase)`, 'success');
        } catch (error) {
            console.error('Error saving notification to Supabase:', error);
            showNotification('Error sending notification. Using offline mode.', 'error');
            // Fallback to local storage
            notification.id = Date.now();
            notifications.push(notification);
            showNotification(`Notification sent to ${student.parent_phone} (offline mode)`, 'warning');
        }
    } else {
        // Offline mode
        notification.id = Date.now();
        notifications.push(notification);
        showNotification(`Notification sent to ${student.parent_phone} (offline mode)`, 'warning');
    }
    
    updateStats();
}

// Enhanced add student with Supabase using API service
async function handleAddStudent(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const photoFile = e.target.querySelector('input[name="photo"]').files[0];
    const newStudent = {
        student_number: formData.get('student-number') || `STU${String(students.length + 1).padStart(3, '0')}`,
        name: formData.get('name'),
        parent_phone: formData.get('parent-number'),
        grade: formData.get('grade'),
        parent_name: formData.get('parent-name'),
        rfid: formData.get('rfid')
    };

    if (!newStudent.name || !newStudent.student_number || !newStudent.parent_phone || !newStudent.grade || !newStudent.parent_name) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    if (isConnected) {
        try {
            const result = await ApiService.addStudent(newStudent, photoFile);
            students.push(result[0]);
            showNotification('Student added successfully! (saved to Supabase)', 'success');
        } catch (error) {
            console.error('Error saving student to Supabase:', error);
            showNotification('Error adding student. Using offline mode.', 'error');
            // Fallback to local storage
            students.push(newStudent);
            showNotification('Student added successfully! (offline mode)', 'warning');
        }
    } else {
        // Offline mode
        students.push(newStudent);
        showNotification('Student added successfully! (offline mode)', 'warning');
    }

    renderStudents();
    updateStats();
    e.target.reset();

    // Close modal if it exists
    const modal = document.getElementById('student-modal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Trigger real-time update for students page
    if (window.location.pathname.includes('students.html')) {
        renderStudentsWithSort();
    }
}



// Enhanced notification function with complete student credentials
async function sendEnhancedNotification(notification) {
    if (isConnected) {
        try {
            const result = await ApiService.addNotification(notification);
            notifications.push(result[0]);
            showNotification(`Notification sent to ${notification.parent_phone} (saved to Supabase)`, 'success');
        } catch (error) {
            console.error('Error saving enhanced notification to Supabase:', error);
            showNotification('Error sending notification. Using offline mode.', 'error');
            // Fallback to local storage
            notification.id = Date.now();
            notifications.push(notification);
            showNotification(`Notification sent to ${notification.parent_phone} (offline mode)`, 'warning');
        }
    } else {
        // Offline mode
        notification.id = Date.now();
        notifications.push(notification);
        showNotification(`Notification sent to ${notification.parent_phone} (offline mode)`, 'warning');
    }
    
    updateStats();
}

// Enhanced mark attendance with Supabase using API service
async function markAttendance(rfid) {
    if (isProcessingScan) return;
    isProcessingScan = true;
    setScanUiState(true);
    try {
        const student = students.find(s => s.rfid === rfid);
        if (!student) {
            showNotification(`Student not found with RFID: ${rfid}`, 'error');
            // Update last scanned student to null when not found
            lastScannedStudent = null;
            displayLastScannedStudent(null);
            return;
        }

        // Fetch the latest student data to ensure we have the current grade
        const { data: freshStudent, error: freshError } = await ApiService.getStudentByRfid(rfid);
        if (freshError || !freshStudent) {
            console.warn('Could not fetch fresh student data, using cached data');
        }
        const currentStudent = freshStudent || student;

        // Update last scanned student
        lastScannedStudent = currentStudent;
        displayLastScannedStudent(currentStudent);

        const attendanceStatus = getAttendanceStatus();
        const attendance = {
            student_id: currentStudent.id, // Use student_id instead of rfid
            date: todayYmdLocal(), // Only the date part in local time
            status: attendanceStatus,
            grade: currentStudent.grade
        };

        try {
            // Check if attendance record already exists
            const existingAttendance = await ApiService.getAttendanceByStudentAndDate(student.id, attendance.date);

            if (existingAttendance) {
                showNotification(`Attendance already marked for ${student.name} today`, 'info');
            } else {
                const result = await ApiService.addAttendanceRecord(attendance);
                const saved = result[0] || attendance;
                attendanceRecords.push(saved);
                showNotification(`Attendance marked for ${student.name} (${attendanceStatus}) (saved to Supabase)`, 'success');

                // Log notification after successful attendance
                const notification = {
                    student_rfid: student.rfid,
                    student_name: student.name,
                    parent_phone: student.parent_phone,
                    message: `Your child ${student.name} has been marked ${attendanceStatus}`,
                    timestamp: new Date().toISOString(),
                    status: 'sent'
                };
                try {
                    const notifRes = await ApiService.addNotification(notification);
                    notifications.push((notifRes && notifRes[0]) || notification);
                } catch (e) {
                    console.error('Failed to log notification:', e);
                    notification.id = Date.now();
                    notifications.push(notification);
                }
            }
        } catch (error) {
            console.error('Error saving attendance:', error);
            // Fallback to local storage
            attendance.id = Date.now();
            attendanceRecords.push(attendance);
            showNotification(`Attendance marked for ${student.name} (offline mode)`, 'warning');

            // Try to log notification even in offline mode
            const notification = {
                student_rfid: student.rfid,
                student_name: student.name,
                parent_phone: student.parent_phone,
                message: `Your child ${student.name} has been marked present`,
                timestamp: new Date().toISOString(),
                status: 'sent'
            };
            try {
                const notifRes = await ApiService.addNotification(notification);
                notifications.push((notifRes && notifRes[0]) || notification);
            } catch (e) {
                console.error('Failed to log notification (offline):', e);
                notification.id = Date.now();
                notifications.push(notification);
            }
        }

        updateStats();
        loadAttendanceRecords();
    } finally {
        isProcessingScan = false;
        setScanUiState(false);
    }
}

function setScanUiState(disabled) {
    const ids = ['rfid-input','scan-rfid-btn','process-image-btn','start-simulation-btn','stop-simulation-btn'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = !!disabled;
        }
    });
}

function setupRfidScanner() {
    const rfidInput = document.getElementById('rfid-input');
    const scanBtn = document.getElementById('scan-rfid-btn');
    const uploadArea = document.getElementById('upload-area');
    const imageInput = document.getElementById('rfid-image-input');
    const processImageBtn = document.getElementById('process-image-btn');
    const startSimulationBtn = document.getElementById('start-simulation-btn');
    const stopSimulationBtn = document.getElementById('stop-simulation-btn');
    
    // Manual scan functionality
    if (rfidInput && scanBtn) {
        scanBtn.addEventListener('click', () => {
            const rfid = rfidInput.value.trim();
            if (!rfid) {
                showNotification('Please enter an RFID to scan', 'error');
                return;
            }
            if (!validateRfidFormat(rfid)) {
                showNotification('Invalid RFID format. Use 3-32 alphanumeric characters.', 'error');
                return;
            }
            simulateScanAnimation(() => handleRfidScan(rfid));
            rfidInput.value = ''; // Clear input after scan
        });
        
        rfidInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const rfid = rfidInput.value.trim();
                if (!rfid) return;
                if (!validateRfidFormat(rfid)) {
                    showNotification('Invalid RFID format. Use 3-32 alphanumeric characters.', 'error');
                    return;
                }
                simulateScanAnimation(() => handleRfidScan(rfid));
                rfidInput.value = ''; // Clear input after scan
            }
        });
        
        rfidInput.focus();
    }
    
    // Image upload functionality
    if (uploadArea && imageInput) {
        // Click to browse
        uploadArea.addEventListener('click', () => {
            imageInput.click();
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleImageUpload(files[0]);
            }
        });
        
        // File input change
        imageInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleImageUpload(e.target.files[0]);
            }
        });
    }
    
    // Process image button
    if (processImageBtn) {
        processImageBtn.addEventListener('click', processUploadedImage);
    }
    
    // Simulation controls
    if (startSimulationBtn && stopSimulationBtn) {
        startSimulationBtn.addEventListener('click', startSimulation);
        stopSimulationBtn.addEventListener('click', stopSimulation);
    }
}

// Handle image upload
function handleImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        showNotification('Please upload an image file', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewImage = document.getElementById('preview-image');
        const imagePreview = document.getElementById('image-preview');
        const uploadArea = document.getElementById('upload-area');
        
        previewImage.src = e.target.result;
        uploadArea.style.display = 'none';
        imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// Process uploaded image to extract RFID
async function processUploadedImage() {
    const previewImage = document.getElementById('preview-image');
    const imagePreview = document.getElementById('image-preview');
    const uploadArea = document.getElementById('upload-area');
    
    simulateScanAnimation(async () => {
        try {
            // For demonstration, we'll simulate OCR extraction
            const simulatedRfid = extractRfidFromImageSimulation();
            
            if (simulatedRfid) {
                handleRfidScan(simulatedRfid);
                showNotification(`RFID extracted from image: ${simulatedRfid}`, 'success');
            } else {
                showNotification('No RFID found in the image', 'error');
            }
            
            // Reset image preview
            previewImage.src = '';
            imagePreview.style.display = 'none';
            uploadArea.style.display = 'block';
            
        } catch (error) {
            console.error('Error processing image:', error);
            showNotification('Error processing image', 'error');
        }
    });
}

// Simulate RFID extraction from image (placeholder for OCR)
function extractRfidFromImageSimulation() {
    // This is a simulation - in a real implementation, use OCR
    const rfidPatterns = ['STU001', 'STU002', 'STU003', 'STU004', 'STU005'];
    return rfidPatterns[Math.floor(Math.random() * rfidPatterns.length)];
}

// Automatic simulation variables
let simulationInterval = null;
let simulationRunning = false;

// Start automatic simulation
function startSimulation() {
    const intervalInput = document.getElementById('scan-interval');
    const startBtn = document.getElementById('start-simulation-btn');
    const stopBtn = document.getElementById('stop-simulation-btn');
    const interval = parseInt(intervalInput.value) * 1000 || 10000; // Default to 10 seconds if not set

    if (simulationRunning) return;

    simulationRunning = true;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';

    showNotification('Simulation started - scanning every ' + (interval/1000) + ' seconds', 'success');
    
    // Initial scan
    performSimulatedScan();
    
    // Set up interval
    simulationInterval = setInterval(performSimulatedScan, interval);
}

// Stop automatic simulation
function stopSimulation() {
    const startBtn = document.getElementById('start-simulation-btn');
    const stopBtn = document.getElementById('stop-simulation-btn');
    
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    
    simulationRunning = false;
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    
    showNotification('Simulation stopped', 'info');
}

// Perform a single simulated scan
async function performSimulatedScan() {
    if (isProcessingScan) return;
    // Generate a random RFID code for simulation
    // Use both registered and unregistered RFID patterns for testing
    const rfidPatterns = [
        'STU001', 'STU002', 'STU003', 'STU004', 'STU005', // Registered students
        'UNR001', 'UNR002', 'UNR003', 'UNR004', 'UNR005'  // Unregistered students
    ];

    const randomRfid = rfidPatterns[Math.floor(Math.random() * rfidPatterns.length)];

    simulateScanAnimation(async () => {
        if (isProcessingScan) return;
        isProcessingScan = true;
        setScanUiState(true);
        try {
            try {
                // Check if RFID exists in the database
                const { data: student, error } = await ApiService.getStudentByRfid(randomRfid);

                if (error || !student) {
                    // RFID not found in database - unregistered student
                    showNotification(`Unregistered student: RFID ${randomRfid} not found in database`, 'error');
                    console.log(`RFID scan failed: ${randomRfid} not found in database.`);
                    // Update last scanned student to null when not found
                    lastScannedStudent = null;
                    displayLastScannedStudent(null);
                    return;
                } else {
                    // RFID found - registered student
                    console.log(`Student recognized: ${student.name} (RFID: ${randomRfid})`);

                    // Fetch the latest student data to ensure we have the current grade
                    const { data: freshStudent, error: freshError } = await ApiService.getStudentByRfid(randomRfid);
                    if (freshError || !freshStudent) {
                        console.warn('Could not fetch fresh student data, using cached data');
                    }
                    const currentStudent = freshStudent || student;

                    // Update last scanned student
                    lastScannedStudent = currentStudent;
                    displayLastScannedStudent(currentStudent);

        // Mark attendance automatically
        const attendanceStatus = getAttendanceStatus();
        const attendance = {
            student_id: currentStudent.id,
            date: todayYmdLocal(),
            status: attendanceStatus,
            grade: currentStudent.grade
        };

                    try {
                        // Check if attendance record already exists
                        const existingAttendance = await ApiService.getAttendanceByStudentAndDate(student.id, attendance.date);

                        if (existingAttendance) {
                            showNotification(`Attendance already marked for ${student.name} today`, 'info');
                        } else {
                            const result = await ApiService.addAttendanceRecord(attendance);
                            const saved = result[0] || attendance;
                            attendanceRecords.push(saved);
                            showNotification(`Attendance marked for ${student.name} (${attendanceStatus}) (RFID: ${randomRfid})`, 'success');

                            // Log notification after successful attendance
                            const notification = {
                                student_rfid: student.rfid,
                                student_name: student.name,
                                parent_phone: student.parent_phone,
                                message: `Your child ${student.name} has been marked ${attendanceStatus}`,
                                timestamp: new Date().toISOString(),
                                status: 'sent'
                            };
                            try {
                                const notifRes = await ApiService.addNotification(notification);
                                notifications.push((notifRes && notifRes[0]) || notification);
                            } catch (e) {
                                console.error('Failed to log notification:', e);
                                notification.id = Date.now();
                                notifications.push(notification);
                            }
                        }
                    } catch (error) {
                        console.error('Error saving attendance:', error);
                        // Fallback to local storage
                        attendance.id = Date.now();
                        attendanceRecords.push(attendance);
                        showNotification(`Attendance marked for ${student.name} (offline mode)`, 'warning');

                        // Try to log notification even in offline mode
                        const notification = {
                            student_rfid: student.rfid,
                            student_name: student.name,
                            parent_phone: student.parent_phone,
                            message: `Your child ${student.name} has been marked present`,
                            timestamp: new Date().toISOString(),
                            status: 'sent'
                        };
                        try {
                            const notifRes = await ApiService.addNotification(notification);
                            notifications.push((notifRes && notifRes[0]) || notification);
                        } catch (e) {
                            console.error('Failed to log notification (offline):', e);
                            notification.id = Date.now();
                            notifications.push(notification);
                        }
                    }

                    updateStats();
                    renderAttendance();

                    // Update current attendance table on attendance page
                    if (window.location.pathname.includes('attendance.html')) {
                        loadCurrentAttendance();
                    }
                }
            } catch (error) {
                console.error('Error during simulated scan:', error);
                showNotification('Error processing simulated scan', 'error');
            }
        } finally {
            isProcessingScan = false;
            setScanUiState(false);


        }
    });
}

// Simulate scanning animation
function simulateScanAnimation(callback) {
    const statusIndicator = document.getElementById('status-indicator');
    const scanAnimation = document.getElementById('scan-animation');
    
    // Show scanning animation
    statusIndicator.style.display = 'none';
    scanAnimation.style.display = 'flex';
    
    // Simulate scanning delay
    setTimeout(() => {
        // Hide animation and show status
        scanAnimation.style.display = 'none';
        statusIndicator.style.display = 'flex';
        
        // Execute callback (actual scan processing)
        if (callback) callback();
    }, 1500); // 1.5 second scanning animation
}

// Theme toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Sidebar theme toggle functionality
    const sidebarThemeToggle = document.getElementById('sidebar-theme-toggle');
    if (sidebarThemeToggle) {
        sidebarThemeToggle.addEventListener('click', toggleTheme);
    }

    // Load saved theme (only update icons since theme is already applied)
    const savedTheme = localStorage.getItem('theme') || 'light';
    updateThemeIcon(savedTheme);
});

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    // Update sidebar theme toggle icon
    const sidebarThemeToggle = document.getElementById('sidebar-theme-toggle');
    if (sidebarThemeToggle) {
        const sidebarIcon = sidebarThemeToggle.querySelector('i');
        if (sidebarIcon) {
            sidebarIcon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
}



// Make functions globally available
window.isConnected = isConnected;
window.students = students;
window.markAttendance = markAttendance;
window.sendNotification = sendNotification;
window.handleRfidScan = handleRfidScan;
window.toggleEditMode = toggleEditMode;
window.openEditModal = openEditModal;
window.confirmArchive = confirmArchive;


// Add the missing functions for student management
function toggleEditMode(studentId, event) {
    event.stopPropagation(); // Prevent card click
    const student = students.find(s => s.id == studentId);
    if (!student) return;

    // Remove any existing overlays
    document.querySelectorAll('.edit-mode-overlay').forEach(overlay => overlay.remove());

    // Create edit mode overlay
    const editOverlay = document.createElement('div');
    editOverlay.className = 'edit-mode-overlay';
    editOverlay.innerHTML = `
        <div class="edit-actions">
            <button class="btn btn-primary btn-sm" onclick="openEditModal('${studentId}')">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmArchive('${studentId}', '${student.name.replace(/'/g, "\\'")}')">
                <i class="fas fa-archive"></i> Archive
            </button>
        </div>
    `;

    // Position the overlay relative to the button
    const button = event.target.closest('.btn-icon');
    if (button) {
        button.style.position = 'relative';
        button.appendChild(editOverlay);
    }

    // Close overlay when clicking outside
    const closeOverlay = (e) => {
        if (!editOverlay.contains(e.target)) {
            editOverlay.remove();
            document.removeEventListener('click', closeOverlay);
        }
    };
    setTimeout(() => document.addEventListener('click', closeOverlay), 10);
}

function openEditModal(studentId) {
    const student = students.find(s => s.id == studentId);
    if (!student) return;

    const modal = document.getElementById('edit-student-modal');
    if (!modal) return;

    const idField = document.getElementById('edit-student-id');
    const numberField = document.getElementById('edit-student-number');
    const nameField = document.getElementById('edit-student-name');
    const parentNameField = document.getElementById('edit-parent-name');
    const parentNumberField = document.getElementById('edit-parent-number');
    const gradeField = document.getElementById('edit-student-grade');

    if (idField) idField.value = student.id;
    if (numberField) numberField.value = student.student_number || '';
    if (nameField) nameField.value = student.name || '';
    if (parentNameField) parentNameField.value = student.parent_name || '';
    if (parentNumberField) parentNumberField.value = student.parent_number || student.parentPhone || '';
    if (gradeField) gradeField.value = student.grade || '';

    modal.style.display = 'block';
}

function confirmArchive(studentId, studentName) {
    document.getElementById('archive-student-name').textContent = studentName;
    document.getElementById('confirm-archive').dataset.studentId = studentId;
    document.getElementById('archive-confirm-modal').style.display = 'block';
}

// Make openStudentDetailsModal globally available
window.openStudentDetailsModal = function(studentId) {
    // Open edit modal instead of details modal for now
    openEditModal(studentId);
};

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeApp,
        setupEventListeners,
        loadInitialData,
        updateStats,
        renderStudents,
        handleSearch,
        handleAddStudent,
        markAttendance,
        sendNotification,
        handleRfidScan,
        toggleEditMode,
        openEditModal,
        confirmArchive
    };
}
