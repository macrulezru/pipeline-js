import { getRestClient } from './rest-client';
export class RequestExecutor {
    constructor(httpConfig) {
        this.client = getRestClient(httpConfig);
    }
    /**
     * Выполнение одного запроса с поддержкой retry и таймаута
     */
    async execute(command, reqConfig, retryCount = 0, timeoutMs = 10000) {
        let attempt = 0;
        let lastError = null;
        while (attempt <= retryCount) {
            try {
                const result = await Promise.race([
                    this.client.request(command, reqConfig),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
                ]);
                return result;
            }
            catch (err) {
                lastError = err;
                attempt++;
                if (attempt > retryCount)
                    throw lastError;
            }
        }
        throw lastError;
    }
}
