import { executeCommand } from './utils.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Database Manager
 * Handles MySQL database operations
 */
class DatabaseManager {
    constructor() {
        this.host = process.env.DB_HOST || 'localhost';
        this.port = process.env.DB_PORT || '3306';
        this.user = process.env.DB_USER || 'root';
        this.password = process.env.DB_PASSWORD || '';
        this.prefix = process.env.DB_PREFIX || 'site_';
    }

    /**
     * Get MySQL command with credentials
     * @returns {string} MySQL command prefix
     */
    getMysqlCommand() {
        let cmd = `mysql -h ${this.host} -P ${this.port} -u ${this.user}`;
        if (this.password) {
            cmd += ` -p'${this.password}'`;
        }
        return cmd;
    }

    /**
     * Create a new database
     * @param {string} primaryKey - Primary key for the site
     * @returns {Promise<string>} Database name
     */
    async createDatabase(primaryKey) {
        const dbName = `${this.prefix}${primaryKey}`;
        const mysqlCmd = this.getMysqlCommand();

        try {
            // Create database
            const createDbCommand = `${mysqlCmd} -e "CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"`;
            await executeCommand(createDbCommand);

            return dbName;
        } catch (error) {
            throw new Error(`Failed to create database: ${error.message}`);
        }
    }

    /**
     * Remove a database
     * @param {string} primaryKey - Primary key for the site
     * @returns {Promise<boolean>} True if database was removed
     */
    async removeDatabase(primaryKey) {
        const dbName = `${this.prefix}${primaryKey}`;
        const mysqlCmd = this.getMysqlCommand();

        try {
            // Drop database
            const dropDbCommand = `${mysqlCmd} -e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`;"`;
            await executeCommand(dropDbCommand);

            return true;
        } catch (error) {
            throw new Error(`Failed to remove database: ${error.message}`);
        }
    }

    /**
     * Check if database exists
     * @param {string} primaryKey - Primary key for the site
     * @returns {Promise<boolean>} True if database exists
     */
    async databaseExists(primaryKey) {
        const dbName = `${this.prefix}${primaryKey}`;
        const mysqlCmd = this.getMysqlCommand();

        try {
            const checkCommand = `${mysqlCmd} -e "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${dbName}';"`;
            const result = await executeCommand(checkCommand);

            return result.stdout.includes(dbName);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get database name for a site
     * @param {string} primaryKey - Primary key for the site
     * @returns {string} Database name
     */
    getDatabaseName(primaryKey) {
        return `${this.prefix}${primaryKey}`;
    }

    /**
     * Get database connection info
     * @returns {Object} Database connection details
     */
    getConnectionInfo() {
        return {
            host: this.host,
            port: this.port,
            user: this.user,
            prefix: this.prefix
        };
    }
}

// Export singleton instance
export default new DatabaseManager();
