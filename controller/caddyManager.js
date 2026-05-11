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
     * Generate a CORS block that works for normal requests and OPTIONS preflight responses.
     * The preflight handler repeats the headers because respond short-circuits later handlers.
     * @param {string} corsOrigin - Allowed CORS origin
     * @param {string} indent - Indentation for the generated Caddyfile block
     * @param {string} matcherName - Unique Caddy matcher name for OPTIONS requests
     * @returns {string} Caddy CORS configuration block
     */
    generateCorsBlock(corsOrigin = '*', indent = '    ', matcherName = 'options') {
        return `${indent}# [CORS:START]
${indent}# CORS headers for all responses
${indent}header Access-Control-Allow-Origin ${corsOrigin}
${indent}header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
${indent}header Access-Control-Allow-Headers *
${indent}# Handle OPTIONS preflight requests (CORS)
${indent}@${matcherName} {
${indent}    method OPTIONS
${indent}}
${indent}handle @${matcherName} {
${indent}    header Access-Control-Allow-Origin ${corsOrigin}
${indent}    header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
${indent}    header Access-Control-Allow-Headers *
${indent}    header Access-Control-Max-Age "86400"
${indent}    respond "" 204
${indent}}
${indent}# [CORS:END]
`;
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
    # [PHP:START]
    # PHP-FPM support
    php_fastcgi ${phpFastcgiPath} {
        try_files {path} {path}/index.php
    }
    # [PHP:END]
` : '';
        const tlsConfig = tlsInternal ? '\n    tls internal' : '';

        return `https://${domain} {
    bind 0.0.0.0${tlsConfig}
    root * ${rootPath}
    encode gzip

${this.generateCorsBlock('*')}
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
     * Generate Caddy configuration for a Static Next.js Build (next export / output: 'export')
     * Treats the directory as a static export: clean URLs map to .html files,
     * /_next/static/* gets immutable long cache, HTML gets short revalidate cache,
     * service worker (if present) is never cached, and trailing slashes are
     * canonicalised with 308 redirects.
     * @param {string} domain - Domain name
     * @param {string} rootPath - Document root path (the exported `out/` or `public/` folder)
     * @returns {string} Caddy configuration
     */
    generateStaticNextConfig(domain, rootPath) {
        const tlsInternal = process.env.TLS_INTERNAL === 'true';
        const tlsConfig = tlsInternal ? '\n    tls internal' : '';

        return `https://${domain} {
    bind 0.0.0.0${tlsConfig}
    root * ${rootPath}
    encode gzip zstd

${this.generateCorsBlock('*')}

    # Canonicalise trailing slashes (except root) -> 308 redirect to clean URL
    @trailing_slash {
        path_regexp trailing ^(.+)/$
    }
    redir @trailing_slash {re.trailing.1} 308

    # Static Next.js export route resolution:
    #   /foo            -> foo.html
    #   /foo/bar        -> foo/bar.html
    #   /foo/           -> foo/index.html (after trailing slash redirect this is rare)
    #   otherwise       -> serve the file as-is (assets, /_next/*, etc.)
    try_files {path}.html {path}/index.html {path}

    # File server with pre-compressed file support (br first, then gzip)
    file_server {
        precompressed br gzip
    }

    # /_next/static/* is content-hashed -> safe to cache forever
    @next_static path /_next/static/*
    header @next_static Cache-Control "public, max-age=31536000, immutable"

    # HTML pages -> short cache, must revalidate so deploys are picked up
    @html {
        path *.html /
        path_regexp html_dir ^/[^.]*$
    }
    header @html Cache-Control "public, max-age=0, must-revalidate"

    # Service worker (PWA) must never be cached by intermediaries
    @service_worker path /sw.js /service-worker.js
    header @service_worker Cache-Control "no-cache"

    # Web app manifest -> short cache
    @manifest path /manifest.webmanifest /manifest.json
    header @manifest Cache-Control "public, max-age=300, must-revalidate"

    # Other versioned/static assets (images, fonts, css, js outside /_next/static)
    @static_assets {
        path_regexp static_ext \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
        not path /_next/static/*
        not path /sw.js
        not path /service-worker.js
    }
    header @static_assets Cache-Control "public, max-age=1296000"

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
    # [PHP:START]
    # PHP-FPM support
    php_fastcgi ${phpFastcgiPath} {
        try_files {path} {path}/index.php
    }
    # [PHP:END]
` : '';
        const tlsConfig = tlsInternal ? '\n    tls internal' : '';

        return `https://${domain} {
    bind 0.0.0.0${tlsConfig}
    root * ${rootPath}
    encode gzip

${this.generateCorsBlock('*')}
${phpConfig}
    # Enable compression (dynamic fallback)
    encode gzip

    # File server with pre-compressed file support (br first, then gzip)
    file_server {
        precompressed br gzip
    }

    # Cache only static assets — PHP responses manage their own Cache-Control headers
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

${this.generateCorsBlock('*')}

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

    # Cache only static assets — PHP/WordPress responses manage their own Cache-Control headers
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
${this.generateCorsBlock(corsOrigin)}
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
        const { enablePhp = false, proxyAddress = null, corsOrigin = '' } = options;
        const phpFastcgiPath = process.env.PHP_FASTCGI_PATH || 'unix//run/php/php8.2-fpm.sock';
        const subdirId = subdir.replace(/[^a-zA-Z0-9]/g, '_');

        if (type === 'proxy') {
            const corsBlock = corsOrigin ? `
${this.generateCorsBlock(corsOrigin, '        ', `subdir_${subdirId}_options`)}` : '';
            return `
    # [SUBDIR:${subdir}:START]
    # Subdirectory Proxy: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308
    
    handle_path /${subdir}/* {
${corsBlock}
        reverse_proxy http://${proxyAddress}
    }
    # [SUBDIR:${subdir}:END]
`;
        } else if (type === 'static-next') {
            // Static Next.js export under a subdirectory.
            // NOTE: Next.js must be built with `basePath: '/${subdir}'` (and ideally
            // `assetPrefix`) for asset URLs in the exported HTML to resolve here.
            return `
    # [SUBDIR:${subdir}:START]
    # Subdirectory Static Next.js Build: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308

    handle_path /${subdir}/* {
        root * ${rootPath}

${this.generateCorsBlock('*', '        ', `subdir_${subdirId}_options`)}

        encode gzip zstd

        # Canonicalise trailing slashes within the subdirectory
        @subdir_${subdirId}_trailing path_regexp subtrail ^(.+)/$
        redir @subdir_${subdirId}_trailing /${subdir}{re.subtrail.1} 308

        # Static Next export route resolution
        try_files {path}.html {path}/index.html {path}

        # /_next/static/* immutable
        @subdir_${subdirId}_next_static path /_next/static/*
        header @subdir_${subdirId}_next_static Cache-Control "public, max-age=31536000, immutable"

        # HTML short revalidate cache
        @subdir_${subdirId}_html {
            path *.html /
            path_regexp subhtml_dir ^/[^.]*$
        }
        header @subdir_${subdirId}_html Cache-Control "public, max-age=0, must-revalidate"

        # Service worker no-cache
        @subdir_${subdirId}_sw path /sw.js /service-worker.js
        header @subdir_${subdirId}_sw Cache-Control "no-cache"

        # Other versioned static assets
        @subdir_${subdirId}_assets {
            path_regexp subassets \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
            not path /_next/static/*
            not path /sw.js
            not path /service-worker.js
        }
        header @subdir_${subdirId}_assets Cache-Control "public, max-age=1296000"

        # File server with pre-compressed file support (br first, then gzip)
        file_server {
            precompressed br gzip
        }
    }
    # [SUBDIR:${subdir}:END]
`;
        } else if (type === 'react') {
            // Static React site with SPA fallback
            const phpBlock = enablePhp ? `
        # [PHP:START]
        # PHP-FPM support
        php_fastcgi ${phpFastcgiPath} {
            try_files {path} {path}/index.php
        }
        # [PHP:END]
` : '';
            return `
    # [SUBDIR:${subdir}:START]
    # Subdirectory React SPA: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308
    
    handle_path /${subdir}/* {
        root * ${rootPath}
        
${this.generateCorsBlock('*', '        ', `subdir_${subdirId}_options`)}
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
    # [SUBDIR:${subdir}:END]
`;
        } else if (type === 'wp') {
            // WordPress subdirectory site
            return `
    # [SUBDIR:${subdir}:START]
    # Subdirectory: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308
    
    handle_path /${subdir}/* {
        root * ${rootPath}
        
${this.generateCorsBlock('*', '        ', `subdir_${subdirId}_options`)}

        # Deny access to sensitive files (but allow uploads)
        @forbidden_${subdirId} {
            path *.sql .htaccess .env wp-config.php
            path */.*
            not path /wp-content/uploads/*
        }
        respond @forbidden_${subdirId} 403

        # PHP-FPM configuration with WordPress support
        php_fastcgi ${phpFastcgiPath} {
            try_files {path} {path}/index.php /index.php
        }

        # Enable compression (dynamic fallback)
        encode gzip

        # Cache only static assets — PHP/WordPress responses manage their own Cache-Control headers
        @versioned_${subdirId} {
            path_regexp versioned_${subdirId} \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
        }
        header @versioned_${subdirId} Cache-Control "public, max-age=1296000"
        
        # File server with pre-compressed file support (br first, then gzip)
        file_server {
            precompressed br gzip
        }
    }
    # [SUBDIR:${subdir}:END]
`;
        } else {
            // Regular site type - respect enablePhp option
            const phpBlock = enablePhp ? `
        # [PHP:START]
        # PHP-FPM support
        php_fastcgi ${phpFastcgiPath} {
            try_files {path} {path}/index.php
        }
        # [PHP:END]
` : '';
            return `
    # [SUBDIR:${subdir}:START]
    # Subdirectory: /${subdir}
    # Auto redirect to add trailing slash for directory access
    @subdir_${subdirId}_notrail {
        path /${subdir}
    }
    redir @subdir_${subdirId}_notrail /${subdir}/ 308
    
    handle_path /${subdir}/* {
        root * ${rootPath}
        
${this.generateCorsBlock('*', '        ', `subdir_${subdirId}_options`)}
${phpBlock}
        # Enable compression (dynamic fallback)
        encode gzip

        # Cache only static assets — PHP responses manage their own Cache-Control headers
        @versioned_${subdirId} {
            path_regexp versioned_${subdirId} \.(css|js|mjs|woff|woff2|ttf|eot|jpg|jpeg|png|gif|ico|svg|webp|avif)$
        }
        header @versioned_${subdirId} Cache-Control "public, max-age=1296000"
        
        # File server with pre-compressed file support (br first, then gzip)
        file_server {
            precompressed br gzip
        }
    }
    # [SUBDIR:${subdir}:END]
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
        const { group = null } = options;
        const parentConfigFile = this.getConfigPath(parentKey, group);

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
    removeSubdirFromParentConfig(parentKey, subdir, group = null) {
        const parentConfigFile = this.getConfigPath(parentKey, group);

        if (!fs.existsSync(parentConfigFile)) {
            return false; // Parent config doesn't exist
        }

        try {
            // Read existing config
            let config = fs.readFileSync(parentConfigFile, 'utf8');

            // Find and remove subdirectory block using markers
            // Escape special regex characters in subdir
            const escapedSubdir = subdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const subdirPattern = new RegExp(
                `\\n?\\s*# \\[SUBDIR:${escapedSubdir}:START\\][\\s\\S]*?# \\[SUBDIR:${escapedSubdir}:END\\]\\n?`,
                'g'
            );

            config = config.replace(subdirPattern, '\n');

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
        const { enablePhp = false, proxyAddress = null, corsOrigin = '', group = null } = options;
        const parsed = parseDomain(domain);

        // For subdirectory sites, update parent config instead of creating new file
        if (parsed.isSubdir) {
            const parentKey = generatePrimaryKey(parsed.mainDomain);
            this.addSubdirToParentConfig(parentKey, parsed.mainDomain, parsed.subdir, type, rootPath, options);
            return this.getConfigPath(parentKey, group); // Return parent config path
        }

        // For regular domains, create a new config file
        const configFileName = group ? `${group}__${primaryKey}.caddy` : `${primaryKey}.caddy`;
        const configFile = path.join(this.caddyDir, configFileName);

        let config;
        if (type === 'site') {
            config = this.generateSiteConfig(domain, rootPath, enablePhp);
        } else if (type === 'react') {
            config = this.generateReactConfig(domain, rootPath, enablePhp);
        } else if (type === 'static-next') {
            config = this.generateStaticNextConfig(domain, rootPath);
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
    removeConfig(primaryKey, domain = null, group = null) {
        // If domain is provided and it's a subdirectory, remove from parent config
        if (domain) {
            const parsed = parseDomain(domain);
            if (parsed.isSubdir) {
                const parentKey = generatePrimaryKey(parsed.mainDomain);
                return this.removeSubdirFromParentConfig(parentKey, parsed.subdir, group);
            }
        }

        // For regular domains, remove the config file
        const configFileName = group ? `${group}__${primaryKey}.caddy` : `${primaryKey}.caddy`;
        const configFile = path.join(this.caddyDir, configFileName);

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
    configExists(primaryKey, group = null) {
        const configFileName = group ? `${group}__${primaryKey}.caddy` : `${primaryKey}.caddy`;
        const configFile = path.join(this.caddyDir, configFileName);
        return fs.existsSync(configFile);
    }

    /**
     * Get path to config file
     * @param {string} primaryKey - Primary key for the site
     * @param {string|null} group - Optional group name
     * @returns {string} Path to config file
     */
    getConfigPath(primaryKey, group = null) {
        const configFileName = group ? `${group}__${primaryKey}.caddy` : `${primaryKey}.caddy`;
        return path.join(this.caddyDir, configFileName);
    }
}

// Export singleton instance
export default new CaddyManager();
