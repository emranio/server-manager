import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseDomain } from './utils.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Caddy Manager
 * Handles creation and removal of Caddy configuration files
 */
class CaddyManager {
    constructor() {
        this.caddyDir = path.join(__dirname, '..', 'caddy');
        this.ensureCaddyDirectory();
    }

    /**
     * Ensure caddy directory exists
     */
    ensureCaddyDirectory() {
        if (!fs.existsSync(this.caddyDir)) {
            fs.mkdirSync(this.caddyDir, { recursive: true });
        }
    }

    /**
     * Generate Caddy configuration for a site
     * @param {string} domain - Domain name
     * @param {string} rootPath - Document root path
     * @param {boolean} enablePhp - Enable PHP support
     * @returns {string} Caddy configuration
     */
    generateSiteConfig(domain, rootPath, enablePhp = false) {
        const phpFastcgiPath = process.env.PHP_FASTCGI_PATH || 'unix//run/php/php8.2-fpm.sock';
        const phpConfig = enablePhp ? `
    # PHP-FPM support
    php_fastcgi ${phpFastcgiPath}
` : '';

        return `https://${domain} {
    bind 0.0.0.0
	tls internal
    root * ${rootPath}
    encode gzip

    # CORS headers
    header Access-Control-Allow-Origin *
    header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    header Access-Control-Allow-Headers *

    # Handle OPTIONS preflight requests
    @options {
        method OPTIONS
    }
    respond @options 204

    # PHP-FPM configuration with WordPress support
    php_fastcgi ${phpFastcgiPath} {
        try_files {path} {path}/index.php /index.php
    }    

    # File server with directory browsing
    file_server

    # Enable gzip compression
    encode gzip zstd
    
    # Enable caching headers for static assets
    @static {
        path *.jpg *.jpeg *.png *.gif *.ico *.css *.js *.mjs *.svg *.woff *.woff2 *.ttf *.eot
    }
    header @static Cache-Control "public, max-age=31536000"

    # Custom error pages
    handle_errors {
        @404 {
            expression {http.error.status_code} == 404
        }
        rewrite @404 /404.html
        
        @error {
            expression {http.error.status_code} >= 400
        }
        rewrite @error /error.html
        
        root * ${path.join(__dirname, '..', 'www')}
        file_server
    }
}
`;
    }

    /**
     * Generate Caddy configuration for a WordPress site
     * @param {string} domain - Domain name
     * @param {string} rootPath - Document root path
     * @returns {string} Caddy configuration
     */
    generateWordPressConfig(domain, rootPath) {
        const phpFastcgiPath = process.env.PHP_FASTCGI_PATH || 'unix//run/php/php8.2-fpm.sock';
        return `https://${domain} {
    bind 0.0.0.0
	tls internal

    root * ${rootPath}

    # CORS headers
    header Access-Control-Allow-Origin *
    header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    header Access-Control-Allow-Headers *

    # Handle OPTIONS preflight requests
    @options {
        method OPTIONS
    }
    respond @options 204

    # Deny access to sensitive files (but allow uploads)
    @forbidden {
        path *.sql .htaccess .env wp-config.php
        path */.*
        not path /wp-content/uploads/*
    }
    respond @forbidden 403

    # PHP-FPM configuration with WordPress support
    php_fastcgi ${phpFastcgiPath} {
        try_files {path} {path}/index.php /index.php
    }

    # File server for static assets
    file_server

    # Enable gzip compression
    encode gzip zstd

    # Enable caching headers for static assets
    @static {
        path *.jpg *.jpeg *.png *.gif *.ico *.css *.js *.mjs *.svg *.woff *.woff2 *.ttf *.eot
    }
    header @static Cache-Control "public, max-age=31536000"

    # Custom error pages
    handle_errors {
        @404 {
            expression {http.error.status_code} == 404
        }
        rewrite @404 /404.html
        
        @error {
            expression {http.error.status_code} >= 400
        }
        rewrite @error /error.html
        
        root * ${path.join(__dirname, '..', 'www')}
        file_server
    }
}
`;
    }

