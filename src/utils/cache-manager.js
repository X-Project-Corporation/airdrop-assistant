import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export class CacheManager {
    constructor(cacheDir) {
        this.cacheDir = cacheDir;
        this.cache = new Map();
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            await mkdir(this.cacheDir, { recursive: true });
            const cacheFile = join(this.cacheDir, 'transactions.json');
            const data = await readFile(cacheFile, 'utf8').catch(() => '{}');
            this.cache = new Map(Object.entries(JSON.parse(data)));
        } catch (error) {
            Logger.error('Cache initialization error:', error);
        }

        this.initialized = true;
    }

    async get(key) {
        await this.init();
        return this.cache.get(key);
    }

    async set(key, value) {
        await this.init();
        this.cache.set(key, value);
        this.scheduleWrite();
    }

    scheduleWrite() {
        if (this.writeTimeout) clearTimeout(this.writeTimeout);

        this.writeTimeout = setTimeout(async () => {
            try {
                const cacheFile = join(this.cacheDir, 'transactions.json');
                await writeFile(
                    cacheFile,
                    JSON.stringify(Object.fromEntries(this.cache)),
                    'utf8'
                );
            } catch (error) {
                Logger.error('Cache write error:', error);
            }
        }, 5000); // Write every 5 seconds when changes occur
    }
}