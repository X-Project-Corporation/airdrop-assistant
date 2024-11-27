import chalk from 'chalk';
import figlet from 'figlet';
import gradient from 'gradient-string';
import { promisify } from 'util';

const figletPromise = promisify(figlet);

export class Logger {
    static async showWelcome() {
        console.clear();
        const title = await figletPromise('KOKO Analysis');
        console.log(gradient.pastel.multiline(title));
        console.log('\n' + chalk.dim('━'.repeat(process.stdout.columns)));
        console.log(chalk.cyan('\n💎 Diamond Hands Analysis Tool v2.0\n'));
    }

    static success(message) {
        console.log(chalk.green(`✅ ${message}`));
    }

    static error(message, error) {
        console.error(chalk.red(`❌ ${message}`), error);
    }

    static info(message) {
        console.log(chalk.blue(`ℹ️ ${message}`));
    }

    static progress(current, total, label) {
        const percentage = Math.round((current / total) * 100);
        console.log(chalk.cyan(`${label}: ${percentage}% (${current}/${total})`));
    }
}