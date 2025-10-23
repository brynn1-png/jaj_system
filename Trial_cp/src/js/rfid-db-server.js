// RFID Database Monitor Server
// Node.js server to monitor RFID scan database (mysql06381030) and serve data to web app

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

class RFIDDatabaseServer {
    constructor() {
        this.app = express();
        this.port = 3001;
        this.dbConfig = {
            host: 'localhost',
            user: 'root', // Update with your MySQL username
            password: '', // Update with your MySQL password
            database: 'mysql06381030', // Your database name
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        };
        this.lastScanId = 0; // Track the last processed scan ID
        this.connection = null;

        this.setupMiddleware();
        this.setupRoutes();
        this.initializeDatabase();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('src'));
    }

    setupRoutes() {
        // Get recent scans
        this.app.get('/api/rfid/scans', async (req, res) => {
            try {
                const scans = await this.getNewScans();
                res.json({ success: true, scans });
            } catch (error) {
                console.error('Error fetching scans:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Clear processed scans
        this.app.post('/api/rfid/clear', async (req, res) => {
            try {
                this.lastScanId = await this.getLatestScanId();
                res.json({ success: true, message: 'Processed scans cleared' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Update database config
        this.app.post('/api/rfid/config', (req, res) => {
            const { host, user, password, database } = req.body;
            if (host) this.dbConfig.host = host;
            if (user) this.dbConfig.user = user;
            if (password !== undefined) this.dbConfig.password = password;
            if (database) this.dbConfig.database = database;

            // Reinitialize connection with new config
            this.initializeDatabase();

            res.json({ success: true, message: 'Database config updated' });
        });

        // Health check
        this.app.get('/api/health', async (req, res) => {
            try {
                const connectionStatus = this.connection ? 'connected' : 'disconnected';
                const latestScanId = await this.getLatestScanId();
                const processedScans = Math.max(0, latestScanId - this.lastScanId);

                res.json({
                    success: true,
                    status: 'running',
                    database: this.dbConfig.database,
                    connection: connectionStatus,
                    latestScanId: latestScanId,
                    processedScans: processedScans
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    status: 'error',
                    error: error.message
                });
            }
        });

        // Test database connection
        this.app.get('/api/rfid/test', async (req, res) => {
            try {
                await this.testConnection();
                res.json({ success: true, message: 'Database connection successful' });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Insert new RFID scan
        this.app.post('/api/rfid/insert-scan', async (req, res) => {
            try {
                const { rfid_tag, student_id } = req.body;

                if (!rfid_tag) {
                    return res.status(400).json({ success: false, error: 'rfid_tag is required' });
                }

                const scanData = {
                    rfid_tag: rfid_tag,
                    scanned_at: new Date(),
                    student_id: student_id || null
                };

                const result = await this.insertRFIDScan(scanData);
                res.json({ success: true, message: 'RFID scan inserted successfully', scanId: result.insertId });
            } catch (error) {
                console.error('Error inserting RFID scan:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    async initializeDatabase() {
        try {
            if (this.connection) {
                await this.connection.end();
            }

            this.connection = await mysql.createConnection(this.dbConfig);
            console.log(`Connected to MySQL database: ${this.dbConfig.database}`);

            // Get the latest scan ID to start monitoring from
            this.lastScanId = await this.getLatestScanId();
            console.log(`Starting monitoring from scan ID: ${this.lastScanId}`);

            // Start monitoring for new scans
            this.startMonitoring();

        } catch (error) {
            console.error('Database connection failed:', error);
            this.connection = null;
        }
    }

    async testConnection() {
        if (!this.connection) {
            throw new Error('No database connection');
        }

        await this.connection.execute('SELECT 1');
    }

    async getLatestScanId() {
        if (!this.connection) {
            return 0;
        }

        try {
            // Query for the latest scan ID in your RFID scans table
            // Adjust table/column names based on your actual schema
            const [rows] = await this.connection.execute(
                'SELECT MAX(id) as maxId FROM rfid_scans'
            );

            return rows[0].maxId || 0;
        } catch (error) {
            console.error('Error getting latest scan ID:', error);
            // If table doesn't exist or query fails, return 0
            return 0;
        }
    }

    async insertRFIDScan(scanData) {
        if (!this.connection) {
            throw new Error('No database connection');
        }

        try {
            const { rfid_tag, scanned_at, student_id } = scanData;

            const [result] = await this.connection.execute(
                'INSERT INTO rfid_scans (rfid_tag, scanned_at, student_id) VALUES (?, ?, ?)',
                [rfid_tag, scanned_at, student_id]
            );

            console.log(`RFID scan inserted: ${rfid_tag}, ID: ${result.insertId}`);
            return result;
        } catch (error) {
            console.error('Error inserting RFID scan:', error);
            throw error;
        }
    }

    async getNewScans() {
        if (!this.connection) {
            return [];
        }

        try {
            // Query for new scans since last processed ID
            // Adjust column names according to your RFID scans table schema
            const [rows] = await this.connection.execute(
                'SELECT id, rfid_tag, scanned_at, student_id FROM rfid_scans WHERE id > ? ORDER BY id ASC',
                [this.lastScanId]
            );

            const newScans = rows.map(row => ({
                id: row.id,
                rfid: row.rfid_tag || row.rfid,
                timestamp: row.scanned_at || new Date().toISOString(),
                student_id: row.student_id
            }));

            // Update last processed ID
            if (newScans.length > 0) {
                this.lastScanId = Math.max(...newScans.map(scan => scan.id));
            }

            return newScans;
        } catch (error) {
            console.error('Error fetching new scans:', error);
            return [];
        }
    }

    startMonitoring() {
        console.log('Starting RFID database monitoring...');

        // Check for new scans every second
        setInterval(async () => {
            try {
                const newScans = await this.getNewScans();
                if (newScans.length > 0) {
                    console.log(`Found ${newScans.length} new RFID scans`);
                }
            } catch (error) {
                console.error('Error during monitoring:', error);
            }
        }, 1000);
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`RFID Database Server running on port ${this.port}`);
            console.log(`Monitoring MySQL database: ${this.dbConfig.database}`);
            console.log('Web app should connect to http://localhost:3001');
        });
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new RFIDDatabaseServer();
    server.start();
}

module.exports = RFIDDatabaseServer;
