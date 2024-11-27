export async function withRetry(fn, options = CONFIG.RETRY_OPTIONS) {
    let lastError;

    for (let attempt = 1; attempt <= options.retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt < options.retries) {
                const delay = Math.min(
                    options.minTimeout * Math.pow(2, attempt - 1),
                    options.maxTimeout
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}