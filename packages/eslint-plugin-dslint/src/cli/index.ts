#!/usr/bin/env node
/**
 * dslint CLI
 *
 * Design System Lint command line interface.
 */
import { Command } from 'commander'
import { runSync } from './sync.js'

const program = new Command()

program
  .name('dslint')
  .description('Design System Lint - Enforce design token compliance')
  .version('0.1.0')

program
  .command('sync')
  .description('Sync CSS variables from globals.css to tailwind.config.ts')
  .option('--css <path>', 'Path to globals.css', 'src/globals.css')
  .option('--config <path>', 'Path to tailwind.config.ts', 'tailwind.config.ts')
  .option('--check', 'Check for inconsistencies without making changes')
  .option('--dry-run', 'Show what would change without making changes')
  .action(async (options) => {
    try {
      const result = await runSync({
        css: options.css,
        config: options.config,
        check: options.check,
        dryRun: options.dryRun,
      })

      if (options.check && !result.success) {
        console.log('\n❌ Check failed - inconsistencies found:\n')

        if (result.added.length > 0) {
          console.log('Missing in config:')
          for (const name of result.added) {
            console.log(`  - ${name}`)
          }
        }

        if (result.removed.length > 0) {
          console.log('\nExtra in config:')
          for (const name of result.removed) {
            console.log(`  - ${name}`)
          }
        }

        if (result.inconsistencies.length > 0) {
          console.log('\nInconsistencies:')
          for (const inc of result.inconsistencies) {
            console.log(
              `  - ${inc.name}: config has "${inc.configValue}", should be "var(${inc.cssValue})"`,
            )
          }
        }

        process.exit(1)
      }

      if (!result.success) {
        process.exit(1)
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`)
      process.exit(1)
    }
  })

program.parse()
