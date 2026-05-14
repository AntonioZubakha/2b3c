/**
 * Marketplace configuration
 * Contains settings for the marketplace operation
 */

interface ManagementCompany {
  name: string;
  sellerTransactionFee: number;
  buyerTransactionFee: number;
  minimumFee: number;
}

interface Transactions {
  pendingExpirationTime: number;
  abandonedCancellationDays: number;
}

interface Security {
  standardTransactionLimit: number;
}

interface MarketplaceConfig {
  managementCompany: ManagementCompany;
  transactions: Transactions;
  security: Security;
}

const config: MarketplaceConfig = {
  // LGDeal INC is the management company for all transactions
  managementCompany: {
    name: 'LGDeal INC',
    // Management company's commission percentage (as decimal)
    sellerTransactionFee: 0.04, // 4% fee from seller on each transaction
    buyerTransactionFee: 0.00, // 0% fee from buyer
    // Minimum fee per transaction in USD
    minimumFee: 10
  },
  
  // Transaction settings
  transactions: {
    // Expiration time for pending transactions in hours
    pendingExpirationTime: 48,
    // Automatic cancellation of abandoned transactions (in days)
    abandonedCancellationDays: 7
  },
  
  // Security settings
  security: {
    // Maximum amount for transactions without additional verification
    standardTransactionLimit: 5000
  }
};

export default config; 