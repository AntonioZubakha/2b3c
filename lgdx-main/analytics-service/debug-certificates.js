const axios = require('axios');

// Configuration
const ANALYTICS_SERVICE_URL = 'http://localhost:9200';

async function debugCertificates() {
  try {
    console.log('🔍 Starting certificate analysis...\n');
    
    // Get today's certificate analysis
    console.log('📊 Analyzing certificates for today:');
    const todayResponse = await axios.get(`${ANALYTICS_SERVICE_URL}/debug/certificates`);
    
    if (todayResponse.data.success) {
      const data = todayResponse.data.data;
      
      console.log(`📅 Date: ${data.date}`);
      console.log(`📊 Certificate Counts:`);
      console.log(`   - Today in stats: ${data.certificateCounts.todayInStats}`);
      console.log(`   - Yesterday in stats: ${data.certificateCounts.yesterdayInStats}`);
      console.log(`   - Currently active: ${data.certificateCounts.currentlyActive}`);
      console.log(`   - Disappeared from yesterday: ${data.certificateCounts.disappearedFromYesterday}`);
      console.log(`   - Disappeared from today: ${data.certificateCounts.disappearedFromToday}`);
      
      console.log(`\n📊 ProductCategoryStats:`);
      console.log(`   - Today's records: ${data.productCategoryStats.todayRecords}`);
      console.log(`   - Yesterday's records: ${data.productCategoryStats.yesterdayRecords}`);
      console.log(`   - Total disappeared from stats: ${data.productCategoryStats.totalDisappearedFromStats}`);
      
      console.log(`\n📋 Sample Disappeared Certificates:`);
      data.sampleData.disappearedFromYesterday.slice(0, 5).forEach((cert, index) => {
        console.log(`   ${index + 1}. ${cert}`);
      });
      
      console.log(`\n📋 Categories with Disappeared Products:`);
      data.categoriesWithDisappeared.slice(0, 5).forEach((cat, index) => {
        console.log(`   ${index + 1}. ${cat.category} - Disappeared: ${cat.disappeared}`);
      });
      
    } else {
      console.error('❌ Error:', todayResponse.data.error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

async function compareCertificates() {
  try {
    console.log('\n🔍 Comparing certificates between dates...\n');
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const startDate = twoDaysAgo.toISOString().split('T')[0];
    const endDate = yesterday.toISOString().split('T')[0];
    
    console.log(`📅 Comparing ${startDate} to ${endDate}`);
    
    const compareResponse = await axios.get(`${ANALYTICS_SERVICE_URL}/debug/compare`, {
      params: { startDate, endDate }
    });
    
    if (compareResponse.data.success) {
      const data = compareResponse.data.data;
      
      console.log(`📊 Comparison Results:`);
      console.log(`   - Start total: ${data.counts.startTotal}`);
      console.log(`   - End total: ${data.counts.endTotal}`);
      console.log(`   - Added: ${data.counts.added}`);
      console.log(`   - Removed: ${data.counts.removed}`);
      console.log(`   - Common: ${data.counts.common}`);
      
    } else {
      console.error('❌ Error:', compareResponse.data.error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the analysis
async function main() {
  console.log('🚀 Certificate Debug Analysis Tool\n');
  console.log('=' .repeat(50));
  
  await debugCertificates();
  await compareCertificates();
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Analysis complete!');
}

main().catch(console.error);
