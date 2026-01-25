import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Logger utility for logging operations to file
 * Logs all operations with timestamps to ./logs/controller-operations.log
 */
class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '..', 'logs');
        this.logFile = path.join(this.logDir, 'controller-operations.log');
        this.ensureLogDirectory();
    }

    /**
     * Ensure the logs directory exists and has proper permissions
     */
    ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true, mode: 0o755 });
            }

            // Ensure log file exists with proper permissions
            if (!fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '', { mode: 0o644 });
            }
        } catch (error) {
            console.error('Failed to ensure log directory:', error.message);
        }
    }

    /**
     * Get formatted timestamp
     * @returns {string} Formatted timestamp
     */
    getTimestamp() {
        const now = new Date();
        return now.toISOString();
    }

    /**
     * Log a message to the log file
     * @param {string} level - Log level (INFO, ERROR, SUCCESS, WARNING)
     * @param {string} message - Log message
     * @param {Object} data - Additional data to log
     */
    log(level, message, data = {}) {
        const timestamp = this.getTimestamp();
        const logEntry = {
            timestamp,
            level,
            message,
            ...data
        };

        const logLine = `[${timestamp}] [${level}] ${message} ${Object.keys(data).length > 0 ? JSON.stringify(data) : ''}\n`;

        try {
            // Try to append to log file
            fs.appendFileSync(this.logFile, logLine, { mode: 0o644 });
        } catch (error) {
            // If we can't write to the file, try to fix permissions or fallback
            if (error.code === 'EACCES') {
                try {
                    // Try to change permissions if possible
                    fs.chmodSync(this.logFile, 0o644);
                    fs.appendFileSync(this.logFile, logLine, { mode: 0o644 });
                } catch (fixError) {
                    // If we still can't write, output to console only
                    console.error(`[LOG ERROR] Cannot write to ${this.logFile}: ${error.message}`);
                    console.log(`[${level}] ${message}`, data);
                }
            } else {
                console.error('Failed to write to log file:', error.message);
            }
        }
    }

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    info(message, data = {}) {
        this.log('INFO', message, data);
    }

    /**
     * Log success message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    success(message, data = {}) {
        this.log('SUCCESS', message, data);
    }

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    error(message, data = {}) {
        this.log('ERROR', message, data);
    }

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    warning(message, data = {}) {
        this.log('WARNING', message, data);
    }
}

// Export singleton instance
export default new Logger();
