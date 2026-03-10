# Server Site Management Tool

A powerful Node.js CLI tool for managing static sites, WordPress installations, and reverse proxies with Caddy server integration on a Linux/Ubuntu server.

## Features

- ✨ **Fully CLI Interface** - Beautiful and intuitive command-line experience with interactive prompts
- 🌐 **Multiple Site Types** - Support for static sites (HTML/CSS/JS/PHP), Static React Sites (SPA), WordPress installations, and reverse proxies
- 📁 **Subdirectory Support** - Host multiple sites under subdirectories (e.g., domain.com/app1, domain.com/app2)
- 🔧 **Automatic Configuration** - Auto-generates Caddy server configurations with optimized settings
- 💾 **Database Management** - Automated MySQL database creation and cleanup for WordPress sites
- 🔒 **CORS Management** - Add or remove CORS headers for any site type
- ⚡ **PHP Management** - Enable or disable PHP support for static sites
- 📝 **Operation Logging** - All operations logged with timestamps to track changes
- 🔐 **Auto-generated Credentials** - Secure password generation for WordPress admin accounts
- 🔄 **WordPress Tools** - Reset WordPress passwords, manage installations
- 📊 **Site Information** - View detailed information about any configured site

## Prerequisites

- **Node.js** (v16 or higher)
- **MySQL/MariaDB** server
- **Caddy** web server (v2.0 or higher)
- **WP-CLI** (for WordPress installations)
- **PHP-FPM** (for PHP/WordPress sites)

## Installation

1. Clone or navigate to the project directory:
```bash
cd /path/to/server-manager
```

2. Install dependencies:
```bash
npm install
```

3. Create your `.env` file from the example:
```bash
cp .env.example .env
```

4. Edit `.env` with your configuration:
```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password_here
DB_PREFIX=site_

# Server Configuration
CADDY_RELOAD_CMD=caddy reload --config /etc/caddy/Caddyfile
PHP_FASTCGI_PATH=unix//run/php/php8.2-fpm.sock
```

