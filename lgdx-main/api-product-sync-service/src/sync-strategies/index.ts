import { ICompanyApiConfig } from '../models/CompanyApiConfig';
import { FetchProductsFunction } from '../syncLogic';
import { fetchBrahmaniProducts } from './fetchBrahmaniProducts';
import { fetchBhavaniGemsProducts } from './fetchBhavaniGemsProducts';
import { fetchExcellentCorporationProducts } from './fetchExcellentCorporationProducts';
import { fetchGenericProducts } from './fetchGenericProducts';
import { fetchProudestLegendProducts } from './fetchProudestLegendProducts';
import { fetchPureLightDiamondProducts } from './fetchPureLightDiamondProducts';
/**
 * Selects the appropriate product fetching strategy based on the API configuration.
 * It identifies specific APIs by their unique URL segments.
 *
 * @param companyApiConfig - The API configuration for the company.
 * @returns The corresponding FetchProductsFunction for the identified API provider.
 */
export const selectFetchProductsStrategy = (companyApiConfig: ICompanyApiConfig): FetchProductsFunction => {
    if (!companyApiConfig || !companyApiConfig.config || !companyApiConfig.config.url) {
        return fetchGenericProducts;
    }

    const apiUrl = companyApiConfig.config.url;

    if (apiUrl.includes('brahmani.diamx.net/API/StockSearch')) {
        return fetchBrahmaniProducts;
    }
    if (apiUrl.includes('excellent.kodllin.com/apis/api/getStockN')) {
        return fetchExcellentCorporationProducts;
    }
    if (apiUrl.includes('heer.diamx.net/API/StockSearch')) {
        return fetchBhavaniGemsProducts;
    }
    if (apiUrl.includes('etherealdiamond.com/webServices/inventory_API.svc/GetInventory')) {
        return fetchProudestLegendProducts;
    }
    if (apiUrl.includes('onlineapi.pldiam.com/api/v1/inventory/fetch-live-stock')) {
        return fetchPureLightDiamondProducts;
    }
    // Default to the generic strategy if no specific provider is matched
    return fetchGenericProducts;
}; 