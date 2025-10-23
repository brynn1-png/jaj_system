// RFID File Monitor Server
// Node.js server to monitor RFID scan file and serve data to web app

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

class RFIDFileServer {
    constructor() {
        this.app = express();
        this.port = 3001;
        this.scanFile = 'C:\\rfid_scans.txt';
        this.lastModified = null;
        this.processedScans = new Set();

        this.setupMiddleware();
        this.setupRoutes();
        this.startFileMonitoring();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../')));
    }

    setupRoutes() {
        // Get recent scans
        this.app.get('/api/rfid/scans', (req, res) => {
            try {
                const scans = this.readNewScans();
                res.json({ success: true, scans });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Clear processed scans
        this.app.post('/api/rfid/clear', (req, res) => {
            this.processedScans.clear();
            res.json({ success: true, message: 'Processed scans cleared' });
        });

        // Update scan file path
        this.app.post('/api/rfid/config', (req, res) => {
            const { scanFile } = req.body;
            if (scanFile) {
                this.scanFile = scanFile;
                res.json({ success: true, message: 'Scan file updated' });
            } else {
                res.status(400).json({ success: false, error: 'Scan file path required' });
            }
        });

        // Health check
        this.app.get('/api/health', (req, res) => {
            res.json({
                success: true,
                status: 'running',
                scanFile: this.scanFile,
                processedScans: this.processedScans.size
            });
        });
    }

    startFileMonitoring() {
        console.log(`Monitoring RFID scan file: ${this.scanFile}`);

        // Check if file exists, create if not
        if (!fs.existsSync(this.scanFile)) {
            fs.writeFileSync(this.scanFile, '', 'utf8');
            console.log('Created RFID scan file');
        }

        // Monitor file for changes
        setInterval(() => {
            this.checkFileForChanges();
        }, 1000); // Check every second
    }

    checkFileForChanges() {
        try {
            const stats = fs.statSync(this.scanFile);
            const modified = stats.mtime.getTime();

            if (this.lastModified === null || modified > this.lastModified) {
                this.lastModified = modified;
                // File has been modified, check for new scans
                const newScans = this.readNewScans();
                if (newScans.length > 0) {
                    console.log(`Found ${newScans.length} new RFID scans`);
                }
            }
        } catch (error) {
            console.error('Error checking file:', error);
        }
    }

    readNewScans() {
        try {
            if (!fs.existsSync(this.scanFile)) {
                return [];
            }

            const content = fs.readFileSync(this.scanFile, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            const newScans = [];

            for (const line of lines) {
                const rfid = line.trim();
                if (rfid && !this.processedScans.has(rfid)) {
                    newScans.push({
                        rfid: rfid,
                        timestamp: new Date().toISOString()
                    });
                    this.processedScans.add(rfid);
                }
            }

            return newScans;
        } catch (error) {
            console.error('Error reading scan file:', error);
            return [];
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`RFID File Server running on port ${this.port}`);
            console.log(`Monitoring file: ${this.scanFile}`);
            console.log('Web app should connect to http://localhost:3001');
        });
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new RFIDFileServer();
    server.start();
}

module.exports = RFIDFileServer;
