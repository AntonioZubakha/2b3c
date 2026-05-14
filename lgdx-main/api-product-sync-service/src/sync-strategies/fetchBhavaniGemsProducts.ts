import httpClient from '../shared/httpClient';
import { logger } from '../shared/logger';
import { sendSyncProgressNotification } from '../shared/telegramBot';
import { assertSafeUrlOrThrow } from '../shared/security';
import { FetchProductsFunction } from '../syncLogic';

const BHAVANI_GEMS_API_NAME = 'Bhavani Gems API';

export const fetchBhavaniGemsProducts: FetchProductsFunction = async (companyApiConfigDoc, companyId, companyName) => {
    if (!companyApiConfigDoc.config || !companyApiConfigDoc.config.url) {
        throw new Error(`Invalid API configuration for ${companyName}: missing config or URL`);
    }
    
    const apiUrl = companyApiConfigDoc.config.url;
    assertSafeUrlOrThrow(apiUrl, 'fetchBhavaniGemsProducts.config.url');
    if (!apiUrl) {
        throw new Error(`Invalid Bhavani Gems API URL`);
    }

    // Try different approaches for Bhavani Gems API
    const apiToken = companyApiConfigDoc.config.params?.APIToken;
    if (!apiToken) {
        throw new Error('APIToken is required for Bhavani Gems API');
    }

    logger.info(`[fetchBhavaniGemsProducts] Attempting to fetch`);
    await sendSyncProgressNotification(companyId, companyName, BHAVANI_GEMS_API_NAME, 'Sending request to API...');

    // Use config URL: POST with token in URL params
    const requestConfig: any = {
        method: 'post',
        url: apiUrl,
        params: { APIToken: apiToken },
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LGDEAL-API-Client/1.0',
            'Accept': 'application/json'
        },
        timeout: 60000
    };
    
    logger.info(`[fetchBhavaniGemsProducts] Sending request`);
    
    try {
        const response = await httpClient(requestConfig);
        logger.info(`[fetchBhavaniGemsProducts] Request successful! Response status: ${response.status}`);
        
        const responseData = response.data as any;
        
        // Handle different response formats
        let products = [];
        if (responseData && Array.isArray(responseData.StoneList)) {
            products = responseData.StoneList;
        } else if (responseData && Array.isArray(responseData)) {
            products = responseData;
        } else if (responseData && responseData.data && Array.isArray(responseData.data)) {
            products = responseData.data;
        } else {
            logger.warn(`[fetchBhavaniGemsProducts] Unexpected response format: ${JSON.stringify(responseData).substring(0, 500)}`);
            throw new Error('Unexpected response format from Bhavani Gems API');
        }
        
        logger.info(`[fetchBhavaniGemsProducts] Successfully retrieved ${products.length} products`);
        return { products };
        
    } catch (error: any) {
        logger.error(`[fetchBhavaniGemsProducts] API request failed: ${error.message}`);
        
        if (error.response) {
            logger.error(`[fetchBhavaniGemsProducts] Response status: ${error.response.status}`);
            logger.error(`[fetchBhavaniGemsProducts] Response data: ${JSON.stringify(error.response.data).substring(0, 300)}`);
        }
        
        throw new Error(`Bhavani Gems API request failed: ${error.message}`);
    }
}; 