import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import logger from '../logger.js';
import siteManager from '../siteManager.js';
import caddyManager from '../caddyManager.js';
import { generatePrimaryKey, parseDomain } from '../utils.js';
import { displayBanner, displaySuccess, displayError, reloadCaddy } from './helpers.js';

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSubdirId(subdir) {
    return subdir.replace(/[^a-zA-Z0-9]/g, '_');
}

function splitMainDomainSection(config) {
    const subdirIndex = config.indexOf('\n    # [SUBDIR:');
    if (subdirIndex === -1) {
        return { mainSection: config, subdirSections: '' };
    }
    return {
        mainSection: config.slice(0, subdirIndex),
        subdirSections: config.slice(subdirIndex)
    };
}

function upsertCorsBlock(section, corsOrigin, indent = '    ', matcherName = 'options') {
    const corsBlock = caddyManager.generateCorsBlock(corsOrigin, indent, matcherName).trimEnd();
    const corsBlockPattern = /\n?[ \t]*# \[CORS:START\][\s\S]*?[ \t]*# \[CORS:END\]\n?/;

    if (corsBlockPattern.test(section)) {
        return section.replace(corsBlockPattern, `\n${corsBlock}\n`);
    }

    const escapedIndent = escapeRegExp(indent);
    const rootPattern = new RegExp(`(\\n${escapedIndent}root \\* [^\\n]+\\n)`);
    const encodePattern = new RegExp(`(\\n${escapedIndent}encode [^\\n]+\\n)`);
    const handlePathPattern = /(\n\s*handle_path [^{]+\{\n)/;
    const bindPattern = /(\n\s*bind 0\.0\.0\.0[^\n]*\n)/;

    if (rootPattern.test(section)) {
        return section.replace(rootPattern, `$1\n${corsBlock}\n`);
    }
    if (encodePattern.test(section)) {
        return section.replace(encodePattern, `$1\n${corsBlock}\n`);
    }
    if (handlePathPattern.test(section)) {
        return section.replace(handlePathPattern, `$1${corsBlock}\n`);
    }
    if (bindPattern.test(section)) {
        return section.replace(bindPattern, `$1\n${corsBlock}\n`);
    }

    throw new Error('Could not find a safe insertion point for the CORS block');
}

function removeCorsBlock(section) {
    return section
        .replace(/\n?[ \t]*# \[CORS:START\][\s\S]*?[ \t]*# \[CORS:END\]\n*/g, '\n')
        .replace(/\n?[ \t]*# CORS headers(?: for all responses)?\n(?:[ \t]*header Access-Control-Allow-Origin .+\n)?(?:[ \t]*header Access-Control-Allow-Methods .+\n)?(?:[ \t]*header Access-Control-Allow-Headers .+\n)?(?:[ \t]*header Access-Control-Max-Age .+\n)?/g, '\n')
        .replace(/\n?[ \t]*# Handle OPTIONS preflight requests(?: \(CORS\))?\n/g, '\n')
        .replace(/\n?[ \t]*@options\s*\{[\s\S]*?\}\n[ \t]*(?:handle @options\s*\{[\s\S]*?respond "" 204\n[ \t]*\}|respond @options 204)\n*/g, '\n')
        .replace(/\n?[ \t]*@options method OPTIONS\n[ \t]*respond @options 204\n*/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

function updateSubdirSection(config, subdir, updater) {
    const escapedSubdir = escapeRegExp(subdir);
    const subdirPattern = new RegExp(`# \\[SUBDIR:${escapedSubdir}:START\\][\\s\\S]*?# \\[SUBDIR:${escapedSubdir}:END\\]`);
    const match = config.match(subdirPattern);

    if (!match) {
        throw new Error(`Subdirectory Caddy block not found for /${subdir}`);
    }

    return config.replace(match[0], updater(match[0]));
}

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
        const parsedDomain = parseDomain(domain);

        if (action === 'add') {
            if (parsedDomain.isSubdir) {
                const subdirId = buildSubdirId(parsedDomain.subdir);
                config = updateSubdirSection(config, parsedDomain.subdir, (subdirBlock) => {
                    return upsertCorsBlock(subdirBlock, corsOrigin, '        ', `subdir_${subdirId}_options`);
                });
                console.log(chalk.green('✓ Added/updated subdirectory CORS handler'));
            } else {
                const { mainSection, subdirSections } = splitMainDomainSection(config);
                config = upsertCorsBlock(mainSection, corsOrigin, '    ', 'options') + subdirSections;
                console.log(chalk.green('✓ Added/updated CORS handler'));
            }

            // Update site data
            siteManager.updateSite(primaryKey, { corsOrigin });
            logger.info('CORS added/updated', { domain, corsOrigin });
        } else {
            if (parsedDomain.isSubdir) {
                config = updateSubdirSection(config, parsedDomain.subdir, removeCorsBlock);
                console.log(chalk.green('✓ Removed subdirectory CORS handler'));
            } else {
                const { mainSection, subdirSections } = splitMainDomainSection(config);
                config = removeCorsBlock(mainSection) + subdirSections;
                console.log(chalk.green('✓ Removed CORS handler'));
            }

            // Update site data
            siteManager.updateSite(primaryKey, { corsOrigin: undefined });
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
