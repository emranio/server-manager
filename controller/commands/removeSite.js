import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import logger from '../logger.js';
import siteManager from '../siteManager.js';
import caddyManager from '../caddyManager.js';
import databaseManager from '../databaseManager.js';
import { generatePrimaryKey, executeCommand } from '../utils.js';
import { displayBanner, displaySuccess, displayError, displayStep, reloadCaddy } from './helpers.js';

/**
 * Remove Site Command
 * Removes an existing site with all associated files and database
 */
export default async function removeSite() {
    displayBanner();
    console.log(chalk.yellow.bold('Remove Site\n'));

    try {
        // Prompt for domain
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'domain',
                message: 'Enter domain name to remove (without https://):',
                validate: (input) => {
                    if (!input.trim()) {
                        return 'Domain name is required';
                    }
                    return true;
                },
                filter: (input) => input.trim()
            },
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Are you sure you want to remove this site? This action cannot be undone.',
                default: false
            }
        ]);

        if (!answers.confirm) {
            console.log(chalk.yellow('\nOperation cancelled.\n'));
            return;
        }

        const { domain } = answers;
        const primaryKey = generatePrimaryKey(domain);

        // Check if site exists
        const site = siteManager.getSite(primaryKey);
        if (!site) {
            displayError('Site not found', { message: `No site found with domain ${domain}` });
            logger.error('Site removal failed: Site not found', { domain, primaryKey });
            return;
        }

        console.log(chalk.magenta('\nStarting site removal process...\n'));

        let stepNum = 1;
        const totalSteps = site.type === 'wp' ? 4 : 3;

        // Step 1: Remove Caddy config
        displayStep(stepNum++, totalSteps, 'Removing Caddy configuration...');
        caddyManager.removeConfig(primaryKey, domain);
        logger.info('Caddy config removed', { domain, primaryKey });

        // Step 2: Remove database (if WordPress)
        if (site.type === 'wp' && site.database) {
            displayStep(stepNum++, totalSteps, 'Removing database...');
            await databaseManager.removeDatabase(primaryKey);
            logger.info('Database removed', { domain, database: site.database });
        }

        // Step 3: Remove site directory
        displayStep(stepNum++, totalSteps, 'Removing site directory...');
        // site.path points to .../public, so remove parent directory to get everything
        const siteRootPath = path.dirname(site.path);
        if (fs.existsSync(siteRootPath)) {
            await executeCommand(`rm -rf "${siteRootPath}"`);
        }
        logger.info('Site directory removed', { domain, path: siteRootPath });

        // Step 4: Remove from sites.json
        displayStep(stepNum++, totalSteps, 'Removing site information...');
        siteManager.removeSite(primaryKey);
        logger.success('Site removed successfully', { domain, primaryKey });

        // Display success
        displaySuccess('Site Removed Successfully!', {
            'Domain': domain,
            'Primary Key': primaryKey,
            'Type': site.type === 'site' ? 'Site' : (site.type === 'wp' ? 'WordPress' : 'Proxy')
        });

        // Reload Caddy
        await reloadCaddy();

    } catch (error) {
        displayError('Failed to remove site', error);
        logger.error('Site removal failed', { error: error.message });
    }
}
