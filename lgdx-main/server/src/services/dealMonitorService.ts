import cron from 'node-cron';
import Deal from '../models/Deal';
import { sendDealEventNotification } from '../utils/telegramBot';
import { IDeal, IProduct, ICompany } from '../types';
import { logger } from '../utils/logger';

const CHECK_INTERVAL_HOURS = 3;
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';

const escapeMarkdownV2 = (text: string) => {
    if (!text) return '';
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
};

/**
 * Checks for deals that are pending for more than CHECK_INTERVAL_HOURS
 * and sends a Telegram notification if no supplier has confirmed any product.
 */
export const checkPendingDealsAndNotify = async (): Promise<void> => {
  logger.info('[DealMonitorService] Running check for pending deals...');
  const threeHoursAgo = new Date(Date.now() - CHECK_INTERVAL_HOURS * 60 * 60 * 1000);

  try {
    const pendingDeals = await Deal.find({
      createdAt: { $lte: threeHoursAgo },
      stage: 'request',
      status: 'pending',
      notificationSentForPendingProducts: false,
      dealType: 'buyer-to-lgdeal'
    }).populate<{ products: { product: IProduct }[], pairedDealIds: IDeal[] }>([
        {
            path: 'products.product',
            select: 'shape carat color clarity'
        },
        {
            path: 'pairedDealIds',
            match: { status: 'pending' },
            select: 'sellerCompanyId dealNumber status',
            populate: {
                path: 'sellerCompanyId',
                select: 'name details.phone details.website'
            }
        }
    ]).limit(10);

    const now = new Date();
    logger.info(`[DealMonitorService] Found ${pendingDeals.length} deals to check. Current time: ${now.toISOString()}. Checking for deals created before: ${threeHoursAgo.toISOString()}`);

    for (const deal of pendingDeals) {
      logger.debug(`[DealMonitorService] --> Processing deal ${deal.dealNumber}, created at: ${deal.createdAt.toISOString()}`);
      const unconfirmedSuppliers = deal.pairedDealIds;

      if (unconfirmedSuppliers.length === 0) {
        logger.debug(`[DealMonitorService] No unconfirmed suppliers for deal ${deal.dealNumber}. Skipping notification.`);
        await Deal.updateOne({ _id: deal._id }, { notificationSentForPendingProducts: true });
        continue;
      }

      const mainProduct = deal.products[0]?.product as IProduct;
      const mainProductInfo = mainProduct
        ? `${mainProduct.shape || ''} ${mainProduct.carat || 'N/A'}ct ${mainProduct.color || 'N/A'}/${mainProduct.clarity || 'N/A'}`
        : 'N/A';

      const supplierInfoText = unconfirmedSuppliers
        .map(pd => {
          const company = pd.sellerCompanyId as ICompany;
          if (!company || !company.name) return null;
          
          const contacts = [company.details?.phone, company.details?.website].filter(Boolean).join(', ');
          return `\\- *${escapeMarkdownV2(company.name)}* \\(${escapeMarkdownV2(contacts || 'no contact info')}\\)`;
        })
        .filter(Boolean)
        .join('\\n');
        
      if (!supplierInfoText) {
          logger.debug(`[DealMonitorService] Could not resolve supplier info for deal ${deal.dealNumber}. Skipping.`);
          continue;
      }

      const dealLink = `${FRONTEND_BASE_URL}/deal/${deal._id}`;
      const message = `
*Overdue Deal Alert*

A deal has been pending for over 3 hours without supplier confirmation\\.

*Deal*: [${deal.dealNumber}](${dealLink})
*Main Product*: ${escapeMarkdownV2(mainProductInfo)}

*Suppliers to contact*:
${supplierInfoText}

Please follow up with the suppliers to confirm product availability\\.
      `;

      logger.info(`[DealMonitorService] Sending notification for deal: ${deal.dealNumber}`);
      await sendDealEventNotification(message.trim());

      await Deal.updateOne({ _id: deal._id }, { notificationSentForPendingProducts: true });
    }
  } catch (error) {
    logger.error('[DealMonitorService] Error checking pending deals:', { error });
  }
};

/**
 * Initializes a cron job to check for pending deals every 30 minutes.
 */
export const initDealMonitorCron = (): void => {
  cron.schedule('*/30 * * * *', checkPendingDealsAndNotify);
  logger.info('[DealMonitorService] Cron job initialized to check pending deals every 30 minutes.');
}; 