    /**
     * Generate Caddy configuration for a proxy
     * @param {string} domain - Domain name
     * @param {string} proxyAddress - Proxy forward address (e.g., localhost:3000)
     * @param {string} corsOrigin - CORS origin (default: *)
     * @returns {string} Caddy configuration\n     */
    generateProxyConfig(domain, proxyAddress, corsOrigin = '*') {
        return `https://${domain} {
    bind 0.0.0.0
\ttls internal

    # Enable gzip compression
    encode gzip zstd

    # CORS headers
    header Access-Control-Allow-Origin ${corsOrigin}
    header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    header Access-Control-Allow-Headers *

    # Handle OPTIONS preflight requests
    @options {
        method OPTIONS
    }
    respond @options 204

    # Reverse proxy to the service
    reverse_proxy http://${proxyAddress}
}
`;
    }

    /**
     * Generate Caddy configuration for a subdirectory site
     * @param {string} mainDomain - Main domain (e.g., "abc.wp")
     * @param {string} subdir - Subdirectory path (e.g., "demo")
     * @param {string} type - Site type ('site', 'wp', or 'proxy')
     * @param {string} rootPath - Document root path
     * @param {Object} options - Additional options
     * @returns {string} Caddy configuration snippet to add to parent config
     */
    generateSubdirConfig(mainDomain, subdir, type, rootPath, options = {}) {
        const { enablePhp = false, proxyAddress = null } = options;
        const phpFastcgiPath = process.env.PHP_FASTCGI_PATH || 'unix//run/php/php8.2-fpm.sock';

        if (type === 'proxy') {
            return `
    # Subdirectory Proxy: /${subdir}
    route /${subdir}/* {
        uri strip_prefix /${subdir}
        reverse_proxy http://${proxyAddress}
    }
`;
        } else {
            return `
    # Subdirectory: /${subdir}
    route /${subdir}/* {
        uri strip_prefix /${subdir}
        root * ${rootPath}
        
        # CORS headers
        header Access-Control-Allow-Origin *
        header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        header Access-Control-Allow-Headers *
        
        # PHP-FPM configuration with WordPress support
        php_fastcgi ${phpFastcgiPath} {
            try_files {path} {path}/index.php /index.php
        }

        file_server
        # Enable gzip compression
        encode gzip zstd
    }
`;
        }
    }

    /**
     * Add subdirectory configuration to existing parent domain config
     * @param {string} parentKey - Parent domain primary key
     * @param {string} mainDomain - Main domain name
     * @param {string} subdir - Subdirectory path
     * @param {string} type - Site type ('site', 'wp', or 'proxy')
     * @param {string} rootPath - Document root path for subdirectory
     * @param {Object} options - Additional options (enablePhp, proxyAddress)
     * @returns {boolean} Success status
     */
    addSubdirToParentConfig(parentKey, mainDomain, subdir, type, rootPath, options = {}) {
        const parentConfigFile = this.getConfigPath(parentKey);

        if (!fs.existsSync(parentConfigFile)) {
            throw new Error(`Parent config file not found: ${parentConfigFile}`);
        }

        try {
            // Read existing config
            let config = fs.readFileSync(parentConfigFile, 'utf8');

            // Generate subdirectory block
            const subdirBlock = this.generateSubdirConfig(mainDomain, subdir, type, rootPath, options);

            // Insert subdirectory block before the closing brace
            // Find the last closing brace
            const lastBraceIndex = config.lastIndexOf('}');
            if (lastBraceIndex === -1) {
                throw new Error('Invalid Caddy config format: no closing brace found');
            }

            // Insert subdirectory config before the last closing brace
            config = config.slice(0, lastBraceIndex) + subdirBlock + '\n' + config.slice(lastBraceIndex);

            // Write updated config
            fs.writeFileSync(parentConfigFile, config, 'utf8');
            return true;
        } catch (error) {
            throw new Error(`Failed to add subdirectory to parent config: ${error.message}`);
        }
    }

