import httpClient from '../shared/httpClient';
import { logger } from '../shared/logger';
import { sendSyncProgressNotification } from '../shared/telegramBot';
import { assertSafeUrlOrThrow } from '../shared/security';
import { FetchProductsFunction } from '../syncLogic';

const BRAHMANI_API_NAME = 'Brahmani API';

async function retryRequest<T>(
    fn: () => Promise<T>, 
    maxRetries: number = 3, 
    baseDelay: number = 1000
): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            
            if (error.response && error.response.status && 
                (error.response.status === 401 || error.response.status === 403 || error.response.status === 404)) {
                throw error;
            }
            
            if (attempt === maxRetries) {
                throw lastError;
            }
            
            const delay = baseDelay * Math.pow(2, attempt - 1);
            logger.warn(`[retryRequest] Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

export const fetchBrahmaniProducts: FetchProductsFunction = async (companyApiConfigDoc, companyId, companyName) => {
    if (!companyApiConfigDoc.config || !companyApiConfigDoc.config.url) {
        throw new Error(`Invalid API configuration for ${companyName}: missing config or URL`);
    }
    
    const apiUrl = companyApiConfigDoc.config.url;
    assertSafeUrlOrThrow(apiUrl, 'fetchBrahmaniProducts.config.url');
    
    if (!apiUrl || !apiUrl.includes('brahmani.diamx.net/API/StockSearch')) {
        throw new Error(`Invalid Brahmani API URL: ${apiUrl}`);
    }
    
    const requestBody = {
        ...(companyApiConfigDoc.config.baseBodyPayload || {}),
    };

    const requestConfig: any = {
        method: (companyApiConfigDoc.config.requestType || 'post'),
        url: apiUrl,
        headers: companyApiConfigDoc.config.headers || { 'Content-Type': 'application/json' },
        data: requestBody,
        timeout: 600000 // Увеличиваем таймаут до 5 минут
    };
    
    logger.info(`[fetchBrahmaniProducts] Requesting Brahmani API`);
    await sendSyncProgressNotification(companyId, companyName, BRAHMANI_API_NAME, 'Sending request to API...');
    
    try {
        const response = await retryRequest(async () => await httpClient(requestConfig), 3, 2000);
        
        const responseData = response.data as any;

        if (responseData && responseData.ApiStatus === 'Success' && Array.isArray(responseData.StoneList)) {
            logger.info(`[fetchBrahmaniProducts] Successfully retrieved ${responseData.StoneList.length} products from Brahmani API`);
            return { products: responseData.StoneList };
        } else {
            logger.error(`[fetchBrahmaniProducts] Brahmani sync: Full list not available. Aborting further processing.`);
            logger.error(`[fetchBrahmaniProducts] Response structure: ${JSON.stringify(responseData).substring(0, 500)}`);
            throw new Error('Brahmani full list could not be fetched or was empty.');
        }
    } catch (error: any) {
        // Улучшенная обработка ошибок (copied from server)
        if (error.response) {
            const status = error.response.status;
            const responseText = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data);
            
            // Проверяем на ошибки памяти или серверные проблемы
            if (status === 500) {
                if (responseText.includes('Not enough memory resources') || responseText.includes('0x80070008')) {
                    logger.error(`[fetchBrahmaniProducts] Brahmani API experiencing memory issues (500 error). This is a temporary server-side problem.`);
                    throw new Error('Brahmani API is temporarily experiencing memory issues. Please try again later.');
                } else {
                    logger.error(`[fetchBrahmaniProducts] Brahmani API returned 500 error: ${responseText.substring(0, 500)}`);
                    throw new Error(`Brahmani API server error (500): ${error.message}`);
                }
            } else if (status >= 400) {
                logger.error(`[fetchBrahmaniProducts] Brahmani API returned ${status} error: ${responseText.substring(0, 500)}`);
                throw new Error(`Brahmani API error (${status}): ${error.message}`);
            }
        } else if (error.code === 'ECONNABORTED') {
            logger.error(`[fetchBrahmaniProducts] Brahmani API timeout after ${requestConfig.timeout}ms`);
            throw new Error('Brahmani API request timed out. Please try again later.');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            logger.error(`[fetchBrahmaniProducts] Cannot connect to Brahmani API: ${error.message}`);
            throw new Error('Cannot connect to Brahmani API. Please check network connectivity.');
        }
        
        // Если это не известная ошибка, пробрасываем как есть
        logger.error(`[fetchBrahmaniProducts] Unexpected error: ${error.message}`);
        throw error;
    }
}; 