# RFID Integration Setup Guide (MySQL Database Version)

This guide explains how to integrate your long-range RFID scanner with the JAJ Attendance System using MySQL database monitoring.

## Overview

The system now monitors your MySQL database `mysql06381030` for RFID scan data instead of a text file. This provides better reliability and integration with your existing database infrastructure.

## Database Schema Requirements

Your RFID scanner should insert scan data into a table called `rfid_scans` with these columns:

- `id` (auto-increment primary key)
- `rfid_tag` (the RFID tag value)
- `scanned_at` (timestamp of scan)
- `student_id` (optional, if scanner can associate student)

Example table creation:

```sql
CREATE TABLE rfid_scans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rfid_tag VARCHAR(50) NOT NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    student_id INT NULL
);
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install express cors mysql2 nodemon
```

### 2. Configure Database Connection

Edit `src/js/rfid-db-server.js` and update the database configuration:

```javascript
this.dbConfig = {
  host: "localhost",
  user: "root", // Your MySQL username
  password: "your_password", // Your MySQL password
  database: "mysql06381030", // Your database name
};
```

### 3. Start the RFID Database Server

```bash
node src/js/rfid-db-server.js
```

The server runs on `http://localhost:3001` and monitors your database.

### 4. Start the Web Application

```bash
python -m http.server 8000
```

### 5. Configure RFID Scanner

Set your RFID scanner to insert records into the `rfid_scans` table whenever a tag is scanned.

## How It Works

1. **RFID Scanner** → Inserts scan data into `mysql06381030.rfid_scans`
2. **RFID Database Server** → Monitors table for new records every second
3. **RFID Monitor** → Processes scans and marks attendance automatically
4. **Dashboard** → Updates in real-time with new attendance records

## API Endpoints

- `GET /api/health` - Server and database status
- `GET /api/rfid/scans` - Get recent RFID scans
- `POST /api/rfid/clear` - Reset monitoring position
- `GET /api/rfid/test` - Test database connection

## Troubleshooting

### Database Connection Issues

- Verify MySQL server is running
- Check credentials in `rfid-db-server.js`
- Test connection: `GET /api/rfid/test`

### No Scans Detected

- Verify scanner is inserting into `rfid_scans` table
- Check table schema matches requirements
- Monitor server logs for errors

### Students Not Found

- Ensure RFID tags match student records
- Check database connectivity for student lookup

## Security Notes

- Update database credentials for your environment
- Ensure database user has minimal required permissions
- Consider environment variables for production deployment
