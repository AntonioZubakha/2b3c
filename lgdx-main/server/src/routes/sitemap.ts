import express, { Router, Request, Response } from 'express';
import Product from '../models/Product';
import { logger } from '../utils/logger';

const router: Router = express.Router();

// Normalize BASE_URL to canonical form (remove www, ensure https).
// Canonical production host is `lgdeal.com`. Any legacy `lgdeal.net` input is
// rewritten to `lgdeal.com` so that the sitemap always advertises the new
// domain (important for Google Search Console canonicalization during migration).
const normalizeBaseUrl = (url: string): string => {
  const normalized = url.replace(/^https?:\/\/(?:www\.)?/, 'https://');
  if (normalized.includes('lgdeal.com') || normalized.includes('lgdeal.net')) {
    return 'https://lgdeal.com';
  }
  return normalized;
};

const BASE_URL = normalizeBaseUrl(process.env.FRONTEND_BASE_URL || 'https://lgdeal.com');

/**
 * Generate XML sitemap dynamically
 * Includes static pages and top products (limited to 50,000 for performance)
 */
router.get('/sitemap.xml', async (req: Request, res: Response) => {
  try {
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Start building XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
    xml += '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"\n';
    xml += '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n\n';
    
    // Static pages with high priority
    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/catalog', priority: '0.9', changefreq: 'daily' },
      { url: '/market-overview', priority: '0.8', changefreq: 'daily' },
      { url: '/category-stats', priority: '0.7', changefreq: 'daily' },
      { url: '/about-us', priority: '0.6', changefreq: 'monthly' },
      { url: '/for-experts', priority: '0.6', changefreq: 'monthly' },
      { url: '/terms-of-use', priority: '0.3', changefreq: 'yearly' },
      { url: '/privacy-policy', priority: '0.3', changefreq: 'yearly' },
    ];
    
    // Add static pages
    for (const page of staticPages) {
      xml += `  <url>\n`;
      xml += `    <loc>${BASE_URL}${page.url}</loc>\n`;
      xml += `    <lastmod>${currentDate}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      if (page.url === '/') {
        xml += `    <image:image>\n`;
        xml += `      <image:loc>${BASE_URL}/og-image.png</image:loc>\n`;
        xml += `      <image:title>LGDEAL - Global B2B Diamond Marketplace</image:title>\n`;
        xml += `      <image:caption>AI-powered diamond trading platform with 250,000+ global lab-grown diamonds</image:caption>\n`;
        xml += `    </image:image>\n`;
      }
      xml += `    <xhtml:link rel="alternate" hreflang="en" href="${BASE_URL}${page.url}" />\n`;
      xml += `  </url>\n\n`;
    }
    
    // Get top products (limited to 50,000 for performance)
    // Priority: products with market price, recently updated
    const products = await Product.find({
      // Only include products that are likely to be indexed
      $or: [
        { marketPrice: { $exists: true, $ne: null } },
        { updatedAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } // Updated in last 90 days
      ]
    })
      .select('id updatedAt shape carat color clarity')
      .sort({ updatedAt: -1, marketPrice: -1 })
      .limit(50000)
      .lean();
    
    logger.info(`[sitemap] Generating sitemap with ${products.length} products`);
    
    // Add product URLs (catalog page with filters, not individual product pages)
    // Since we don't have individual product detail pages, we'll focus on catalog
    // If you add product detail pages later, you can add them here:
    // for (const product of products) {
    //   xml += `  <url>\n`;
    //   xml += `    <loc>${BASE_URL}/product/${product.id}</loc>\n`;
    //   xml += `    <lastmod>${product.updatedAt ? new Date(product.updatedAt).toISOString().split('T')[0] : currentDate}</lastmod>\n`;
    //   xml += `    <changefreq>weekly</changefreq>\n`;
    //   xml += `    <priority>0.5</priority>\n`;
    //   xml += `  </url>\n\n`;
    // }
    
    xml += '</urlset>\n';
    
    // Set proper content type
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(xml);
    
    logger.info('[sitemap] Sitemap generated successfully');
  } catch (error) {
    logger.error('[sitemap] Error generating sitemap:', error instanceof Error ? error.message : String(error));
    
    // Return minimal sitemap on error
    const fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/catalog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.status(200).send(fallbackXml);
  }
});

export default router;

