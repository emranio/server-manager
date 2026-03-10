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
                },
                filter: (input) => input.trim()
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
                },
                filter: (input) => input.trim()
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
            // Check if CORS block exists using markers
            const corsBlockPattern = /# \[CORS:START\][\s\S]*?# \[CORS:END\]/;
            
            if (corsBlockPattern.test(config)) {
                // Update existing CORS header within the marked block
                config = config.replace(
                    /(# \[CORS:START\]\n\s*# CORS headers\n\s*)header Access-Control-Allow-Origin [^\n]+/,
                    `$1header Access-Control-Allow-Origin ${corsOrigin}`
                );
                console.log(chalk.green('✓ Updated CORS header'));
            } else {
                // Check for legacy CORS (without markers) and update
                const legacyCorsPattern = /header Access-Control-Allow-Origin .+/;
                if (legacyCorsPattern.test(config)) {
                    config = config.replace(legacyCorsPattern, `header Access-Control-Allow-Origin ${corsOrigin}`);
                    console.log(chalk.green('✓ Updated CORS header (legacy format)'));
                } else {
                    // Add CORS headers block with markers after encode gzip or bind
                    const insertPattern = /(encode gzip[^\n]*\n)/;
                    const corsBlock = `$1
    # [CORS:START]
    # CORS headers
    header Access-Control-Allow-Origin ${corsOrigin}
    header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    header Access-Control-Allow-Headers *
    # [CORS:END]

`;
                    config = config.replace(insertPattern, corsBlock);
                    console.log(chalk.green('✓ Added CORS headers'));
                }
            }

            // Update site data
            siteManager.updateSite(primaryKey, { corsOrigin });
            logger.info('CORS added/updated', { domain, corsOrigin });
        } else {
            // Remove CORS headers using markers
            const corsBlockPattern = /\n?\s*# \[CORS:START\][\s\S]*?# \[CORS:END\]\n*/g;
            config = config.replace(corsBlockPattern, '\n');
            
            // Also remove legacy CORS/preflight blocks (without markers) if they exist
            config = config.replace(/\n?\s*# CORS headers\n(?:\s*header Access-Control-Allow-Origin .+\n)?(?:\s*header Access-Control-Allow-Methods .+\n)?(?:\s*header Access-Control-Allow-Headers .+\n)?\s*(?:# Handle OPTIONS preflight requests\n)?\s*(?:@options\s*\{[\s\S]*?\}\n\s*respond @options 204\n?)?/g, '\n');
            config = config.replace(/\n?\s*# Handle OPTIONS preflight requests\n/g, '\n');
            config = config.replace(/\n?\s*@options\s*\{[\s\S]*?\}\n\s*respond @options 204\n*/g, '\n');
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