# RFID Integration Setup Guide

This guide explains how to integrate your long-range RFID scanner with the JAJ Attendance System.

## Overview

The system uses a two-part approach:

1. **RFID Server** (Node.js) - Monitors the scan file and serves data to the web app
2. **RFID Monitor** (JavaScript) - Processes scans and updates the attendance system

## Hardware Requirements

- Long-range RFID scanner that can output to a text file
- Computer running Windows (for file monitoring)
- Node.js installed (for the RFID server)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This installs Express and CORS for the RFID server.

### 2. Configure Your RFID Scanner

1. Set your RFID scanner to output scanned tags to a text file
2. Default location: `C:\rfid_scans.txt`
3. Each scan should append a new line with the RFID tag value
4. Example file content:
   ```
   STU001
   STU002
   STU003
   ```

### 3. Start the RFID Server

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

The server runs on `http://localhost:3001`

### 4. Start the Web Application

In a separate terminal:

```bash
npm run serve
```

The web app runs on `http://localhost:8000`

### 5. Configure RFID Settings

1. Open the web application
2. Navigate to **RFID Settings** in the sidebar
3. Verify the scan file path: `C:\rfid_scans.txt`
4. Adjust scan interval if needed (default: 1000ms)
5. Test with a manual RFID entry

## How It Works

1. **RFID Scanner** writes scanned tags to `C:\rfid_scans.txt`
2. **RFID Server** monitors the file for changes every second
3. When new scans are detected, they're sent to the web application
4. **RFID Monitor** processes each scan:
   - Looks up the student by RFID tag
   - Automatically marks attendance as "present"
   - Updates the dashboard in real-time
   - Shows notifications

## File Structure

```
├── src/
│   ├── js/
│   │   ├── rfid-server.js      # Node.js server for file monitoring
│   │   ├── rfid-monitor.js     # Client-side RFID processing
│   │   └── ...
│   ├── html/
│   │   ├── rfid-settings.html  # Configuration interface
│   │   └── ...
│   └── css/
│       └── ...
├── package.json                # Node.js dependencies
└── README-RFID.md             # This file
```

## API Endpoints

The RFID server provides these endpoints:

- `GET /api/health` - Server status and configuration
- `GET /api/rfid/scans` - Get recent RFID scans
- `POST /api/rfid/clear` - Clear processed scans history
- `POST /api/rfid/config` - Update scan file path

## Troubleshooting

### Server Not Starting

- Ensure Node.js is installed: `node --version`
- Install dependencies: `npm install`
- Check for port conflicts on 3001

### Scans Not Detected

- Verify the scan file path is correct
- Ensure the RFID scanner is writing to the file
- Check file permissions
- Try manual testing in RFID Settings

### Students Not Found

- Ensure student RFID tags are correctly stored in the database
- Check the RFID tag format matches database entries
- Verify database connection

### Web App Not Connecting

- Ensure both server (port 3001) and web app (port 8000) are running
- Check browser console for connection errors
- Verify CORS settings if accessing from different domains

## Security Considerations

- The scan file contains sensitive RFID data
- Ensure the file location is secure and accessible only to authorized users
- Consider encrypting RFID data in production
- Regularly clear processed scans to minimize data retention

## Advanced Configuration

### Custom Scan File Location

Update the scan file path in RFID Settings or modify the default in `rfid-server.js`:

```javascript
this.scanFile = "D:\\scans\\rfid_tags.txt";
```

### Faster Scan Detection

Reduce the scan interval in `rfid-monitor.js`:

```javascript
this.scanInterval = 500; // Check every 500ms
```

### Multiple Scan Files

Modify `rfid-server.js` to monitor multiple files or directories.

## Support

For issues or questions:

1. Check the browser console for JavaScript errors
2. Verify server logs in the terminal
3. Test with manual RFID entry in settings
4. Ensure all dependencies are installed correctly

## Future Enhancements

- Support for multiple simultaneous scanners
- Batch processing of scans
- Advanced filtering and validation
- Integration with more RFID hardware
- Mobile app support for scanning
