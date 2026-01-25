import chalk from 'chalk';
import logger from '../logger.js';
import { displayBanner, displaySuccess, displayError, reloadCaddy } from './helpers.js';

/**
 * Reload Caddy Command
 * Reloads Caddy server configuration
 */
export default async function reloadCaddyCommand() {
    displayBanner();
    console.log(chalk.yellow.bold('Reload Caddy Server\n'));

    try {
        console.log(chalk.cyan('Reloading Caddy configuration...\n'));
        await reloadCaddy();

        displaySuccess('Caddy Reloaded Successfully!', {
            'Status': 'Configuration reloaded',
            'Config File': '/opt/homebrew/etc/Caddyfile'
        });

        logger.info('Caddy reloaded via CLI command');
    } catch (error) {
        displayError('Failed to reload Caddy', error);
        logger.error('Caddy reload failed', { error: error.message });
    }
}
