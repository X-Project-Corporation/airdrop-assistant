import { mkdir } from 'fs/promises';
import { CONFIG } from './config.js';
import { SolanaService } from './services/solana-service.js';
import { DiamondHandsAnalyzer } from './analyzers/diamond-hands-analyzer.js';
import { CacheManager } from './utils/cache-manager.js';
import { Logger } from './utils/logger.js';

async function main() {
    try {
        // Ensure output directories exist
        await mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
        await mkdir(CONFIG.CACHE_DIR, { recursive: true });

        // Initialize services
        const cacheManager = new CacheManager(CONFIG.CACHE_DIR);
        const solanaService = new SolanaService(cacheManager);

        // Initialize analyzer with dependencies
        const analyzer = new DiamondHandsAnalyzer(solanaService, cacheManager);

        // Run analysis
        await analyzer.analyze();

    } catch (error) {
        Logger.error('Fatal error:', error);
        process.exit(1);
    }
}

// Error handlers
process.on('unhandledRejection', (error) => {
    Logger.error('Fatal: Unhandled Promise Rejection:', error);
    process.exit(1);
});

process.on('SIGINT', () => {
    Logger.info('\nReceived SIGINT. Cleaning up...');
    process.exit(0);
});

// Start analysis
main();