5. Set up Caddy to import site configurations (see [Caddy Integration](#caddy-integration) section)

## Usage

### Add a New Site

```bash
node cli.js add
```

You'll be prompted to select:
- **Type**: Site (HTML/CSS/JS), Static React Site (SPA), WordPress, or Proxy
- **Domain**: Your domain name (e.g., `mysite.test` or `mysite.test/demo`)
- **PHP Support**: For static sites and React sites, optionally enable PHP
- **Proxy Address**: For proxy type, specify the upstream service (e.g., `localhost:3000`)
- **CORS Origin**: For proxy type, configure CORS settings

**Examples:**

**Static Site:**
```
Type: Site (HTML/CSS/JS)
Domain: mysite.test
Enable PHP: No
```

**Static React Site (SPA):**
```
Type: Static React Site (SPA with client-side routing)
Domain: myapp.test
Enable PHP: No
```

**WordPress Site:**
```
Type: WordPress Site
Domain: myblog.test
```

**Proxy Site:**
```
Type: Proxy
Domain: api.test
Proxy Address: localhost:3000
CORS Origin: *
```

**Subdirectory Site:**
```
Type: WordPress Site
Domain: mysite.test/blog
```
(Note: Parent domain `mysite.test` must exist first)

### Remove a Site

```bash
node cli.js remove
```

Prompts for the domain name to remove. This will:
- Delete the site directory and files
- Remove the MySQL database (for WordPress sites)
- Delete the Caddy configuration
- Remove the site from the sites registry

### List All Sites

```bash
node cli.js list
```

Displays a formatted table of all configured sites with their details including:
- Domain
- Type
- Path
- Database (if applicable)
- Created date

### Site Information

```bash
node cli.js info [domain]
```

Display detailed information about a specific site including:
- Configuration details
- File paths
- Database information
- WordPress credentials (if applicable)
- Creation/update timestamps

### Reload Caddy Server

```bash
node cli.js reload-caddy
```

Reloads the Caddy server to apply configuration changes without downtime.

### Reset WordPress Password

```bash
node cli.js reset-wp-password
```

Reset a WordPress user password by entering:
- Domain name
- Username or email
- New password

### Manage CORS Headers

```bash
node cli.js cors
```

Add or remove CORS headers for any site type. Options:
- Add/Update CORS with custom origin
- Remove CORS headers

### Manage PHP Support

```bash
node cli.js php
```

Add or remove PHP-FPM support for static sites. This allows static sites to process PHP files dynamically.

### Fix Permissions

```bash
node cli.js fix-permissions
```

Automatically fix common permission issues on Linux/Ubuntu servers. This command:
- Sets correct ownership for web directories (`www-data`)
- Fixes Caddy configuration permissions
- Fixes logs directory permissions
- Verifies PHP-FPM socket access

See [PERMISSION-FIX.md](PERMISSION-FIX.md) for detailed documentation.

### Display Help

```bash
node cli.js help
```

Shows all available commands with descriptions.

## How It Works

### Primary Key Generation
- Domain names are converted to primary keys by replacing dots (`.`) and slashes (`/`) with underscores (`_`)
- Examples:
  - `mydomain.test` → `mydomain_test`
  - `mydomain.test/demo` → `mydomain_test_demo`

### Directory Structure
All sites are organized in the `www/` directory with the primary key as the folder name:
- `www/mydomain_test/` - Site directory
- `www/mydomain_test/public/` - Web root (served by Caddy)

### Site Types

#### Static Sites (Site)
1. Creates site directory with `public/` folder
2. Generates Caddy configuration for static file serving
3. Optionally enables PHP-FPM support
4. Includes CORS headers, gzip compression, and directory browsing
5. Custom error page handling

**Directory Contents:**
```
www/mydomain_test/
└── public/           # Web root - place your HTML/CSS/JS here
    ├── index.html
    ├── css/
    ├── js/
    └── images/
```

#### Static React Sites (SPA)
1. Creates site directory with `public/` folder
2. Generates Caddy configuration for Single Page Applications
3. Implements SPA routing fallback (serves index.html for non-existent files)
4. Optionally enables PHP-FPM support (if needed for backend API)
5. Includes CORS headers, gzip compression, and caching
6. Supports client-side routing (React Router, Vue Router, etc.)

**Directory Contents:**
```
www/myapp_test/
└── public/           # Web root - place your built React app here
    ├── index.html
    ├── static/
    │   ├── css/
    │   └── js/
    ├── favicon.ico
    └── manifest.json
```

**How It Works:**
- Caddy serves static files directly (CSS, JS, images)
- For non-existent paths, Caddy serves `index.html` instead of 404
- This allows React Router (or similar) to handle routing on the client-side
- Perfect for production builds from Create React App, Vite, Next.js (static export), etc.

**Deployment Example:**
```bash
# 1. Create the site
node cli.js add
# Select: Static React Site
# Domain: myapp.test

# 2. Build your React app
cd /path/to/your/react-project
npm run build

# 3. Copy build files to the site directory
cp -r build/* /path/to/server-manager/www/myapp_test/public/

# 4. Access your app at https://myapp.test
```

#### WordPress Sites
1. Creates site directory with `public/` folder
2. Creates MySQL database with prefix (e.g., `site_mydomain_test`)
3. Downloads WordPress core files using WP-CLI
4. Creates `wp-config.php` with database credentials
5. Installs WordPress with:
   - Site title: Same as domain name
   - Admin username: `admin`
   - Admin password: `admin` (change after first login)
   - Admin email: `admin@DOMAIN`
6. Generates Caddy configuration optimized for WordPress
7. Includes PHP-FPM, security rules, and URL rewriting

**WordPress Admin Access:**
- URL: `https://yourdomain/wp-admin`
- Username: `admin`
- Password: `admin` (recommended to change)

#### Proxy Sites
1. Creates Caddy configuration for reverse proxy
2. Forwards requests to specified upstream service
3. Includes CORS headers and gzip compression
4. No directory or database created (routes to existing service)

**Use Cases:**
- Route to Node.js/Python/Go applications
- Connect to Docker containers
- Load balance to multiple backends

#### Subdirectory Sites
Subdirectory sites allow hosting multiple applications under a single domain:

1. Parent domain must exist first (e.g., `mydomain.test`)
2. Create subdirectory site (e.g., `mydomain.test/blog`)
3. Configuration is added to parent domain's Caddy file
4. Each subdirectory has its own isolated directory and database (if WordPress)

**Example Setup:**
```
mydomain.test           → Main site (WordPress)
mydomain.test/shop      → WooCommerce shop (WordPress)
mydomain.test/api       → REST API (Proxy to localhost:3000)
mydomain.test/admin     → Admin panel (Static site with PHP)
mydomain.test/app       → React dashboard (Static React Site)
```

### Caddy Configuration

Configuration files are stored in the `caddy/` directory:
- Named as `{primary-key}.caddy` (e.g., `mydomain_test.caddy`)
- Includes automatic HTTPS with internal TLS
- Logging to `logs/` directory
- Optimized for the specific site type
- Compression and caching headers

**Static Site Config Features:**
- Static file serving
- Optional PHP-FPM integration
- CORS headers
- Gzip/Zstd compression
- Custom error pages
- Cache headers for static assets

**Static React Site (SPA) Config Features:**
- Static file serving with SPA fallback
- Serves index.html for non-existent files (client-side routing)
- Optional PHP-FPM integration (for backend APIs)
- CORS headers
- Gzip/Zstd compression
- Cache headers for static assets (long-term caching for JS/CSS bundles)
- Perfect for React, Vue, Angular, or any SPA framework

**WordPress Config Features:**
- PHP-FPM with WordPress-specific rewrite rules
- Security rules (block sensitive files)
- URL rewriting for permalinks
- Upload directory access
- All static site features

**Proxy Config Features:**
- Reverse proxy to upstream service
- CORS headers
- Connection pooling

### Logging

All operations are logged to `logs/controller-operations.log` with:
- Timestamp (ISO 8601 format)
- Log level (INFO/SUCCESS/ERROR/WARNING)
- Operation type
- Relevant details (domain, paths, errors, etc.)

## Project Structure

```
server-manager/
├── cli.js                          # Main CLI entry point
├── package.json                    # Dependencies and scripts
├── .env                           # Environment configuration (create from .env.example)
├── .env.example                   # Environment template
├── README.md                      # This file
├── SETUP.md                       # Quick setup guide
├── Caddyfile.example              # Example Caddy configuration
│
├── controller/                    # Core application logic
│   ├── logger.js                  # Logging functionality
│   ├── siteManager.js            # Site data management (CRUD)
│   ├── caddyManager.js           # Caddy config generation
│   ├── databaseManager.js        # MySQL operations
│   ├── wordpressManager.js       # WordPress installation via WP-CLI
│   ├── utils.js                  # Helper functions
│   ├── sites.json                # Site database (auto-generated)
│   │
│   └── commands/                 # CLI command handlers
│       ├── addSite.js            # Add site command
│       ├── removeSite.js         # Remove site command
│       ├── listSites.js          # List sites command
│       ├── siteInfo.js           # Site information command
│       ├── resetWpPassword.js    # Reset WordPress password
│       ├── manageCors.js         # CORS management
│       ├── managePhp.js          # PHP management
│       ├── reloadCaddy.js        # Reload Caddy command
│       ├── displayHelp.js        # Help command
│       └── helpers.js            # Shared helper functions
│
├── caddy/                        # Caddy configurations (auto-generated)
│   ├── mydomain_test.caddy       # Individual site configs
│   └── ...
│
├── logs/                         # Operation logs
│   ├── controller-operations.log # All CLI operations
│   ├── mydomain_test-access.log  # Caddy access logs (auto-generated)
│   └── ...
│
├── www/                          # Web root directory
│   ├── mydomain_test/            # Site directories
│   │   └── public/               # Served by Caddy
│   └── ...
│
└── scripts/                      # Utility scripts
    └── start-services.sh         # Service startup script
```

## Module Architecture

### Core Modules

#### `controller/logger.js`
- Centralized logging system
- Writes to `logs/controller-operations.log`
- Supports multiple log levels (INFO, SUCCESS, ERROR, WARNING)
- Timestamps all operations

#### `controller/siteManager.js`
- Manages `sites.json` database
- CRUD operations for site data
- Site existence checking
- Site status management (initializing, published, deleting)

#### `controller/caddyManager.js`
- Generates Caddy configurations
- Handles config file creation/removal
- Separate config generators for each site type
- Subdirectory configuration management
- Updates parent configs for subdirectory sites

#### `controller/databaseManager.js`
- MySQL database operations
- Database creation and removal
- Connection management
- Credential handling

#### `controller/wordpressManager.js`
- WP-CLI integration
- WordPress core download
- wp-config.php generation
- WordPress installation automation
- Admin user setup

#### `controller/utils.js`
- Primary key generation from domains
- Secure password generation
- Domain validation and parsing
- Subdirectory detection
- Command execution helpers

### Command Modules

Each command in `controller/commands/` is a self-contained module that:
- Handles user interaction with inquirer prompts
- Validates input
- Executes operations via core modules
- Displays formatted output
- Logs operations

## Caddy Integration

To integrate with Caddy, add an import statement to your main Caddyfile:

**Example Caddyfile:**
```
# Global options
{
    email admin@example.com
    admin on
}

# Import all site configurations
import /path/to/server-manager/caddy/*.caddy

# Other global configurations can go here
```

**Location of main Caddyfile:**
- Linux: `/etc/caddy/Caddyfile`
- macOS (Homebrew): `/opt/homebrew/etc/Caddyfile`
- Custom: Specify in `.env` with `CADDY_RELOAD_CMD`

After adding sites or making changes:
```bash
node cli.js reload-caddy
```

Or manually:
```bash
sudo caddy reload --config /etc/caddy/Caddyfile
```

## After Creating a Site

1. **Reload Caddy** to apply the new configuration:
   ```bash
   node cli.js reload-caddy
   ```

2. **Add content** to the site:
   - For static sites: Place files in `www/{primary_key}/public/`
   - For WordPress: Access admin at `https://yourdomain/wp-admin`
   - For proxies: Ensure upstream service is running

3. **Configure DNS/Hosts**:
   - For local development, add entries to `/etc/hosts`:
     ```
     127.0.0.1 mysite.test
     ```
   - For production, point DNS A records to your server IP

4. **Check logs** if issues occur:
   - Operations: `logs/controller-operations.log`
   - Access logs: `logs/{primary_key}-access.log`
   - Caddy logs: Check Caddy's system logs

## Site Information Storage

All site information is stored in `controller/sites.json`:

**Example Entry:**
```json
{
  "sites": {
    "mydomain_test": {
      "domain": "mydomain.test",
      "type": "wp",
      "primaryKey": "mydomain_test",
      "path": "/path/to/server-manager/www/mydomain_test/public",
      "caddyConfig": "/path/to/server-manager/caddy/mydomain_test.caddy",
      "database": "site_mydomain_test",
      "status": "published",
      "wordpress": {
        "adminUser": "admin",
        "adminEmail": "admin@mydomain.test",
        "url": "https://mydomain.test",
        "adminUrl": "https://mydomain.test/wp-admin"
      },
      "createdAt": "2026-01-25T10:30:00.000Z",
      "updatedAt": "2026-01-25T10:30:00.000Z"
    }
  }
}
```

## Service Management

### Restart Caddy Server

**macOS:**
```bash
# Using Homebrew services
brew services restart caddy

# Or reload without restart
sudo caddy reload --config /opt/homebrew/etc/Caddyfile

# Or using CLI tool
node cli.js reload-caddy
```

**Linux:**
```bash
# Using systemctl
sudo systemctl restart caddy

# Or reload without restart
sudo caddy reload --config /etc/caddy/Caddyfile

# Check status
sudo systemctl status caddy

# Or using CLI tool
node cli.js reload-caddy
```

### Restart MySQL Service

**macOS:**
```bash
# Using Homebrew services
brew services restart mysql

# Check status
brew services list | grep mysql
```

**Linux:**
```bash
# Using systemctl
sudo systemctl restart mysql

# Check status
sudo systemctl status mysql

# For MariaDB
sudo systemctl restart mariadb
```

### Restart PHP-FPM Service

**macOS:**
```bash
# Replace 8.2 with your PHP version
brew services restart php@8.2

# Check status
brew services list | grep php
```

**Linux:**
```bash
# Replace 8.2 with your PHP version
sudo systemctl restart php8.2-fpm

# Check status
sudo systemctl status php8.2-fpm
```

## Troubleshooting

### WP-CLI Not Found
Install WP-CLI from https://wp-cli.org/

```bash
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar
sudo mv wp-cli.phar /usr/local/bin/wp
wp --info
```

### Database Connection Errors
- Verify MySQL is running:
  - macOS: `brew services list | grep mysql`
  - Linux: `sudo systemctl status mysql`
- Check credentials in `.env`
- Test database connection:
  ```bash
  mysql -u root -p
  ```
- Ensure database user has proper permissions:
  ```sql
  GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost';
  FLUSH PRIVILEGES;
  ```

### Caddy Configuration Errors
- Validate syntax:
  ```bash
  caddy validate --config /etc/caddy/Caddyfile
  ```
- Check Caddy logs:
  ```bash
  # Linux
  sudo journalctl -u caddy -f
  
  # macOS
  tail -f /opt/homebrew/var/log/caddy.log
  ```
- Ensure port 80/443 aren't in use:
  ```bash
  sudo lsof -i :80
  sudo lsof -i :443
  ```

### PHP Files Not Processing
- Verify PHP-FPM is running (see Service Management)
- Check PHP-FPM socket path in `.env` matches your system:
  - Common paths:
    - Linux: `unix//run/php/php8.2-fpm.sock`
    - macOS: `unix//opt/homebrew/var/run/php-fpm.sock`
- Verify PHP-FPM socket permissions:
  ```bash
  ls -la /run/php/php8.2-fpm.sock
  ```

### Permission Errors
- Use the automated fix:
  ```bash
  node cli.js fix-permissions
  ```
- Or manually ensure proper ownership of web directories:
  ```bash
  # Linux (www-data user)
  sudo chown -R www-data:www-data www/
  ```
- See [PERMISSION-FIX.md](PERMISSION-FIX.md) for comprehensive troubleshooting

### Site Already Exists Error
- Check if domain is already registered:
  ```bash
  node cli.js list
  ```
- Remove the existing site first:
  ```bash
  node cli.js remove
  ```
- Or choose a different domain name

### Subdirectory Site Creation Fails
- Ensure parent domain exists:
  ```bash
  node cli.js list
  ```
- Create parent domain first:
  ```bash
  node cli.js add
  # Enter: parentdomain.test
  ```
- Then create subdirectory:
  ```bash
  node cli.js add
  # Enter: parentdomain.test/subdirectory
  ```

## Advanced Usage

### Custom PHP Version
Edit `.env` to specify your PHP-FPM socket:
```bash
PHP_FASTCGI_PATH=unix//run/php/php8.1-fpm.sock
```

### Custom Database Prefix
Change the database prefix in `.env`:
```bash
DB_PREFIX=myprefix_
```

### Multiple Domain Configurations
You can create multiple sites and manage them independently. Each site gets:
- Unique directory: `www/{primary_key}/`
- Unique Caddy config: `caddy/{primary_key}.caddy`
- Unique database (WordPress): `{DB_PREFIX}{primary_key}`

### Programmatic Access
You can import and use the modules directly in your Node.js code:

```javascript
import siteManager from './controller/siteManager.js';
import caddyManager from './controller/caddyManager.js';

// List all sites
const sites = siteManager.readSites();
console.log(sites);

// Check if site exists
if (siteManager.siteExists('mydomain_test')) {
  console.log('Site exists!');
}
```

## Security Considerations

1. **Change Default WordPress Passwords**: The tool sets `admin` as the default password - change it immediately after first login
2. **Database Credentials**: Keep `.env` file secure and never commit it to version control
3. **File Permissions**: Ensure proper permissions on web directories
4. **Firewall Rules**: Configure firewall to allow only necessary ports (80, 443)
5. **Regular Updates**: Keep WordPress core, plugins, and themes updated
6. **SSL Certificates**: Caddy automatically handles SSL with Let's Encrypt for production domains

## Future Enhancements

- Automated SSL certificate management for custom domains
- Site cloning functionality
- Backup and restore features
- Site migration tools
- Multi-user support with role-based access control
- Site templates for quick deployment
- Docker integration
- CI/CD pipeline integration
- Automatic WordPress plugin installation
- Site analytics dashboard

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Contact

emranio@yahoo.com

---

**Version:** 1.0.0  
**Last Updated:** January 25, 2026