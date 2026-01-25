# Permission Fix Guide for Linux/Ubuntu Server

This document explains common permission issues in the Server Manager tool on Linux/Ubuntu servers and provides solutions to fix them.

## Overview

Permission issues can prevent the server manager from properly creating sites, writing logs, or serving web content. This guide covers the most common scenarios on Linux/Ubuntu servers and how to resolve them.

## Common Permission Issues

### 1. Web Directory Permissions

**Problem:** Caddy web server cannot read files in the `www/` directory, resulting in 403 Forbidden errors or file not found errors.

**Symptoms:**
- Sites return 403 Forbidden errors
- Caddy logs show permission denied errors
- WordPress installation fails
- Static files cannot be served

**Solution:**

```bash
# Fix ownership of web directories (www-data is the standard web server user on Ubuntu)
sudo chown -R www-data:www-data www/

# Fix directory permissions (755 = rwxr-xr-x)
sudo find www/ -type d -exec chmod 755 {} \;

# Fix file permissions (644 = rw-r--r--)
sudo find www/ -type f -exec chmod 644 {} \;
```

### 2. Caddy Configuration Permissions

**Problem:** Caddy cannot read its configuration files, or the tool cannot write new configuration files.

**Symptoms:**
- Caddy reload fails
- New sites don't appear in Caddy
- Configuration errors on Caddy startup

**Solution:**

```bash
# Ensure caddy directory exists
mkdir -p caddy/

# Fix ownership
sudo chown -R $(whoami):$(whoami) caddy/

# Fix file permissions (644 = readable by all, writable by owner)
chmod 644 caddy/*.caddy 2>/dev/null || true

# Fix directory permissions
chmod 755 caddy/
```

### 3. Logs Directory Permissions

**Problem:** The application cannot write to log files.

**Symptoms:**
- Log files are not created
- Application fails to start
- Error messages about log file access

**Solution:**

```bash
# Ensure logs directory exists
mkdir -p logs/

# Fix ownership
sudo chown -R $(whoami):$(whoami) logs/

# Fix directory permissions (755 = rwxr-xr-x)
chmod 755 logs/

# Fix existing log file permissions (644 = rw-r--r--)
chmod 644 logs/*.log 2>/dev/null || true
```

### 4. PHP-FPM Socket Permissions

**Problem:** Caddy cannot communicate with PHP-FPM via the socket file.

**Symptoms:**
- PHP files are downloaded instead of executed
- 502 Bad Gateway errors
- PHP sites return errors

**Solution:**

```bash
# Check PHP-FPM socket location (adjust version as needed: 8.0, 8.1, 8.2, 8.3, etc.)
ls -la /run/php/php8.2-fpm.sock

# Fix socket permissions (usually done automatically, but if needed)
sudo chmod 666 /run/php/php8.2-fpm.sock

# Or add www-data to your user group (persistent fix)
sudo usermod -a -G www-data $USER

# Restart PHP-FPM (adjust version as needed)
sudo systemctl restart php8.2-fpm

# Verify PHP-FPM is running
sudo systemctl status php8.2-fpm
```

### 5. Database File Permissions (sites.json)

**Problem:** The application cannot read or write to `sites.json`.

**Symptoms:**
- Sites are not saved
- Cannot list sites
- Site information is lost after restart

**Solution:**

```bash
# Fix controller directory permissions
chmod 755 controller/

# Fix sites.json permissions
chmod 644 controller/sites.json
```

## Quick Fix Script

We provide an automated script to fix all common permission issues at once:

```bash
# Run the permission fix script
bash scripts/fix-permissions.sh
```

This script will:
1. Fix web directory ownership and permissions
2. Fix Caddy configuration permissions
3. Fix logs directory permissions
4. Fix database file permissions
5. Verify PHP-FPM socket access

### Or use the CLI command:

```bash
# Fix all permissions using the CLI
node cli.js fix-permissions
```

