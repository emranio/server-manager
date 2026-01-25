import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';
import siteManager from '../siteManager.js';
import { displayBanner } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * List Sites Command
 * Displays all sites in a bordered table format
 */
export default function listSites() {
    displayBanner();
    console.log(chalk.yellow.bold('All Sites\n'));

    const sites = siteManager.listAllSites();
    const siteKeys = Object.keys(sites);

    if (siteKeys.length === 0) {
        console.log(chalk.gray('No sites found.\n'));
        return;
    }

    // Calculate column widths
    const noWidth = 4;
    const domainWidth = Math.max(20, ...siteKeys.map(k => sites[k].domain.length + 2));
    const pathWidth = 40;
    const statusWidth = 15;

    // Draw top border
    console.log(chalk.cyan('┌' + '─'.repeat(noWidth) + '┬' + '─'.repeat(domainWidth) + '┬' + '─'.repeat(pathWidth) + '┬' + '─'.repeat(statusWidth) + '┐'));

    // Draw header
    const headerNo = 'No'.padEnd(noWidth);
    const headerDomain = 'Domain'.padEnd(domainWidth);
    const headerPath = 'Relative Path'.padEnd(pathWidth);
    const headerStatus = 'Status'.padEnd(statusWidth);
    console.log(chalk.cyan('│') + chalk.white.bold(headerNo) + chalk.cyan('│') + chalk.white.bold(headerDomain) + chalk.cyan('│') + chalk.white.bold(headerPath) + chalk.cyan('│') + chalk.white.bold(headerStatus) + chalk.cyan('│'));

    // Draw header separator
    console.log(chalk.cyan('├' + '─'.repeat(noWidth) + '┼' + '─'.repeat(domainWidth) + '┼' + '─'.repeat(pathWidth) + '┼' + '─'.repeat(statusWidth) + '┤'));

    // Draw rows
    siteKeys.forEach((key, index) => {
        const site = sites[key];
        const no = `${index + 1}`.padEnd(noWidth);
        const domain = site.domain.padEnd(domainWidth);

        // Get relative path from www/
        const relativePath = path.relative(path.join(__dirname, '..', '..', 'www'), site.path);
        const pathDisplay = relativePath.length > pathWidth - 2
            ? '...' + relativePath.slice(-(pathWidth - 5))
            : relativePath.padEnd(pathWidth);

        // Get status with color
        const status = site.status || 'published';
        let statusDisplay;
        if (status === 'published') {
            statusDisplay = chalk.green(status.padEnd(statusWidth));
        } else if (status === 'initializing') {
            statusDisplay = chalk.yellow(status.padEnd(statusWidth));
        } else if (status === 'deleting') {
            statusDisplay = chalk.red(status.padEnd(statusWidth));
        } else {
            statusDisplay = chalk.gray(status.padEnd(statusWidth));
        }

        console.log(chalk.cyan('│') + chalk.white(no) + chalk.cyan('│') + chalk.yellow(domain) + chalk.cyan('│') + chalk.gray(pathDisplay) + chalk.cyan('│') + statusDisplay + chalk.cyan('│'));
    });

    // Draw bottom border
    console.log(chalk.cyan('└' + '─'.repeat(noWidth) + '┴' + '─'.repeat(domainWidth) + '┴' + '─'.repeat(pathWidth) + '┴' + '─'.repeat(statusWidth) + '┘'));

    console.log(chalk.gray(`\nTotal: ${siteKeys.length} site(s)`));
    console.log(chalk.gray('Use "node cli.js info <domain>" for detailed information\n'));
}
