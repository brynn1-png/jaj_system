// RFID Scanner Module
// Handles RFID scanning and integration with Supabase database
// Note: This file uses ES6 modules, so it must be loaded with type="module" in HTML

import ApiService from './api.js';

// Wait for Supabase client to be available before initializing
function waitForSupabaseClient() {
    return new Promise((resolve) => {
        const checkClient = () => {
            if (window.supabaseClient) {
                resolve();
            } else {
                setTimeout(checkClient, 100);
            }
        };
        checkClient();
    });
}

class RFIDScanner {
    constructor() {
        this.input = null;
        this.status = null;
        this.connectionStatus = null;
        this.isConnected = false;
        this.scanTimeout = null;
        this.lastScannedTag = null;
        this.lastScanTime = 0;
    }

    // Initialize the scanner
    init() {
        console.log('Initializing RFID Scanner...');
        this.setupElements();
        this.setupEventListeners();
        this.checkConnection();
        this.startConnectionMonitoring();
    }

    // Setup DOM elements
    setupElements() {
        this.input = document.getElementById('rfidInput');
        this.status = document.getElementById('status');
        this.connectionStatus = document.getElementById('connectionStatus');

        if (!this.input) {
            console.error('RFID input element not found');
            return;
        }

        // Focus on input for immediate scanning
        this.input.focus();
    }

    // Setup event listeners
    setupEventListeners() {
        if (!this.input) return;

        // RFID input must always be focused for scanning - intercept all keyboard input
        const ensureFocus = () => {
            if (this.input && document.hasFocus() && !document.hidden) {
                this.input.focus();
            }
        };

        // Global keyboard event interception for RFID scanning
        const handleKeyDown = (e) => {
            // If RFID input is not focused and user is typing, redirect to RFID input
            if (document.activeElement !== this.input && this.input) {
                // Only redirect if it's likely RFID input (rapid alphanumeric characters)
                if (e.key.length === 1 && e.key.match(/[a-zA-Z0-9]/) && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Append to RFID input
                    this.input.value += e.key;
                    this.input.focus();

                    // Trigger input event
                    this.input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        };

        // Add global keydown listener to capture RFID input anywhere
        document.addEventListener('keydown', handleKeyDown, true);

        // Ensure RFID input stays focused
        window.addEventListener('focus', () => {
            setTimeout(ensureFocus, 10);
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                setTimeout(ensureFocus, 10);
            }
        });

        // Handle RFID input
        this.input.addEventListener('input', (e) => {
            this.handleScan(e.target.value.trim());
        });

        // Handle the full-screen capture overlay
        const captureOverlay = document.getElementById('rfidCapture');
        if (captureOverlay) {
            // Make overlay capture focus and redirect to RFID input
            captureOverlay.addEventListener('focus', () => {
                if (this.input) {
                    this.input.focus();
                }
            });

            // Intercept input on the overlay and redirect to RFID input
            captureOverlay.addEventListener('input', (e) => {
                const content = e.target.textContent || '';
                if (content && this.input) {
                    // Transfer content to RFID input
                    this.input.value = content;
                    this.input.dispatchEvent(new Event('input', { bubbles: true }));

                    // Clear overlay
                    e.target.textContent = '';
                }
            });

            // Keep overlay focused to capture any stray input
            const keepOverlayFocused = () => {
                if (document.activeElement !== this.input && document.activeElement !== captureOverlay) {
                    captureOverlay.focus();
                }
            };

            // Focus overlay initially and periodically
            setTimeout(() => captureOverlay.focus(), 200);
            setInterval(keepOverlayFocused, 500);
        }

        // Initial focus
        setTimeout(ensureFocus, 100);
    }

    // Handle RFID scan input
    async handleScan(tag) {
        // Take only the first 8 digits of the scanner input
        const processedTag = tag.substring(0, 8);

        // Must have at least 8 characters to process
        if (processedTag.length < 8) return;

        // Prevent rapid scanning of the same tag or partial tags
        const currentTime = Date.now();
        const timeDiff = currentTime - this.lastScanTime;

        // If same tag scanned within 3 seconds, ignore
        if (this.lastScannedTag === processedTag && timeDiff < 3000) {
            return;
        }

        // If it's a partial tag (shorter than previous and recent), ignore
        if (this.lastScannedTag && processedTag.length < this.lastScannedTag.length && timeDiff < 1000) {
            return;
        }

        // Clear any pending timeout
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
        }

        // Set timeout to process the scan after a brief delay to ensure complete tag
        this.scanTimeout = setTimeout(async () => {
            console.log('RFID scanned (first 8 digits):', processedTag);
            this.updateStatus(`Processing scan: ${processedTag}`, 'processing');

            try {
                const result = await this.insertRFIDScan(processedTag);

                if (result.success) {
                    console.log('RFID scan inserted successfully:', result);
                    this.updateStatus(`✅ RFID ${processedTag} recorded successfully!`, 'success');
                    this.playSuccessSound();

                    // Update tracking variables
                    this.lastScannedTag = processedTag;
                    this.lastScanTime = Date.now();

                    // Show scan result and auto-hide after 3 seconds
                    this.showScanResult(processedTag);
                } else {
                    throw new Error(result.error || 'Failed to save scan');
                }

            } catch (error) {
                console.error('Error saving RFID scan:', error);
                this.updateStatus(`❌ Error saving scan: ${error.message}`, 'error');
                this.playErrorSound();
            }

            // Clear input for next scan after delay
            setTimeout(() => {
                if (this.input) this.input.value = '';
                this.updateStatus('Waiting for scan...', 'waiting');
            }, 2000);
        }, 500); // Wait 500ms to ensure complete tag is received
    }

