import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import logger from '../logger.js';
import siteManager from '../siteManager.js';
import caddyManager from '../caddyManager.js';
import { generatePrimaryKey } from '../utils.js';
import { displayBanner, displaySuccess, displayError, reloadCaddy } from './helpers.js';

/**
 * Manage CORS Command
 * Add or remove CORS headers for any site type
 */
export default async function manageCors() {
    displayBanner();
    console.log(chalk.yellow.bold('Manage CORS Headers\n'));

    try {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'What do you want to do?',
                choices: [
                    { name: 'Add/Update CORS', value: 'add' },
                    { name: 'Remove CORS', value: 'remove' }
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
                }
            },
            {
                type: 'input',
                name: 'corsOrigin',
                message: 'Enter CORS origin (e.g., https://example.com or * for all):',
                default: '*',
                when: (answers) => answers.action === 'add',
                validate: (input) => {
                    if (!input.trim()) {
                        return 'CORS origin is required';
                    }
                    return true;
                }
            }
        ]);

        const { action, domain, corsOrigin } = answers;
        const primaryKey = generatePrimaryKey(domain);

        // Check if site exists
        const site = siteManager.getSite(primaryKey);
        if (!site) {
            displayError('Site not found', { message: `Site with domain ${domain} does not exist` });
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
            // Update or add CORS header
            const corsHeaderPattern = /header Access-Control-Allow-Origin .+/;
            
            if (corsHeaderPattern.test(config)) {
                // Update existing CORS header
                config = config.replace(corsHeaderPattern, `header Access-Control-Allow-Origin ${corsOrigin}`);
                console.log(chalk.green('✓ Updated CORS header'));
            } else {
                // Add CORS headers block after tls internal
                const tlsPattern = /(tls internal\n)/;
                const corsBlock = `    encode gzip

    # CORS headers
    header Access-Control-Allow-Origin ${corsOrigin}
    header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    header Access-Control-Allow-Headers *

    # Handle OPTIONS preflight requests
    @options {
        method OPTIONS
    }
    respond @options 204

`;
                config = config.replace(tlsPattern, `$1${corsBlock}`);
                console.log(chalk.green('✓ Added CORS headers'));
            }

            // Update site data
            siteManager.updateSite(primaryKey, { corsOrigin });
            logger.info('CORS added/updated', { domain, corsOrigin });
        } else {
            // Remove CORS headers
            const corsBlockPattern = /\n?\s*# CORS headers[\s\S]*?respond @options 204\n*/;
            config = config.replace(corsBlockPattern, '\n');
            
            // Also remove standalone header if exists
            config = config.replace(/\s*header Access-Control-Allow-Origin .+\n/g, '');
            config = config.replace(/\s*header Access-Control-Allow-Methods .+\n/g, '');
            config = config.replace(/\s*header Access-Control-Allow-Headers .+\n/g, '');
            
            console.log(chalk.green('✓ Removed CORS headers'));

            // Update site data
            const updatedData = { ...site };
            delete updatedData.corsOrigin;
            siteManager.updateSite(primaryKey, updatedData);
            logger.info('CORS removed', { domain });
        }

        // Write updated config
        fs.writeFileSync(configPath, config, 'utf8');

        displaySuccess(`CORS ${action === 'add' ? 'Added/Updated' : 'Removed'} Successfully!`, {
            'Domain': domain,
            'CORS Origin': action === 'add' ? corsOrigin : 'Removed'
        });

        // Reload Caddy
        await reloadCaddy();

    } catch (error) {
        displayError('Failed to manage CORS', { message: error.message });
        logger.error('CORS management failed', { error: error.message, stack: error.stack });
    }
}
