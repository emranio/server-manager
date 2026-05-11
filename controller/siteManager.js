import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Site Manager
 * Handles reading and writing site information to sites.json
 */
class SiteManager {
    constructor() {
        this.sitesFile = path.join(__dirname, 'sites.json');
        this.ensureSitesFile();
    }

    /**
     * Ensure sites.json exists
     */
    ensureSitesFile() {
        if (!fs.existsSync(this.sitesFile)) {
            fs.writeFileSync(this.sitesFile, JSON.stringify({ sites: {} }, null, 2), 'utf8');
        }
    }

    /**
     * Read all sites from sites.json
     * @returns {Object} Sites data
     */
    readSites() {
        try {
            const data = fs.readFileSync(this.sitesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading sites.json:', error.message);
            return { sites: {} };
        }
    }

    /**
     * Write sites data to sites.json
     * @param {Object} data - Sites data
     */
    writeSites(data) {
        if (data.sites['adminPassword']) {
            delete data.sites['adminPassword'];
        }
        try {
            fs.writeFileSync(this.sitesFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            throw new Error(`Failed to write sites.json: ${error.message}`);
        }
    }

    /**
     * Add a new site
     * @param {string} primaryKey - Primary key for the site
     * @param {Object} siteData - Site information
     */
    addSite(primaryKey, siteData) {
        const data = this.readSites();
        data.sites[primaryKey] = {
            ...siteData,
            status: siteData.status || 'published',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.writeSites(data);
    }

    /**
     * Update site status
     * @param {string} primaryKey - Primary key for the site
     * @param {string} status - New status (initializing, published, deleting)
     */
    updateSiteStatus(primaryKey, status) {
        const data = this.readSites();
        if (data.sites[primaryKey]) {
            data.sites[primaryKey].status = status;
            data.sites[primaryKey].updatedAt = new Date().toISOString();
            this.writeSites(data);
        }
    }

    /**
     * Remove a site
     * @param {string} primaryKey - Primary key for the site
     * @returns {boolean} True if site was removed
     */
    removeSite(primaryKey) {
        const data = this.readSites();
        if (data.sites[primaryKey]) {
            delete data.sites[primaryKey];
            this.writeSites(data);
            return true;
        }
        return false;
    }

    /**
     * Get a specific site
     * @param {string} primaryKey - Primary key for the site
     * @returns {Object|null} Site data or null if not found
     */
    getSite(primaryKey) {
        const data = this.readSites();
        return data.sites[primaryKey] || null;
    }

    /**
     * Check if site exists
     * @param {string} primaryKey - Primary key for the site
     * @returns {boolean} True if site exists
     */
    siteExists(primaryKey) {
        const data = this.readSites();
        return !!data.sites[primaryKey];
    }

    /**
     * Update site information
     * @param {string} primaryKey - Primary key for the site
     * @param {Object} updates - Updates to apply
     */
    updateSite(primaryKey, updates) {
        const data = this.readSites();
        if (data.sites[primaryKey]) {
            const updatedSite = {
                ...data.sites[primaryKey],
                ...updates,
                updatedAt: new Date().toISOString()
            };

            Object.keys(updatedSite).forEach((key) => {
                if (updatedSite[key] === undefined) {
                    delete updatedSite[key];
                }
            });

            data.sites[primaryKey] = updatedSite;
            this.writeSites(data);
        }
    }

    /**
     * List all sites
     * @returns {Object} All sites
     */
    listAllSites() {
        const data = this.readSites();
        return data.sites;
    }
}

// Export singleton instance
export default new SiteManager();
