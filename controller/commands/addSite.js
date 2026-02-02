import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.js';
import siteManager from '../siteManager.js';
import caddyManager from '../caddyManager.js';
import databaseManager from '../databaseManager.js';
import wordpressManager from '../wordpressManager.js';
import {
    generatePrimaryKey,
    generatePassword,
    isValidDomain,
    parseDomain
} from '../utils.js';
import { displayBanner, displaySuccess, displayError, displayStep, reloadCaddy } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Add Site Command
 * Creates a new site, WordPress site, or proxy
 */
export default async function addSite() {
    displayBanner();
    console.log(chalk.yellow.bold('Add New Site\n'));

    // Declare variables at function scope so they're accessible in all try-catch blocks
    let type, domain, primaryKey, sitePath, parsedDomain;
    let createdResources = {
        directory: false,
        database: false,
        caddyConfig: false
    };

    try {
        // Prompt for site details
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'type',
                message: 'Select site type:',
                choices: [
                    { name: 'Site (HTML/CSS/JS)', value: 'site' },
                    { name: 'Static React Site (SPA with client-side routing)', value: 'react' },
                    { name: 'WordPress Site', value: 'wp' },
                    { name: 'Proxy (Forward to another service)', value: 'proxy' }
                ]
            },
            {
                type: 'input',
                name: 'domain',
                message: 'Enter domain name (e.g., mysite.test or mysite.test/demo):',
                validate: (input) => {
                    if (!input.trim()) {
                        return 'Domain name is required';
                    }
                    if (!isValidDomain(input.trim())) {
                        return 'Invalid domain format. Use domain.tld or domain.tld/path format.';
                    }
                    return true;
                },
                filter: (input) => input.trim()
            },
            {
                type: 'confirm',
                name: 'enablePhp',
                message: 'Enable PHP support?',
                default: false,
                when: (answers) => answers.type === 'site' || answers.type === 'react'
            },
            {
                type: 'input',
                name: 'proxyAddress',
                message: 'Enter proxy forward address (e.g., localhost:3000):',
                when: (answers) => answers.type === 'proxy',
                validate: (input) => {
                    if (!input.trim()) {
                        return 'Proxy address is required';
                    }
                    // Basic validation for host:port format
                    if (!/^[a-zA-Z0-9.-]+:\d+$/.test(input.trim())) {
                        return 'Invalid format. Use host:port (e.g., localhost:3000)';
                    }
                    return true;
                },
                filter: (input) => input.trim()
            },
            {
                type: 'input',
                name: 'corsOrigin',
                message: 'Enter CORS origin (leave empty to skip CORS, or * to allow all):',
                default: '',
                when: (answers) => answers.type === 'proxy',
                filter: (input) => input.trim()
            }
        ]);

        // Assign to outer scope variables
        type = answers.type;
        domain = answers.domain;
        const enablePhp = answers.enablePhp || false;
        const proxyAddress = answers.proxyAddress || null;
        const corsOrigin = answers.corsOrigin || '';
        parsedDomain = parseDomain(domain);
        primaryKey = generatePrimaryKey(domain);

        // For subdirectory sites, check if parent domain exists
        if (parsedDomain.isSubdir) {
            const parentKey = generatePrimaryKey(parsedDomain.mainDomain);
            if (!siteManager.siteExists(parentKey)) {
                displayError('Parent domain not found', {
                    message: `Parent domain ${parsedDomain.mainDomain} does not exist. Create the parent domain first.`
                });
                logger.error('Site creation failed: Parent domain does not exist', {
                    domain,
                    parentDomain: parsedDomain.mainDomain,
                    primaryKey
                });
                return;
            }
            console.log(chalk.green(`✓ Parent domain ${parsedDomain.mainDomain} found\n`));
        }

        // Check if site already exists
        if (siteManager.siteExists(primaryKey)) {
            displayError('Site already exists', { message: `Site with domain ${domain} already exists` });
            logger.error('Site creation failed: Site already exists', { domain, primaryKey });
            return;
        }

        // Set up directory path
        sitePath = path.join(__dirname, '..', '..', 'www', primaryKey);
        const publicPath = path.join(sitePath, 'public'); // Public folder for serving

        // Step 0: Initialize site with "initializing" status
        console.log(chalk.magenta('\nInitializing site entry...\n'));
        const initialSiteData = {
            domain,
            type,
            primaryKey,
            path: publicPath, // Store path with /public
            caddyConfig: null,
            database: null,
            status: 'initializing'
        };
        siteManager.addSite(primaryKey, initialSiteData);
        logger.info('Site initialized with status: initializing', { domain, primaryKey });

        try {
            console.log(chalk.magenta('Starting site creation process...\n'));

            // Step 1: Create directory (skip for proxy)
            if (type !== 'proxy') {
                displayStep(1, type === 'wp' ? 5 : 3, 'Creating site directory...');
                if (!fs.existsSync(sitePath)) {
                    fs.mkdirSync(sitePath, { recursive: true });
                }
                // Create public folder
                if (!fs.existsSync(publicPath)) {
                    fs.mkdirSync(publicPath, { recursive: true });
                }
                
                // Copy welcome.html as index.html for site and react types
                if (type === 'site' || type === 'react') {
                    const welcomeHtmlPath = path.join(__dirname, '..', 'welcome.html');
                    const indexHtmlPath = path.join(publicPath, 'index.html');
                    
                    if (fs.existsSync(welcomeHtmlPath)) {
                        fs.copyFileSync(welcomeHtmlPath, indexHtmlPath);
                        logger.info('Welcome page copied to site', { domain, welcomePage: indexHtmlPath });
                    }
                }
                
                createdResources.directory = true;
                logger.info('Site directory created with public folder', { domain, path: sitePath, publicPath: publicPath });
            }

            let wpDetails = null;
            let dbName = null;

            // WordPress specific setup
            if (type === 'wp') {
                // Step 2: Create database
                displayStep(2, 5, 'Creating MySQL database...');
                dbName = await databaseManager.createDatabase(primaryKey);
                createdResources.database = true;
                logger.info('Database created', { domain, database: dbName });

                // Step 3: Generate admin password
                displayStep(3, 5, 'Generating admin credentials...');
                const adminPassword = 'admin';

                // Step 4: Install WordPress
                displayStep(4, 5, 'Installing WordPress (this may take a moment)...');
                wpDetails = await wordpressManager.setupWordPress(publicPath, domain, primaryKey, adminPassword);
                logger.info('WordPress initialized', { domain, ...wpDetails });
            }

            // Step 5 (or 2 for site/react/proxy): Create Caddy config
            const stepNum = type === 'wp' ? 5 : (type === 'proxy' ? 1 : 2);
            const totalSteps = type === 'wp' ? 5 : (type === 'proxy' ? 2 : 3);
            displayStep(stepNum, totalSteps, 'Creating Caddy configuration...');
            const caddyConfigPath = caddyManager.createConfig(primaryKey, domain, type, publicPath, { enablePhp, proxyAddress, corsOrigin });
            createdResources.caddyConfig = true;
            logger.info('Caddy config created', { domain, config: caddyConfigPath });

            // Final step: Update site information with complete data
            displayStep(totalSteps, totalSteps, 'Finalizing site information...');
            const completeSiteData = {
                domain,
                type,
                primaryKey,
                path: publicPath, // Store path with /public
                caddyConfig: caddyConfigPath,
                database: dbName,
                status: 'published',
                isSubdirectory: parsedDomain.isSubdir,
                ...((type === 'site' || type === 'react') && { enablePhp }),
                ...(type === 'proxy' && { proxyAddress, ...(corsOrigin && { corsOrigin }) }),
                ...(parsedDomain.isSubdir && {
                    parentDomain: parsedDomain.mainDomain,
                    subdirectory: parsedDomain.subdir
                }),
                ...(wpDetails && { wordpress: wpDetails })
            };

            // Update site with complete data and "published" status
            siteManager.updateSite(primaryKey, completeSiteData);
            logger.success('Site published successfully', { domain, primaryKey });

            // Display success information
            const successDetails = {
                'Domain': domain,
                'Type': type === 'site' ? 'Site' : (type === 'react' ? 'Static React Site' : (type === 'wp' ? 'WordPress' : 'Proxy')),
                'Directory': type !== 'proxy' ? sitePath : 'N/A',
                'Primary Key': primaryKey,
                'Caddy Config': caddyConfigPath,
                'Status': 'Published'
            };

            if (parsedDomain.isSubdir) {
                successDetails['Parent Domain'] = parsedDomain.mainDomain;
                successDetails['Subdirectory'] = parsedDomain.subdir;
            }

            if (type === 'site' || type === 'react') {
                successDetails['PHP Support'] = enablePhp ? 'Enabled' : 'Disabled';
            }

            if (type === 'proxy') {
                successDetails['Proxy Address'] = proxyAddress;
                if (corsOrigin) {
                    successDetails['CORS Origin'] = corsOrigin;
                }
            }

            if (type === 'wp' && wpDetails) {
                successDetails['Database'] = dbName;
                successDetails['Admin URL'] = wpDetails.adminUrl;
                successDetails['Admin User'] = wpDetails.adminUser;
                successDetails['Admin Password'] = wpDetails.adminPassword;
                successDetails['Admin Email'] = wpDetails.adminEmail;
            }

            displaySuccess('Site Created Successfully!', successDetails);

            // Reload Caddy
            await reloadCaddy();

        } catch (error) {
            // Error occurred - start cleanup process
            console.log(chalk.red('\n\n⚠️  Error occurred during site creation. Starting cleanup...\n'));
            logger.error('Site creation failed, starting cleanup', {
                domain,
                primaryKey,
                error: error.message,
                stack: error.stack
            });

            // Update site status to "deleting"
            siteManager.updateSiteStatus(primaryKey, 'deleting');
            logger.info('Site status changed to: deleting', { domain, primaryKey });

            try {
                // Cleanup Step 1: Remove directory if it was created
                if (createdResources.directory && fs.existsSync(sitePath)) {
                    console.log(chalk.yellow('  → Removing site directory...'));
                    fs.rmSync(sitePath, { recursive: true, force: true });
                    logger.info('Site directory removed during cleanup', { path: sitePath });
                }

                // Cleanup Step 2: Remove database if it was created
                if (createdResources.database) {
                    console.log(chalk.yellow('  → Removing database...'));
                    await databaseManager.removeDatabase(primaryKey);
                    logger.info('Database removed during cleanup', { primaryKey });
                }

                // Cleanup Step 3: Remove Caddy config if it was created
                if (createdResources.caddyConfig) {
                    console.log(chalk.yellow('  → Removing Caddy configuration...'));
                    caddyManager.removeConfig(primaryKey, domain);
                    logger.info('Caddy config removed during cleanup', { domain, primaryKey });
                }

                // Cleanup Step 4: Remove site from sites.json
                console.log(chalk.yellow('  → Removing site entry...'));
                siteManager.removeSite(primaryKey);
                logger.info('Site entry removed during cleanup', { primaryKey });

                console.log(chalk.green('\n✓ Cleanup completed successfully\n'));

            } catch (cleanupError) {
                // Cleanup itself failed
                console.log(chalk.red('\n❌ Error during cleanup process\n'));
                logger.error('Cleanup failed', {
                    domain,
                    primaryKey,
                    cleanupError: cleanupError.message,
                    originalError: error.message
                });
                displayError('Cleanup failed', cleanupError);
                console.log(chalk.yellow('\n⚠️  You may need to manually remove:'));
                if (createdResources.directory) {
                    console.log(chalk.yellow(`   - Directory: ${sitePath}`));
                }
                if (createdResources.database) {
                    console.log(chalk.yellow(`   - Database: ${process.env.DB_PREFIX || 'site_'}${primaryKey}`));
                }
                if (createdResources.caddyConfig) {
                    console.log(chalk.yellow(`   - Caddy config: caddy/${primaryKey}.caddy`));
                }
                console.log(chalk.yellow(`   - Site entry in sites.json: ${primaryKey}\n`));
            }

            // Display original error
            displayError('Failed to create site', error);
            throw error;
        }

    } catch (error) {
        // Top-level error (e.g., during prompts or validation)
        displayError('Site creation failed at top level', { error: error.message });
        return;
    }
}
