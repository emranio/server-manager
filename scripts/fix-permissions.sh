#!/bin/bash

# Fix Permissions Script
# Sets up shared access for www-data (PHP), caddy, and the current user.

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Assuming www is at the project root level (one level up from scripts)
WWW_DIR="$(dirname "$SCRIPT_DIR")/www"

CURRENT_USER=$(whoami)
WEB_GROUP="www-data"

echo "🔧 Fixing permissions for www directory at $WWW_DIR..."

# 1. Ensure the group exists
if ! getent group "$WEB_GROUP" > /dev/null; then
    echo "Creating group $WEB_GROUP..."
    sudo groupadd "$WEB_GROUP"
fi

# 2. Add users to the group
# We try to add: current user, caddy, ubuntu (if exists), www-data
USERS_TO_ADD=("$CURRENT_USER" "caddy" "ubuntu" "www-data")

for USr in "${USERS_TO_ADD[@]}"; do
    if id "$USr" &>/dev/null; then
        # Check if user is already in group to avoid unnecessary output/operations
        if id -nG "$USr" | grep -qw "$WEB_GROUP"; then
             echo "User '$USr' is already in group '$WEB_GROUP'."
        else
             echo "Adding user '$USr' to group '$WEB_GROUP'..."
             sudo usermod -aG "$WEB_GROUP" "$USr"
        fi
    else
        echo "User '$USr' not found, skipping."
    fi
done

# 3. Fix directory ownership and permissions
if [ -d "$WWW_DIR" ]; then
    echo "Setting ownership of contents to $CURRENT_USER:$WEB_GROUP..."
    # Use current user as owner, www-data as group
    sudo chown -R "$CURRENT_USER:$WEB_GROUP" "$WWW_DIR"
    
    echo "Setting permissions to 775 (rwxrwxr-x)..."
    sudo chmod -R 775 "$WWW_DIR"
    
    echo "Setting setgid bit on directories (new files inherit group)..."
    sudo find "$WWW_DIR" -type d -exec chmod g+s {} +
    
    echo "✅ Permissions fixed for $WWW_DIR"
else
    echo "❌ Error: $WWW_DIR not found."
fi

echo ""
echo "Note: If you just added yourself to the group, you may need to log out and back in."
