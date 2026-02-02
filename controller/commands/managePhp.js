import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import dotenv from 'dotenv';
import logger from '../logger.js';
import siteManager from '../siteManager.js';
import caddyManager from '../caddyManager.js';
import { generatePrimaryKey } from '../utils.js';
import { displayBanner, displaySuccess, displayError, reloadCaddy } from './helpers.js';

dotenv.config();

/**
 * Manage PHP Command
 * Add or remove PHP support for site type
 */
export default async function managePhp() {
    displayBanner();
    console.log(chalk.yellow.bold('Manage PHP Support\n'));

    try {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What do you want to do?',
                choices: [
                    { name: 'Add PHP Support', value: 'add' },
                    { name: 'Remove PHP Support', value: 'remove' }
                ]
            },
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

        const { action, domain } = answers;
        const primaryKey = generatePrimaryKey(domain);

        // Check if site exists
        const site = siteManager.getSite(primaryKey);
        if (!site) {
            displayError('Site not found', { message: `Site with domain ${domain} does not exist` });
            return;
        }

        // Check if site is of type 'site' or 'react'
        if (site.type !== 'site' && site.type !== 'react') {
            displayError('Invalid site type', { 
                message: `PHP management is only available for 'Site' or 'Static React Site' types. This site is type: ${site.type}` 
            });
            return;
        }

        // Get the Caddy config file path
        const configPath = site.caddyConfig;
        
        if (!fs.existsSync(configPath)) {
            displayError('Config file not found', { message: `Caddy config file not found: ${configPath}` });
            return;
        }

        // Read the config file
        let config = fs.readFileSync(configPath, 'utf8');

        if (action === 'add') {
            // Check if PHP is already enabled (check for markers or legacy format)
            if (config.includes('# [PHP:START]') || config.includes('php_fastcgi')) {
                displayError('PHP already enabled', { message: 'PHP support is already enabled for this site' });
                return;
            }

            // Add PHP-FPM support with markers before file_server or encode gzip
            const phpFastcgiPath = process.env.PHP_FASTCGI_PATH || 'unix//run/php/php8.2-fpm.sock';
            const phpBlock = `
    # [PHP:START]
    # PHP-FPM support
    php_fastcgi ${phpFastcgiPath}
    # [PHP:END]
`;
            // Try to insert before "# File server" or "# Enable compression"
            if (config.includes('# File server')) {
                config = config.replace(/(\n\s*# File server)/i, `${phpBlock}$1`);
            } else if (config.includes('# Enable compression')) {
                config = config.replace(/(\n\s*# Enable compression)/i, `${phpBlock}$1`);
            } else {
                // Fallback: insert before file_server directive
                config = config.replace(/(\n\s*file_server)/i, `${phpBlock}$1`);
            }
            
            // Update site data
            siteManager.updateSite(primaryKey, { enablePhp: true });
            logger.info('PHP support added', { domain });
            
            console.log(chalk.green('✓ PHP support added'));
        } else {
            // Remove PHP-FPM support - try markers first, then legacy format
            const phpBlockMarkerPattern = /\n?\s*# \[PHP:START\][\s\S]*?# \[PHP:END\]\n*/g;
            const phpBlockLegacyPattern = /\n?\s*# PHP-FPM support[\s\S]*?php_fastcgi [^\n]+\n*/g;
            
            if (!phpBlockMarkerPattern.test(config) && !phpBlockLegacyPattern.test(config)) {
                displayError('PHP not enabled', { message: 'PHP support is not enabled for this site' });
                return;
            }
            
            // Remove both marker-based and legacy PHP blocks
            config = config.replace(phpBlockMarkerPattern, '\n');
            config = config.replace(phpBlockLegacyPattern, '\n');
            
            // Update site data
            siteManager.updateSite(primaryKey, { enablePhp: false });
            logger.info('PHP support removed', { domain });
            
            console.log(chalk.green('✓ PHP support removed'));
        }

        // Write updated config
        fs.writeFileSync(configPath, config, 'utf8');

        displaySuccess(`PHP Support ${action === 'add' ? 'Added' : 'Removed'} Successfully!`, {
            'Domain': domain,
            'PHP Support': action === 'add' ? chalk.green('Enabled') : chalk.gray('Disabled')
        });

        // Reload Caddy
        await reloadCaddy();

    } catch (error) {
        displayError('Failed to manage PHP', { message: error.message });
        logger.error('PHP management failed', { error: error.message, stack: error.stack });
    }
}