    // Insert RFID scan into Supabase rfid_scans table
    async insertRFIDScan(rfidTag) {
        if (!window.supabaseClient) {
            throw new Error('Supabase client not available');
        }

        const scanData = {
            rfid_tag: rfidTag
            // scanned_at will use the database default (now())
        };

        console.log('Inserting RFID scan data:', scanData);

        const { data, error } = await window.supabaseClient
            .from('rfid_scans')
            .insert([scanData])
            .select('*'); // Add select to get the inserted data

        console.log('RFID scan insert result - data:', data, 'error:', error);

        if (error) {
            throw new Error(error.message);
        }

        // Now process attendance immediately after scan
        try {
            await this.processAttendanceForScan(rfidTag);
        } catch (attendanceError) {
            console.error('Error processing attendance for scan:', attendanceError);
            // Don't throw here - scan was successful, attendance processing failed
        }

        return { success: true, data };
    }

    // Process attendance for a scanned RFID tag
    async processAttendanceForScan(rfidTag) {
        console.log('Processing attendance for RFID:', rfidTag);

        // Find student by RFID
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
            rfid_tag: rfidTag,
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
    }

    // Check connection to Supabase
    async checkConnection() {
        try {
            if (!window.supabaseClient) {
                throw new Error('Supabase client not available');
            }

            // Test connection by trying to select from rfid_scans table
            const { data, error } = await window.supabaseClient
                .from('rfid_scans')
                .select('rfid_tag')
                .limit(1);

            if (error) {
                throw error;
            }

            this.isConnected = true;
            this.updateConnectionStatus(true);
            return true;
        } catch (error) {
            console.error('Connection check failed:', error);
            this.isConnected = false;
            this.updateConnectionStatus(false);
            return false;
        }
    }

    // Retry connection check with exponential backoff
    async retryConnectionCheck(maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const success = await this.checkConnection();
                if (success) {
                    return true;
                }
            } catch (error) {
                console.log(`Connection check attempt ${attempt} failed:`, error.message);
            }

            if (attempt < maxRetries) {
                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        return false;
    }

    // Start monitoring connection status
    startConnectionMonitoring() {
        // Check connection every 30 seconds with retry logic
        setInterval(async () => {
            const success = await this.retryConnectionCheck(3);
            if (!success) {
                console.warn('Connection monitoring: All retry attempts failed');
            }
        }, 30000);
    }

    // Update status message
    updateStatus(message, type = 'waiting') {
        if (!this.status) return;

        this.status.textContent = message;
        this.status.className = 'message';

        // Add type-specific styling
        switch (type) {
            case 'success':
                this.status.classList.add('success');
                break;
            case 'error':
                this.status.classList.add('error');
                break;
            case 'processing':
                // Keep default color for processing
                break;
            default:
                // Default waiting state
                break;
        }
    }

    // Update connection status indicator
    updateConnectionStatus(connected) {
        if (!this.connectionStatus) return;

        if (connected) {
            this.connectionStatus.textContent = 'Connected to Supabase';
            this.connectionStatus.className = 'connection-status connected';
        } else {
            this.connectionStatus.textContent = 'Disconnected from Supabase';
            this.connectionStatus.className = 'connection-status disconnected';
        }
    }

    // Play success sound
    playSuccessSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQdBzeP0fLNfCsE');
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
            // Silently fail if audio not supported
        }
    }

    // Play error sound
    playErrorSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmQdBzeP0fLNfCsE');
            audio.volume = 0.1;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (error) {
            // Silently fail if audio not supported
        }
    }

    // Show scan result in the scan-result-content div
    showScanResult(rfidTag) {
        const scanResultContent = document.getElementById('scan-result-content');
        if (!scanResultContent) return;

        // Find student by RFID to show details
        ApiService.getStudentByRfid(rfidTag).then(({ data: student, error }) => {
            // Get existing elements (they should already be there from initial page load)
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
            if (error || !student) {
                // Show unknown student message
                avatar.textContent = '?';
                name.textContent = 'Unknown Student';
                info.innerHTML = `<span><i class="fas fa-id-card"></i> RFID: ${rfidTag}</span>`;
                timestamp.textContent = `Scanned at ${new Date().toLocaleTimeString()}`;
            } else {
    // Show student details
        const avatarText = student.avatar || student.avatars || student.name.split(' ').map(n => n[0]).join('').toUpperCase();
        if (student.avatar || student.avatars) {
            // If avatar URL exists, create an image element
            avatar.innerHTML = `<img src="${student.avatar || student.avatars}" alt="${student.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            // Fallback to initials
            avatar.textContent = avatarText;
        }
                name.textContent = student.name;
                info.innerHTML = `
                    <span><i class="fas fa-graduation-cap"></i> Grade ${student.grade || 'N/A'}</span>
                    <span><i class="fas fa-id-card"></i> RFID: ${rfidTag}</span>
                `;
                timestamp.textContent = `Scanned at ${new Date().toLocaleTimeString()}`;
            }

            // Make sure it's visible
            studentInfo.style.opacity = '1';

            // Auto-hide after 15 seconds by fading out
            setTimeout(() => {
                if (studentInfo) {
                    studentInfo.style.opacity = '0';
                    studentInfo.style.transition = 'opacity 0.5s ease-out';
                }
            }, 14500); // Start fade 0.5s before full hide (total 15s)
        });
    }

    // Manual scan for testing
    manualScan(rfidTag) {
        if (this.input) {
            this.input.value = rfidTag;
            this.input.dispatchEvent(new Event('input'));
        }
    }
}

// Global RFID Scanner instance
window.RFIDScanner = new RFIDScanner();

// Initialize when DOM is ready and Supabase client is available
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for Supabase client to be initialized
    await waitForSupabaseClient();

    if (window.RFIDScanner) {
        window.RFIDScanner.init();
    }
});
