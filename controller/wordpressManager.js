import { executeCommand } from "./utils.js";
import databaseManager from "./databaseManager.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * WordPress Manager
 * Handles WordPress installation using WP-CLI
 */
class WordPressManager {
  /**
   * Check if WP-CLI is installed
   * @returns {Promise<boolean>} True if WP-CLI is available
   */
  async isWpCliInstalled() {
    try {
      await executeCommand("which wp");
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Download WordPress core files
   * @param {string} sitePath - Path to site directory
   * @returns {Promise<void>}
   */
  async downloadWordPress(sitePath) {
    try {
      // Set PHP memory limit to 1GB for WP-CLI
      const command = `php -d memory_limit=1G $(which wp) core download --path="${sitePath}" --quiet`;
      await executeCommand(command);
    } catch (error) {
      throw new Error(`Failed to download WordPress: ${error.message}`);
    }
  }

  /**
   * Create wp-config.php file
   * @param {string} sitePath - Path to site directory
   * @param {string} dbName - Database name
   * @param {string} dbUser - Database user
   * @param {string} dbPassword - Database password
   * @param {string} dbHost - Database host
   * @returns {Promise<void>}
   */
  async createConfig(
    sitePath,
    dbName,
    dbUser,
    dbPassword,
    dbHost,
    dbPrefix = "wp_",
  ) {
    try {
      const command = `php -d memory_limit=1G $(which wp) config create --path="${sitePath}" --dbname="${dbName}" --dbuser="${dbUser}" --dbpass="${dbPassword}" --dbhost="${dbHost}" --dbprefix="${dbPrefix}" --quiet`;
      await executeCommand(command);
    } catch (error) {
      throw new Error(`Failed to create wp-config.php: ${error.message}`);
    }
  }

  /**
   * Install WordPress
   * @param {string} sitePath - Path to site directory
   * @param {string} url - Site URL (domain)
   * @param {string} title - Site title
   * @param {string} adminUser - Admin username
   * @param {string} adminPassword - Admin password
   * @param {string} adminEmail - Admin email
   * @returns {Promise<void>}
   */
  async installWordPress(
    sitePath,
    url,
    title,
    adminUser,
    adminPassword,
    adminEmail,
  ) {
    try {
      const command = `php -d memory_limit=1G $(which wp) core install --path="${sitePath}" --url="${url}" --title="${title}" --admin_user="${adminUser}" --admin_password="${adminPassword}" --admin_email="${adminEmail}" --quiet`;
      await executeCommand(command);
    } catch (error) {
      throw new Error(`Failed to install WordPress: ${error.message}`);
    }
  }

  /**
   * Complete WordPress installation process
   * @param {string} sitePath - Path to site directory
   * @param {string} domain - Domain name
   * @param {string} primaryKey - Primary key for the site
   * @param {string} adminPassword - Generated admin password
   * @returns {Promise<Object>} Installation details
   */
  async setupWordPress(
    sitePath,
    domain,
    primaryKey,
    adminPassword,
    dbPrefix = "wp_",
  ) {
    // Check if WP-CLI is installed
    const wpCliInstalled = await this.isWpCliInstalled();
    if (!wpCliInstalled) {
      throw new Error(
        "WP-CLI is not installed. Please install it first: https://wp-cli.org/",
      );
    }

    try {
      // Get database credentials
      const dbInfo = databaseManager.getConnectionInfo();
      const dbName = databaseManager.getDatabaseName(primaryKey);
      const dbHost = `${dbInfo.host}:${dbInfo.port}`;

      // Step 1: Download WordPress
      await this.downloadWordPress(sitePath);

      // Step 2: Create wp-config.php
      await this.createConfig(
        sitePath,
        dbName,
        dbInfo.user,
        process.env.DB_PASSWORD || "",
        dbHost,
        dbPrefix,
      );

      // Step 3: Install WordPress'
      // const adminEmail = `admin@${domain}`;
      // strip domain for email, like www, shash etc
      // Also strip subdirectory paths (e.g., "elementpack.wp/blog" -> "elementpack.wp")
      const baseDomain = domain.split("/")[0];
      const adminEmail = `admin@${baseDomain.replace(/^www\./, "")}`;
      await this.installWordPress(
        sitePath,
        `https://${domain}`, // Use HTTPS for WordPress URL
        domain, // Site title = domain name
        "admin",
        adminPassword,
        adminEmail,
      );

      return {
        adminUser: "admin",
        adminPassword: adminPassword,
        adminEmail: adminEmail,
        url: `https://${domain}`,
        adminUrl: `https://${domain}/wp-admin`,
        database: dbName,
        dbPrefix: dbPrefix,
      };
    } catch (error) {
      throw new Error(`WordPress setup failed: ${error.message}`);
    }
  }

  /**
   * Remove WordPress installation
   * @param {string} sitePath - Path to site directory
   * @returns {Promise<void>}
   */
  async removeWordPress(sitePath) {
    try {
      // Simply remove the directory (will be handled by the main removal process)
      // This method is here for potential future cleanup tasks
      return true;
    } catch (error) {
      throw new Error(`Failed to remove WordPress: ${error.message}`);
    }
  }
}

// Export singleton instance
export default new WordPressManager();
