import chalk from 'chalk';
import { executeCommand } from '../utils.js';
import { displayBanner, displaySuccess, displayError } from './helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fix Permissions Command
 * Runs the permission fix script to resolve common permission issues
 */
export default async function fixPermissions() {
    displayBanner();
    console.log(chalk.yellow.bold('Fix File Permissions\n'));
    
    console.log(chalk.gray('This will fix common permission issues on your Linux/Ubuntu server.'));
    console.log(chalk.gray('The script will:'));
    console.log(chalk.gray('  • Set correct ownership for web directories (www-data)'));
    console.log(chalk.gray('  • Fix Caddy configuration permissions'));
    console.log(chalk.gray('  • Fix logs directory permissions'));
    console.log(chalk.gray('  • Verify PHP-FPM socket access\n'));

    try {
        // Get the path to the fix-permissions.sh script
        const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'fix-permissions.sh');
        
        console.log(chalk.blue('Running permission fix script...\n'));
        
        // Execute the script
        const result = await executeCommand(`bash "${scriptPath}"`);
        
        console.log(result);
        
        displaySuccess('Permission fix completed!', {
            'Documentation': 'See PERMISSION-FIX.md for detailed information',
            'Script Location': 'scripts/fix-permissions.sh',
            'Logs': 'Check logs/operations.log if issues persist'
        });
        
    } catch (error) {
        displayError('Failed to fix permissions', error);
        console.log(chalk.yellow('\nYou can manually run the script:'));
        console.log(chalk.blue('  bash scripts/fix-permissions.sh\n'));
        console.log(chalk.yellow('Or see PERMISSION-FIX.md for manual fixes.'));
    }
}
