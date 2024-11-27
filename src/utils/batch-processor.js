import pLimit from "p-limit";

export class BatchProcessor {
    constructor(batchSize, concurrentLimit) {
        this.batchSize = batchSize;
        this.limiter = pLimit(concurrentLimit);
    }

    async process(items, processFn) {
        const results = [];

        for (let i = 0; i < items.length; i += this.batchSize) {
            const batch = items.slice(i, i + this.batchSize);
            const batchResults = await Promise.all(
                batch.map(item => this.limiter(() => processFn(item)))
            );
            results.push(...batchResults);
        }

        return results;
    }
}