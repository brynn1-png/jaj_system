// RFID Scanner Integration Module
// Monitors a text file for RFID scans and stores them in Supabase

import ApiService from './api.js';

class RFIDMonitor {
    constructor() {
        this.scanFile = 'C:\\rfid_scans.txt'; // Default scan file location
        this.lastScanTime = Date.now();
        this.scanInterval = 1000; // Check every 1 second
        this.processedScans = new Set(); // Track processed scans to avoid duplicates
        this.isMonitoring = false;
        this.monitorInterval = null;
    }

    // Initialize the RFID monitor
    async init() {
        console.log('Initializing RFID Monitor...');
        this.loadSettings();
        this.setupFileWatcher();
        this.showStatus();
    }

    // Load user settings from localStorage
    loadSettings() {
        const savedFile = localStorage.getItem('rfidScanFile');
        if (savedFile) {
            this.scanFile = savedFile;
        }
        const savedInterval = localStorage.getItem('rfidScanInterval');
        if (savedInterval) {
            this.scanInterval = parseInt(savedInterval);
        }
    }

    // Setup file monitoring
    setupFileWatcher() {
        console.log(`Monitoring file: ${this.scanFile}`);
        this.monitorInterval = setInterval(() => {
            this.checkForNewScans();
        }, this.scanInterval);
        this.isMonitoring = true;
    }

    // Check for new RFID scans in the file
    async checkForNewScans() {
        try {
            // In a real implementation, this would read from the file system
            // For web browser limitations, we'll use a simulated approach
            // or require a local server/electron app for file access

            // For now, we'll create a polling mechanism that can be extended
            const newScans = await this.readNewScans();

            for (const scan of newScans) {
                if (!this.processedScans.has(scan.rfid)) {
                    await this.processRFIDScan(scan);
                    this.processedScans.add(scan.rfid);
                }
            }
        } catch (error) {
            console.error('Error checking for RFID scans:', error);
        }
    }

    // Read new scans from the file (simulated for browser environment)
    async readNewScans() {
        // This is a placeholder - in a real implementation, you'd need:
        // 1. A local server (Node.js/Express) to read files
        // 2. Electron app for desktop file access
        // 3. File system API access

        // For demonstration, we'll return empty array
        // The actual implementation would read from the text file
        return [];
    }

