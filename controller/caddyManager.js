import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseDomain, generatePrimaryKey } from './utils.js';
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
     * Generate Caddy configuration for a static React site (SPA)
     * @param {string} domain - Domain name
     * @param {string} rootPath - Document root path
     * @param {boolean} enablePhp - Enable PHP support
     * @returns {string} Caddy configuration
     */
    generateReactConfig(domain, rootPath, enablePhp = false) {
        const phpFastcgiPath = process.env.PHP_FASTCGI_PATH || 'unix//run/php/php8.2-fpm.sock';
        const tlsInternal = process.env.TLS_INTERNAL === 'true';
        const phpConfig = enablePhp ? `
    # PHP-FPM support
    php_fastcgi ${phpFastcgiPath}
` : '';
        const tlsConfig = tlsInternal ? '\n    tls internal' : '';

        return `https://${domain} {
    bind 0.0.0.0${tlsConfig}
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
${phpConfig}
    # Enable compression (dynamic fallback)
    encode gzip

    # SPA fallback: serve index.html for any non-existing file
    # This supports client-side routing (React Router, etc.)
    try_files {path} /index.html

    # File server with pre-compressed file support (br first, then gzip)
    file_server {
        precompressed br gzip
    }
    
    # Cache headers: 2 days for HTML/directory index, 15 days for versioned assets
    # Default 2-day cache for all responses (covers directory URLs serving index.html)
    header Cache-Control "public, max-age=172800"
    
    # Override with 15-day cache for versioned assets (js/css/fonts/images)
    @versioned_assets {
        path_regexp versioned \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
    }
    header @versioned_assets Cache-Control "public, max-age=1296000"

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
     * Generate Caddy configuration for a site
     * @param {string} domain - Domain name
     * @param {string} rootPath - Document root path
     * @param {boolean} enablePhp - Enable PHP support
     * @returns {string} Caddy configuration
     */
    generateSiteConfig(domain, rootPath, enablePhp = false) {
        const phpFastcgiPath = process.env.PHP_FASTCGI_PATH || 'unix//run/php/php8.2-fpm.sock';
        const tlsInternal = process.env.TLS_INTERNAL === 'true';
        const phpConfig = enablePhp ? `
    # PHP-FPM support
    php_fastcgi ${phpFastcgiPath}
` : '';
        const tlsConfig = tlsInternal ? '\n    tls internal' : '';

        return `https://${domain} {
    bind 0.0.0.0${tlsConfig}
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
${phpConfig}
    # Enable compression (dynamic fallback)
    encode gzip

    # File server with pre-compressed file support (br first, then gzip)
    file_server {
        precompressed br gzip
    }
    
    # Cache headers: 2 days for HTML/directory index, 15 days for versioned assets
    # Default 2-day cache for all responses (covers directory URLs serving index.html)
    header Cache-Control "public, max-age=172800"
    
    # Override with 15-day cache for versioned assets (js/css/fonts/images)
    @versioned_assets {
        path_regexp versioned \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
    }
    header @versioned_assets Cache-Control "public, max-age=1296000"

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
        const tlsInternal = process.env.TLS_INTERNAL === 'true';
        const tlsConfig = tlsInternal ? '\n    tls internal' : '';
        return `https://${domain} {
    bind 0.0.0.0${tlsConfig}

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

    # Enable compression (dynamic fallback)
    encode gzip

    # File server with pre-compressed file support (br first, then gzip)
    file_server {
        precompressed br gzip
    }

    # Cache headers: 2 days for HTML/directory index, 15 days for versioned assets
    # Default 2-day cache for all responses (covers directory URLs serving index.html)
    header Cache-Control "public, max-age=172800"
    
    # Override with 15-day cache for versioned assets (js/css/fonts/images)
    @versioned_assets {
        path_regexp versioned \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
    }
    header @versioned_assets Cache-Control "public, max-age=1296000"

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
     * @param {string} corsOrigin - CORS origin (optional, empty string to skip CORS)
     * @returns {string} Caddy configuration\n     */
    generateProxyConfig(domain, proxyAddress, corsOrigin = '') {
        const tlsInternal = process.env.TLS_INTERNAL === 'true';
        const tlsConfig = tlsInternal ? '\n    tls internal' : '';
        
        // Only add CORS headers if corsOrigin is provided
        const corsBlock = corsOrigin ? `
    # CORS headers
    header Access-Control-Allow-Origin ${corsOrigin}
    header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    header Access-Control-Allow-Headers *

    # Handle OPTIONS preflight requests
    @options {
        method OPTIONS
    }
    respond @options 204

` : '';
        
        return `https://${domain} {
    bind 0.0.0.0${tlsConfig}

    # Enable gzip compression
    encode gzip zstd
${corsBlock}
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
        const subdirId = subdir.replace(/[^a-zA-Z0-9]/g, '_');

        if (type === 'proxy') {
            return `
    # Subdirectory Proxy: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308
    
    handle_path /${subdir}/* {
        reverse_proxy http://${proxyAddress}
    }
`;
        } else if (type === 'react') {
            // Static React site with SPA fallback
            const phpBlock = enablePhp ? `
        # PHP-FPM support
        php_fastcgi ${phpFastcgiPath}
` : '';
            return `
    # Subdirectory React SPA: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308
    
    handle_path /${subdir}/* {
        root * ${rootPath}
        
        # CORS headers
        header Access-Control-Allow-Origin *
        header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        header Access-Control-Allow-Headers *
${phpBlock}
        # Enable compression (dynamic fallback)
        encode gzip
        
        # Cache headers: 2 days for HTML/directory index, 15 days for versioned assets
        # Default 2-day cache for all responses (covers SPA routes serving index.html)
        header Cache-Control "public, max-age=172800"
        
        # Override with 15-day cache for versioned assets (js/css/fonts/images)
        @versioned_${subdirId} {
            path_regexp versioned_${subdirId} \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
        }
        header @versioned_${subdirId} Cache-Control "public, max-age=1296000"
        
        # SPA fallback: serve index.html for any non-existing file
        try_files {path} /index.html
        
        # File server with pre-compressed file support (br first, then gzip)
        file_server {
            precompressed br gzip
        }
    }
`;
        } else {
            // Regular site type - respect enablePhp option
            const phpBlock = enablePhp ? `
        # PHP-FPM support
        php_fastcgi ${phpFastcgiPath}
` : '';
            return `
    # Subdirectory: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308
    
    handle_path /${subdir}/* {
        root * ${rootPath}
        
        # CORS headers
        header Access-Control-Allow-Origin *
        header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        header Access-Control-Allow-Headers *
${phpBlock}
        # Enable compression (dynamic fallback)
        encode gzip
        
        # Cache headers: 2 days for HTML/directory index, 15 days for versioned assets
        # Default 2-day cache for all responses (covers directory URLs serving index.html)
        header Cache-Control "public, max-age=172800"
        
        # Override with 15-day cache for versioned assets (js/css/fonts/images)
        @versioned_${subdirId} {
            path_regexp versioned_${subdirId} \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
        }
        header @versioned_${subdirId} Cache-Control "public, max-age=1296000"
        
        # File server with pre-compressed file support (br first, then gzip)
        file_server {
            precompressed br gzip
        }
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

            // Find and remove subdirectory block (handles site, wp, and react types)
            const subdirPattern = new RegExp(
                `\\s*# Subdirectory(?:\\sReact SPA)?: /${subdir}\\s*route /${subdir}/\\* \\{[^}]*\\}\\s*`,
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
        const { enablePhp = false, proxyAddress = null, corsOrigin = '' } = options;
        const parsed = parseDomain(domain);

        // For subdirectory sites, update parent config instead of creating new file
        if (parsed.isSubdir) {
            const parentKey = generatePrimaryKey(parsed.mainDomain);
            this.addSubdirToParentConfig(parentKey, parsed.mainDomain, parsed.subdir, type, rootPath, options);
            return this.getConfigPath(parentKey); // Return parent config path
        }

        // For regular domains, create a new config file
        const configFile = path.join(this.caddyDir, `${primaryKey}.caddy`);

        let config;
        if (type === 'site') {
            config = this.generateSiteConfig(domain, rootPath, enablePhp);
        } else if (type === 'react') {
            config = this.generateReactConfig(domain, rootPath, enablePhp);
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
                const parentKey = generatePrimaryKey(parsed.mainDomain);
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
