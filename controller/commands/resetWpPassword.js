import inquirer from 'inquirer';
import chalk from 'chalk';
import logger from '../logger.js';
import siteManager from '../siteManager.js';
import { generatePrimaryKey, generatePassword } from '../utils.js';
import { executeCommand } from '../utils.js';
import { displayBanner, displaySuccess, displayError } from './helpers.js';

/**
 * Reset WordPress Password Command
 * Resets WordPress user password for a given domain
 */
export default async function resetWpPassword() {
    displayBanner();
    console.log(chalk.yellow.bold('Reset WordPress Password\n'));

    try {
        // Prompt for domain
        const domainAnswer = await inquirer.prompt([
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

        const domain = domainAnswer.domain;
        const primaryKey = generatePrimaryKey(domain);
        const site = siteManager.getSite(primaryKey);

        // Check if site exists
        if (!site) {
            displayError('Site not found', { message: `No site found with domain ${domain}` });
            logger.error('Reset password failed: Site not found', { domain });
            return;
        }

        // Check if it's a WordPress site
        if (site.type !== 'wp') {
            displayError('Not a WordPress site', { message: `${domain} is not a WordPress site` });
            logger.error('Reset password failed: Not a WordPress site', { domain, type: site.type });
            return;
        }

        // Prompt for username or email
        const userAnswer = await inquirer.prompt([
            {
                type: 'input',
                name: 'userIdentifier',
                message: 'Enter username or email:',
                validate: (input) => {
                    if (!input.trim()) {
                        return 'Username or email is required';
                    }
                    return true;
                },
                filter: (input) => input.trim()
            }
        ]);

        const userIdentifier = userAnswer.userIdentifier;

        // Confirm action
        const confirmAnswer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Are you sure you want to reset password for user "${userIdentifier}" on ${domain}?`,
                default: false
            }
        ]);

        if (!confirmAnswer.confirm) {
            console.log(chalk.yellow('\nPassword reset cancelled.\n'));
            return;
        }

        console.log(chalk.cyan('\nResetting password...\n'));

        // Generate new password
        const newPassword = generatePassword(16);

        // Reset password using WP-CLI
        const resetCommand = `php -d memory_limit=5G $(which wp) user update "${userIdentifier}" --user_pass="${newPassword}" --path="${site.path}"`;

        try {
            await executeCommand(resetCommand);

            // Update WordPress details in site data if it's the admin user
            if (site.wordpress && site.wordpress.adminUser === userIdentifier) {
                const updatedWordpress = {
                    ...site.wordpress,
                    adminPassword: newPassword
                };
                siteManager.updateSite(primaryKey, { wordpress: updatedWordpress });
            }

            logger.success('WordPress password reset successfully', { domain, user: userIdentifier });

            // Display success information
            displaySuccess('Password Reset Successfully!', {
                'Domain': domain,
                'User': userIdentifier,
                'New Password': newPassword,
                'Site Path': site.path
            });

            console.log(chalk.cyan('\n💡 Tip: Save this password securely. It won\'t be shown again.\n'));

        } catch (error) {
            if (error.message.includes('Invalid user ID, email or login')) {
                displayError('User not found', { message: `User "${userIdentifier}" not found in ${domain}` });
                logger.error('Reset password failed: User not found', { domain, user: userIdentifier });
            } else {
                throw error;
            }
        }

    } catch (error) {
        displayError('Failed to reset password', error);
        logger.error('Password reset failed', { error: error.message });
    }
}
