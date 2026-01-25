#!/bin/bash
# Start PHP-FPM and MySQL for local development

# Start PHP-FPM
if ! pgrep -x "php-fpm" > /dev/null; then
    echo "Starting PHP-FPM..."
    /opt/homebrew/sbin/php-fpm -D
    echo "PHP-FPM started"
else
    echo "PHP-FPM is already running"
fi

# Start MySQL
if ! pgrep -x "mysqld" > /dev/null; then
    echo "Starting MySQL..."
    mysql.server start
else
    echo "MySQL is already running"
fi

echo "All services started successfully!"
