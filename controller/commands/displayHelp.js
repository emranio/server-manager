import chalk from 'chalk';
import { displayBanner } from './helpers.js';

/**
 * Help Command
 * Displays available commands and their descriptions
 */
export default function displayHelp() {
    displayBanner();
    console.log(chalk.yellow.bold('Available Commands:\n'));

    console.log(chalk.cyan('  node cli.js add'));
    console.log(chalk.gray('    Add a new site (Site, WordPress, or Proxy)\n'));

    console.log(chalk.cyan('  node cli.js remove'));
    console.log(chalk.gray('    Remove an existing site\n'));

    console.log(chalk.cyan('  node cli.js list'));
    console.log(chalk.gray('    List all sites in a table\n'));

    console.log(chalk.cyan('  node cli.js info [domain]'));
    console.log(chalk.gray('    Display detailed information about a site\n'));

    console.log(chalk.cyan('  node cli.js reload-caddy'));
    console.log(chalk.gray('    Reload Caddy server configuration\n'));

    console.log(chalk.cyan('  node cli.js reset-wp-password'));
    console.log(chalk.gray('    Reset WordPress user password by username or email\n'));

    console.log(chalk.cyan('  node cli.js cors'));
    console.log(chalk.gray('    Add or remove CORS headers for any site\n'));

    console.log(chalk.cyan('  node cli.js php'));
    console.log(chalk.gray('    Add or remove PHP support for Site type\n'));

    console.log(chalk.cyan('  node cli.js fix-permissions'));
    console.log(chalk.gray('    Fix common file permission issues (Linux/Ubuntu only)\n'));

    console.log(chalk.cyan('  node cli.js help'));
    console.log(chalk.gray('    Display this help message\n'));
}
