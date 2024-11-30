import { join } from 'path';
import { homedir } from 'os';

export const CONFIG = {
    RPC_ENDPOINT: 'https://sleek-evocative-patron.solana-mainnet.quiknode.pro/d7d57105f5e9c5dd541e01e35b87da4f473b71ae/',
    MIN_TOKENS: 50_000_000,
    MAX_TOKENS: 40_000_000_000, // Maximum tokens allowed for eligibility 40B
    KOKO_TOKEN: 'FsA54yL49WKs7rWoGv9sUcbSGWCWV756jTD349e6H2yW',
    BATCH_SIZE: 50,
    MONTHS_REQUIRED: 3,
    OUTPUT_DIR: '.',
    CACHE_DIR: './cache',
    CONCURRENT_LIMIT: 5,
    RETRY_LIMIT: 3,
    RETRY_DELAY: 2000,
    RETRY_OPTIONS: {
        retries: 3,
        minTimeout: 1000,
        maxTimeout: 3000
    }
};