## Platform-Specific Considerations

### Linux/Ubuntu Server

**Web Server User:** `www-data`

**Caddy Configuration:** Caddy should run as `www-data` or have read access to web directories

```bash
# Check which user Caddy is running as
ps aux | grep caddy

# Check Caddy service configuration
sudo systemctl status caddy

# If Caddy is running as root, configure it to run as www-data
sudo systemctl edit caddy
# Add the following lines:
# [Service]
# User=www-data
# Group=www-data

# Reload systemd and restart Caddy
sudo systemctl daemon-reload
sudo systemctl restart caddy
```

**PHP-FPM Configuration:** Ensure PHP-FPM runs as `www-data`

```bash
# Check PHP-FPM configuration
sudo grep -E '^(user|group)' /etc/php/8.2/fpm/pool.d/www.conf

# Should show:
# user = www-data
# group = www-data
```

## WordPress-Specific Permissions

WordPress requires write access to certain directories:

```bash
# For WordPress sites in www/{site_key}/public/
cd www/{site_key}/public

# Allow WordPress to write uploads
sudo chown -R www-data:www-data wp-content/uploads/
chmod -R 755 wp-content/uploads/

# Allow WordPress to write plugin/theme files (optional, for auto-updates)
sudo chown -R www-data:www-data wp-content/plugins/
sudo chown -R www-data:www-data wp-content/themes/
chmod -R 755 wp-content/plugins/
chmod -R 755 wp-content/themes/
```

## Troubleshooting

### Check Current Permissions

```bash
# Check www directory
ls -la www/

# Check a specific site
ls -la www/{site_key}/

# Check Caddy configs
ls -la caddy/

# Check logs
ls -la logs/
```

### Verify Ownership

```bash
# Check what user Caddy runs as
ps aux | grep caddy | grep -v grep

# Check what user PHP-FPM runs as
ps aux | grep php-fpm | grep -v grep
```

### Test After Fixing

```bash
# Reload Caddy
caddy reload --config /etc/caddy/Caddyfile

# Or use the system service
sudo systemctl reload caddy

# Create a test site to verify permissions
node cli.js add
```

## Prevention

### Best Practices

1. **Run setup script after installation:**
   ```bash
   bash scripts/fix-permissions.sh
   ```

2. **Use consistent user for Caddy and PHP-FPM:**
   - Both should run as `www-data` on Linux
   - Both should run as current user or `_www` on macOS

3. **Avoid using sudo for site management:**
   - Run `node cli.js` as regular user
   - Let the tool create directories with correct ownership

4. **Set up permissions once, maintain them:**
   - Add permission fix to your deployment scripts
   - Run permission fix after pulling code updates

### Automated Setup

Add this to your server provisioning or deployment script:

```bash
#!/bin/bash
# Setup permissions for server-manager

cd /path/to/server-manager

# Fix all permissions
bash scripts/fix-permissions.sh

# Reload services
sudo systemctl reload caddy
sudo systemctl restart php8.2-fpm
```

## Security Notes

- **Never use 777 permissions** - This makes files world-writable and is a security risk
- **Minimum required permissions:**
  - Directories: `755` (rwxr-xr-x)
  - Files: `644` (rw-r--r--)
  - Scripts: `755` (rwxr-xr-x)
- **WordPress uploads directory:** Can use `755` or `775` if group-writable is needed
- **Configuration files:** Should be `644` and owned by the user running the application

## Getting Help

If you continue to experience permission issues after applying these fixes:

1. Check the logs: `cat logs/operations.log`
2. Verify service user: `ps aux | grep -E 'caddy|php-fpm'`
3. Test file creation: `touch www/test.txt && rm www/test.txt`
4. Review Caddy logs: `sudo journalctl -u caddy -n 50`

For more help, open an issue at: [GitHub Repository URL]

---

**Last Updated:** January 25, 2026  
**Version:** 1.0.0
