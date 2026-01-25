import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Utility functions for the CLI
 */

/**
 * Generate primary key from domain name
 * Replaces slashes with underscores but keeps dots intact
 * @param {string} domain - Domain name (e.g., "abc.wp" or "abc.wp/demo")
 * @returns {string} Primary key (e.g., "abc.wp" or "abc.wp_demo")
 */
export function generatePrimaryKey(domain) {
    return domain.replace(/\//g, '_');
}

/**
 * Generate a random password
 * @param {number} length - Password length (default: 16)
 * @returns {string} Generated password
 */
export function generatePassword(length = 16) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
        password += charset[randomBytes[i] % charset.length];
    }

    return password;
}



/**
 * Execute a command with sudo privileges
 * @param {string} command - Command to execute
 * @param {string} password - Sudo password
 * @returns {Promise<{stdout: string, stderr: string}>} Command output
 */
export async function executeSudoCommand(command, password) {
    const sudoCommand = `echo '${password}' | sudo -S ${command}`;
    return await execAsync(sudoCommand);
}

/**
 * Execute a regular command
 * @param {string} command - Command to execute
 * @returns {Promise<{stdout: string, stderr: string}>} Command output
 */
export async function executeCommand(command) {
    return await execAsync(command);
}

/**
 * Validate domain name format
 * @param {string} domain - Domain name to validate
 * @returns {boolean} True if valid
 */
export function isValidDomain(domain) {
    // Check if it's a subdirectory site (e.g., abc.wp/demo)
    if (domain.includes('/')) {
        const parts = domain.split('/');
        if (parts.length !== 2) {
            return false;
        }
        const [mainDomain, subdir] = parts;

        // Validate main domain
        if (!mainDomain.includes('.')) {
            return false;
        }

        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
        if (!domainRegex.test(mainDomain)) {
            return false;
        }

        // Validate subdirectory (alphanumeric, hyphens, underscores)
        const subdirRegex = /^[a-zA-Z0-9_-]+$/;
        if (!subdirRegex.test(subdir)) {
            return false;
        }

        return true;
    }

    // Regular domain validation
    // Must contain at least one dot
    if (!domain.includes('.')) {
        return false;
    }

    // Only allow alphanumeric, dots, and hyphens
    // Must not start or end with a hyphen or dot
    // Must not have consecutive dots
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

    // Check for invalid patterns
    if (domain.includes('..') || domain.includes(' ')) {
        return false;
    }

    return domainRegex.test(domain);
}

/**
 * Parse domain into main domain and subdirectory
 * @param {string} domain - Domain name (e.g., "abc.wp/demo" or "abc.wp")
 * @returns {Object} { mainDomain, subdir, isSubdir }
 */
export function parseDomain(domain) {
    if (domain.includes('/')) {
        const [mainDomain, subdir] = domain.split('/');
        return { mainDomain, subdir, isSubdir: true };
    }
    return { mainDomain: domain, subdir: null, isSubdir: false };
}

/**
 * Sanitize database name (remove special characters)
 * @param {string} name - Database name
 * @returns {string} Sanitized name
 */
export function sanitizeDatabaseName(name) {
    // Remove any characters that aren't alphanumeric or underscore
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
}