    // Process an RFID scan - now stores in MySQL database via RFID database server and processes attendance
    async processRFIDScan(scanData) {
        const { rfid, timestamp } = scanData;

        try {
            // Store raw RFID scan data in MySQL database via the RFID database server
            const scanRecord = {
                rfid_tag: rfid,
                student_id: null // Optional: can be populated if student is known
            };

            const response = await fetch('http://localhost:3001/api/rfid/insert-scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(scanRecord)
            });

            const result = await response.json();

            if (result.success) {
                console.log(`RFID scan stored in MySQL database: ${rfid}, ID: ${result.scanId}`);

                // Now process attendance immediately after storing the scan
                await this.processAttendanceForScan(rfid);
            } else {
                throw new Error(result.error || 'Failed to insert RFID scan');
            }

        } catch (error) {
            console.error('Error storing RFID scan:', error);
        }
    }

    // Process attendance for a scanned RFID tag
    async processAttendanceForScan(rfidTag) {
        console.log('Processing attendance for RFID:', rfidTag);

        try {
            // Find student by RFID using ApiService
            const { data: student, error } = await ApiService.getStudentByRfid(rfidTag);

            if (error || !student) {
                console.log(`No student found for RFID: ${rfidTag}`);
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
            console.error('Error processing attendance for scan:', error);
        }
    }

    // Find student by RFID tag
    async findStudentByRFID(rfid) {
        try {
            // This would integrate with your existing API
            const students = await ApiService.fetchStudents();
            return students.find(student => student.rfid === rfid);
        } catch (error) {
            console.error('Error finding student by RFID:', error);
            return null;
        }
    }

    // Mark attendance for student
    async markAttendance(student, timestamp = new Date()) {
        const attendanceRecord = {
            student_id: student.id,
            status: 'present',
            date: timestamp.toISOString().split('T')[0]
        };

        try {
            await ApiService.addAttendanceRecord(attendanceRecord);
        } catch (error) {
            console.error('Error marking attendance:', error);
            throw error;
        }
    }

    // Update dashboard with new attendance
    updateDashboard(student) {
        // Trigger dashboard updates if dashboard functions are available
        if (typeof window.updateAttendanceStats === 'function') {
            window.updateAttendanceStats();
        }

        // Update real-time attendance log if on dashboard
        if (window.location.pathname.includes('dashboard.html')) {
            this.addToRealtimeLog(student);
        }
    }

    // Add entry to real-time attendance log
    addToRealtimeLog(student) {
        const tableBody = document.getElementById('attendance-table-body');
        if (!tableBody) return;

        const now = new Date();
        const timeString = now.toLocaleTimeString('en-GB', { hour12: false });

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${student.name}</td>
            <td>${timeString}</td>
            <td><span class="status-present">Present</span></td>
        `;

        // Remove empty state if present
        const emptyRow = tableBody.querySelector('.empty-state');
        if (emptyRow) {
            emptyRow.remove();
        }

        // Add new row at the top
        tableBody.insertBefore(row, tableBody.firstChild);

        // Keep only last 50 entries
        while (tableBody.children.length > 50) {
            tableBody.removeChild(tableBody.lastChild);
        }
    }

    // Show notification for successful scan
    showScanNotification(student) {
        const notification = {
            type: 'success',
            title: 'RFID Scan Detected',
            message: `${student.name} marked present`,
            icon: 'fas fa-check-circle'
        };

        if (typeof showNotification === 'function') {
            showNotification(notification.message);
        }

        this.playScanSound();
    }

    // Show notification for unknown RFID
    showUnknownRFIDNotification(rfid) {
        const notification = {
            type: 'warning',
            title: 'Unknown RFID Tag',
            message: `RFID ${rfid} not recognized`,
            icon: 'fas fa-exclamation-triangle'
        };

        if (typeof showNotification === 'function') {
            showNotification(notification.message);
        }
    }

    // Play scan sound
    playScanSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQdBzeP0fLNfCsE');
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
            // Silently fail if audio not supported
        }
    }

    // Show monitoring status
    showStatus() {
        const status = {
            isMonitoring: this.isMonitoring,
            scanFile: this.scanFile,
            scanInterval: this.scanInterval,
            processedScans: this.processedScans.size
        };

        console.log('RFID Monitor Status:', status);
    }

    // Configure scan file location
    setScanFile(filePath) {
        this.scanFile = filePath;
        localStorage.setItem('rfidScanFile', filePath);
        console.log(`Scan file updated to: ${filePath}`);
    }

    // Configure scan interval
    setScanInterval(interval) {
        this.scanInterval = interval;
        localStorage.setItem('rfidScanInterval', interval.toString());

        // Restart monitoring with new interval
        if (this.isMonitoring) {
            this.stopMonitoring();
            this.setupFileWatcher();
        }

        console.log(`Scan interval updated to: ${interval}ms`);
    }

    // Stop monitoring
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        this.isMonitoring = false;
        console.log('RFID monitoring stopped');
    }

    // Start monitoring
    startMonitoring() {
        if (!this.isMonitoring) {
            this.setupFileWatcher();
            console.log('RFID monitoring started');
        }
    }

    // Manual scan input (for testing)
    async manualScan(rfid) {
        const scanData = {
            rfid: rfid,
            timestamp: new Date()
        };

        await this.processRFIDScan(scanData);
    }

    // Clear processed scans history
    clearProcessedScans() {
        this.processedScans.clear();
        console.log('Processed scans history cleared');
    }
}

// Global RFID Monitor instance
window.RFIDMonitor = new RFIDMonitor();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.RFIDMonitor) {
        window.RFIDMonitor.init();
    }
});

export default RFIDMonitor;