    /**
     * Remove subdirectory configuration from parent domain config
     * @param {string} parentKey - Parent domain primary key
     * @param {string} subdir - Subdirectory path to remove
     * @returns {boolean} Success status
     */
    removeSubdirFromParentConfig(parentKey, subdir) {
        const parentConfigFile = this.getConfigPath(parentKey);

        if (!fs.existsSync(parentConfigFile)) {
            return false; // Parent config doesn't exist
        }

        try {
            // Read existing config
            let config = fs.readFileSync(parentConfigFile, 'utf8');

            // Find and remove subdirectory block
            const subdirPattern = new RegExp(
                `\\s*# Subdirectory: /${subdir}\\s*route /${subdir}/\\* \\{[^}]*\\}\\s*`,
                'gs'
            );

            config = config.replace(subdirPattern, '');

            // Write updated config
            fs.writeFileSync(parentConfigFile, config, 'utf8');
            return true;
        } catch (error) {
            throw new Error(`Failed to remove subdirectory from parent config: ${error.message}`);
        }
    }

    /**
     * Create a Caddy configuration file
     * @param {string} primaryKey - Primary key for the site
     * @param {string} domain - Domain name
     * @param {string} type - Site type ('site', 'wp', or 'proxy')
     * @param {string} rootPath - Document root path
     * @param {Object} options - Additional options (enablePhp, proxyAddress)
     * @returns {string} Path to created config file
     */
    createConfig(primaryKey, domain, type, rootPath, options = {}) {
        const { enablePhp = false, proxyAddress = null, corsOrigin = '*' } = options;
        const parsed = parseDomain(domain);

        // For subdirectory sites, update parent config instead of creating new file
        if (parsed.isSubdir) {
            const parentKey = primaryKey.replace(new RegExp(`_${parsed.subdir}$`), '');
            this.addSubdirToParentConfig(parentKey, parsed.mainDomain, parsed.subdir, type, rootPath, options);
            return this.getConfigPath(parentKey); // Return parent config path
        }

        // For regular domains, create a new config file
        const configFile = path.join(this.caddyDir, `${primaryKey}.caddy`);

        let config;
        if (type === 'site') {
            config = this.generateSiteConfig(domain, rootPath, enablePhp);
        } else if (type === 'wp') {
            config = this.generateWordPressConfig(domain, rootPath);
        } else if (type === 'proxy') {
            config = this.generateProxyConfig(domain, proxyAddress, corsOrigin);
        } else {
            throw new Error(`Unknown site type: ${type}`);
        }

        try {
            fs.writeFileSync(configFile, config, 'utf8');
            return configFile;
        } catch (error) {
            throw new Error(`Failed to create Caddy config: ${error.message}`);
        }
    }

    /**
     * Remove a Caddy configuration file or subdirectory
     * @param {string} primaryKey - Primary key for the site
     * @param {string} domain - Domain name (to check if subdirectory)
     * @returns {boolean} True if file/config was removed
     */
    removeConfig(primaryKey, domain = null) {
        // If domain is provided and it's a subdirectory, remove from parent config
        if (domain) {
            const parsed = parseDomain(domain);
            if (parsed.isSubdir) {
                const parentKey = primaryKey.replace(new RegExp(`_${parsed.subdir}$`), '');
                return this.removeSubdirFromParentConfig(parentKey, parsed.subdir);
            }
        }

        // For regular domains, remove the config file
        const configFile = path.join(this.caddyDir, `${primaryKey}.caddy`);

        try {
            if (fs.existsSync(configFile)) {
                fs.unlinkSync(configFile);
                return true;
            }
            return false;
        } catch (error) {
            throw new Error(`Failed to remove Caddy config: ${error.message}`);
        }
    }

    /**
     * Check if config file exists
     * @param {string} primaryKey - Primary key for the site
     * @returns {boolean} True if config exists
     */
    configExists(primaryKey) {
        const configFile = path.join(this.caddyDir, `${primaryKey}.caddy`);
        return fs.existsSync(configFile);
    }

    /**
     * Get path to config file
     * @param {string} primaryKey - Primary key for the site
     * @returns {string} Path to config file
     */
    getConfigPath(primaryKey) {
        return path.join(this.caddyDir, `${primaryKey}.caddy`);
    }
}

// Export singleton instance
export default new CaddyManager();
