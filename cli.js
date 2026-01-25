#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import commands
import addSite from './controller/commands/addSite.js';
import removeSite from './controller/commands/removeSite.js';
import listSites from './controller/commands/listSites.js';
import siteInfo from './controller/commands/siteInfo.js';
import displayHelp from './controller/commands/displayHelp.js';
import reloadCaddyCommand from './controller/commands/reloadCaddy.js';
import resetWpPassword from './controller/commands/resetWpPassword.js';
import manageCors from './controller/commands/manageCors.js';
import managePhp from './controller/commands/managePhp.js';
import fixPermissions from './controller/commands/fixPermissions.js';

// Import logger for error handling
import logger from './controller/logger.js';
import { displayError } from './controller/commands/helpers.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main CLI Function
 * Routes commands to their respective handlers
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Check if .env exists
    if (!fs.existsSync(path.join(__dirname, '.env'))) {
        console.log(chalk.yellow.bold('\n⚠️  Warning: .env file not found!'));
        console.log(chalk.yellow('   Please create a .env file based on .env.example\n'));
    }

    // Route to appropriate command
    switch (command) {
        case 'add':
            await addSite();
            break;

        case 'remove':
            await removeSite();
            break;

        case 'list':
            listSites();
            break;

        case 'info':
            await siteInfo();
            break;

        case 'reload-caddy':
            await reloadCaddyCommand();
            break;

        case 'reset-wp-password':
            await resetWpPassword();
            break;

        case 'cors':
            await manageCors();
            break;

        case 'php':
            await managePhp();
            break;

        case 'fix-permissions':
            await fixPermissions();
            break;

        case 'help':
            displayHelp();
            break;

        default:
            if (!command) {
                displayHelp();
            } else {
                console.log(chalk.red(`\nUnknown command: ${command}\n`));
                displayHelp();
            }
            break;
    }
}

// Run the CLI
main().catch((error) => {
    displayError('An unexpected error occurred', error);
    logger.error('CLI error', { error: error.message, stack: error.stack });
    process.exit(1);
});
