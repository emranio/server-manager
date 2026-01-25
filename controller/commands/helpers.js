import chalk from 'chalk';
import logger from '../logger.js';
import { executeCommand } from '../utils.js';

/**
 * Display Helper Functions
 * Shared UI utilities for all commands
 */

/**
 * Display a colorful banner
 */
export function displayBanner() {
    console.log(chalk.cyan
        .bold('╔════════════════════════════════════════╗'));
    console.log(chalk.cyan
        .bold('║     Server Site Management Tool        ║'));
    console.log(chalk.cyan
        .bold('╚════════════════════════════════════════╝'));
}

/**
 * Display success message with details
 * @param {string} title - Success title
 * @param {Object} details - Details to display
 */
export function displaySuccess(title, details) {
    console.log(chalk.green.bold(`\n✓ ${title}`));
    console.log(chalk.gray('─'.repeat(50)));

    Object.entries(details).forEach(([key, value]) => {
        const formattedKey = chalk.cyan(key.padEnd(20));
        const formattedValue = chalk.white(value);
        console.log(`${formattedKey}: ${formattedValue}`);
    });

    console.log(chalk.gray('─'.repeat(50)) + '\n');
}

/**
 * Display error message
 * @param {string} message - Error message
 * @param {Error|Object} error - Error object
 */
export function displayError(message, error = null) {
    console.log(chalk.red.bold(`\n✗ ${message}`));
    if (error) {
        console.log(chalk.red(`  ${error.message || error}`));
    }
    console.log();
}

/**
 * Display step progress
 * @param {string|number} stepNumber - Step number
 * @param {string|number} totalSteps - Total steps
 * @param {string} message - Step message
 */
export function displayStep(stepNumber, totalSteps, message) {
    const progress = chalk.yellow(`[${stepNumber}/${totalSteps}]`);
    console.log(`${progress} ${chalk.blue(message)}`);
}

/**
 * Reload Caddy server
 */
export async function reloadCaddy() {
    const reloadCmd = process.env.CADDY_RELOAD_CMD || 'caddy reload';

    try {
        displayStep('Final', 'Final', 'Reloading Caddy server...');
        await executeCommand(`sudo ${reloadCmd}`);
        console.log(chalk.green('   ✓ Caddy reloaded successfully\n'));
        logger.info('Caddy reloaded successfully');
    } catch (error) {
        console.log(chalk.yellow('   ⚠ Could not reload Caddy automatically'));
        console.log(chalk.yellow(`   Please run manually: sudo ${reloadCmd}\n`));
        logger.warning('Caddy reload failed', { error: error.message });
    }
}
