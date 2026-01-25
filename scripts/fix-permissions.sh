#!/bin/bash
# Permission Fix Script for Linux/Ubuntu Server
# This script fixes common permission issues for the Server Manager tool

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Server Manager - Permission Fix${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if running on Linux
if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    echo -e "${RED}Error: This script is designed for Linux/Ubuntu servers only.${NC}"
    exit 1
fi

# Check if www-data user exists
if ! id "www-data" &>/dev/null; then
    echo -e "${RED}Error: www-data user does not exist. Are you sure this is a web server?${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

echo -e "${YELLOW}[1/5]${NC} Fixing web directory permissions (www/)..."
if [ -d "www" ]; then
    # Fix ownership
    sudo chown -R www-data:www-data www/
    
    # Fix directory permissions
    sudo find www/ -type d -exec chmod 755 {} \;
    
    # Fix file permissions
    sudo find www/ -type f -exec chmod 644 {} \;
    
    echo -e "${GREEN}✓${NC} Web directory permissions fixed"
else
    echo -e "${YELLOW}⚠${NC}  www/ directory does not exist yet (will be created when adding sites)"
fi

echo ""
echo -e "${YELLOW}[2/5]${NC} Fixing Caddy configuration permissions (caddy/)..."
if [ ! -d "caddy" ]; then
    mkdir -p caddy
    echo -e "${GREEN}✓${NC} Created caddy/ directory"
fi

# Fix ownership (current user needs write access)
sudo chown -R $(whoami):$(whoami) caddy/

# Fix directory permissions
chmod 755 caddy/

# Fix file permissions if any .caddy files exist
if ls caddy/*.caddy 1> /dev/null 2>&1; then
    chmod 644 caddy/*.caddy
    echo -e "${GREEN}✓${NC} Caddy configuration permissions fixed"
else
    echo -e "${YELLOW}⚠${NC}  No Caddy config files found yet (will be created when adding sites)"
fi

echo ""
echo -e "${YELLOW}[3/5]${NC} Fixing logs directory permissions (logs/)..."
if [ ! -d "logs" ]; then
    mkdir -p logs
    echo -e "${GREEN}✓${NC} Created logs/ directory"
fi

# Fix ownership
sudo chown -R $(whoami):$(whoami) logs/

# Fix directory permissions
chmod 755 logs/

# Fix log file permissions if any exist
if ls logs/*.log 1> /dev/null 2>&1; then
    chmod 644 logs/*.log
    echo -e "${GREEN}✓${NC} Logs directory permissions fixed"
else
    echo -e "${YELLOW}⚠${NC}  No log files found yet (will be created on first run)"
fi

echo ""
echo -e "${YELLOW}[4/5]${NC} Fixing controller directory permissions..."
if [ -d "controller" ]; then
    chmod 755 controller/
    
    # Fix sites.json if it exists
    if [ -f "controller/sites.json" ]; then
        chmod 644 controller/sites.json
        echo -e "${GREEN}✓${NC} Controller directory permissions fixed"
    else
        echo -e "${YELLOW}⚠${NC}  sites.json does not exist yet (will be created on first run)"
    fi
else
    echo -e "${RED}✗${NC} controller/ directory not found"
fi

echo ""
echo -e "${YELLOW}[5/5]${NC} Checking PHP-FPM socket permissions..."

# Detect PHP version
PHP_VERSION=""
for version in 8.3 8.2 8.1 8.0 7.4; do
    if [ -S "/run/php/php${version}-fpm.sock" ]; then
        PHP_VERSION=$version
        break
    fi
done

if [ -n "$PHP_VERSION" ]; then
    SOCKET_PATH="/run/php/php${PHP_VERSION}-fpm.sock"
    
    # Check socket permissions
    if [ -S "$SOCKET_PATH" ]; then
        SOCKET_PERMS=$(stat -c "%a" "$SOCKET_PATH")
        echo -e "   Found PHP $PHP_VERSION FPM socket: $SOCKET_PATH"
        echo -e "   Current permissions: $SOCKET_PERMS"
        
        # Check if current user is in www-data group
        if groups $(whoami) | grep -q "www-data"; then
            echo -e "${GREEN}✓${NC} User $(whoami) is in www-data group"
        else
            echo -e "${YELLOW}⚠${NC}  User $(whoami) is not in www-data group"
            echo -e "   Run this to add yourself: ${BLUE}sudo usermod -a -G www-data $(whoami)${NC}"
            echo -e "   ${YELLOW}Note: You'll need to log out and back in for this to take effect${NC}"
        fi
        
        # Verify PHP-FPM is running
        if systemctl is-active --quiet php${PHP_VERSION}-fpm; then
            echo -e "${GREEN}✓${NC} PHP ${PHP_VERSION}-FPM is running"
        else
            echo -e "${RED}✗${NC} PHP ${PHP_VERSION}-FPM is not running"
            echo -e "   Start it with: ${BLUE}sudo systemctl start php${PHP_VERSION}-fpm${NC}"
        fi
    else
        echo -e "${RED}✗${NC} PHP-FPM socket not found at $SOCKET_PATH"
    fi
else
    echo -e "${YELLOW}⚠${NC}  No PHP-FPM socket found. Make sure PHP-FPM is installed."
    echo -e "   Install with: ${BLUE}sudo apt install php-fpm${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Permission fix completed!${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "Summary:"
echo -e "  ${GREEN}✓${NC} Web directories set to www-data:www-data with 755/644"
echo -e "  ${GREEN}✓${NC} Caddy configs set to $(whoami):$(whoami) with 755/644"
echo -e "  ${GREEN}✓${NC} Logs directory set to $(whoami):$(whoami) with 755/644"
echo -e "  ${GREEN}✓${NC} Controller directory permissions verified"

echo ""
echo -e "Next steps:"
echo -e "  1. Verify Caddy can access web files: ${BLUE}sudo systemctl status caddy${NC}"
echo -e "  2. Test site creation: ${BLUE}node cli.js add${NC}"
echo -e "  3. Check logs if issues persist: ${BLUE}cat logs/operations.log${NC}"

echo ""
echo -e "${YELLOW}Note:${NC} If you added yourself to www-data group, log out and back in for it to take effect."
echo ""
