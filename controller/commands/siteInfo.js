import inquirer from 'inquirer';
import chalk from 'chalk';
import logger from '../logger.js';
import siteManager from '../siteManager.js';
import { generatePrimaryKey } from '../utils.js';
import { displayBanner, displayError } from './helpers.js';

/**
 * Site Info Command
 * Displays detailed information about a specific site
 */
export default async function siteInfo() {
    displayBanner();
    console.log(chalk.yellow.bold('Site Information\n'));

    try {
        // Get domain from command line or prompt
        let domain = process.argv[3];

        if (!domain) {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'domain',
                    message: 'Enter domain name:',
                    validate: (input) => {
                        if (!input.trim()) {
                            return 'Domain name is required';
                        }
                        return true;
                    },
                    filter: (input) => input.trim()
                }
            ]);
            domain = answers.domain;
        }

        const primaryKey = generatePrimaryKey(domain);
        const site = siteManager.getSite(primaryKey);

        if (!site) {
            displayError('Site not found', { message: `No site found with domain ${domain}` });
            return;
        }

        // Display site information
        console.log(chalk.green.bold('✓ Site Details'));
        console.log(chalk.gray('─'.repeat(50)));

        // Get status display with color
        const status = site.status || 'published';
        let statusDisplay;
        if (status === 'published') {
            statusDisplay = chalk.green(status);
        } else if (status === 'initializing') {
            statusDisplay = chalk.yellow(status);
        } else if (status === 'deleting') {
            statusDisplay = chalk.red(status);
        } else {
            statusDisplay = chalk.gray(status);
        }

        const details = {
            'Domain': site.domain,
            'Type': site.type === 'site' ? 'Site' : (site.type === 'react' ? 'Static React Site' : (site.type === 'wp' ? 'WordPress' : 'Proxy')),
            'Status': statusDisplay,
            'Primary Key': site.primaryKey,
            'Full Path': site.path,
            'Caddy Config': site.caddyConfig,
            'Created At': new Date(site.createdAt).toLocaleString(),
            'Updated At': new Date(site.updatedAt).toLocaleString()
        };

        if (site.isSubdirectory) {
            details['Is Subdirectory'] = chalk.yellow('Yes');
            details['Parent Domain'] = site.parentDomain;
            details['Subdirectory Path'] = site.subdirectory;
        }

        if ((site.type === 'site' || site.type === 'react') && site.enablePhp !== undefined) {
            details['PHP Support'] = site.enablePhp ? chalk.green('Enabled') : chalk.gray('Disabled');
        }

        if (site.type === 'proxy' && site.proxyAddress) {
            details['Proxy Address'] = site.proxyAddress;
        }

        if (site.corsOrigin) {
            details['CORS Origin'] = site.corsOrigin;
        }

        if (site.database) {
            details['Database'] = site.database;
        }

        if (site.type === 'wp' && site.wordpress) {
            console.log();
            Object.entries(details).forEach(([key, value]) => {
                console.log(`${chalk.cyan(key.padEnd(20))}: ${chalk.white(value)}`);
            });

            console.log();
            console.log(chalk.green.bold('✓ WordPress Details'));
            console.log(chalk.gray('─'.repeat(50)));

            const wpDetails = {
                'Site URL': site.wordpress.url,
                'Admin URL': site.wordpress.adminUrl,
                'Admin User': site.wordpress.adminUser,
                'Admin Email': site.wordpress.adminEmail
            };

            Object.entries(wpDetails).forEach(([key, value]) => {
                console.log(`${chalk.cyan(key.padEnd(20))}: ${chalk.white(value)}`);
            });
        } else {
            Object.entries(details).forEach(([key, value]) => {
                console.log(`${chalk.cyan(key.padEnd(20))}: ${chalk.white(value)}`);
            });
        }

        console.log();

    } catch (error) {
        displayError('Failed to retrieve site information', error);
        logger.error('Site info retrieval failed', { error: error.message });
    }
}
