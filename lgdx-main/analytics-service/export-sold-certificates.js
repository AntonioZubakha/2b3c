const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const ANALYTICS_SERVICE_URL = 'http://localhost:9200';

async function exportSoldCertificates(date, format = 'csv') {
  try {
    console.log(`🔍 Exporting sold certificates for ${date || 'today'}...\n`);
    
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (format) params.append('format', format);
    
    const response = await axios.get(`${ANALYTICS_SERVICE_URL}/debug/export-sold?${params}`, {
      responseType: format === 'csv' ? 'stream' : 'json'
    });
    
    if (format === 'csv') {
      // Save CSV file
      const filename = `sold_certificates_${date || new Date().toISOString().split('T')[0]}.csv`;
      const filepath = path.join(__dirname, filename);
      
      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);
      
      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`✅ CSV file saved: ${filepath}`);
          resolve(filepath);
        });
        writer.on('error', reject);
      });
      
    } else {
      // Handle JSON response
      const data = response.data.data;
      
      console.log(`📊 Export Results:`);
      console.log(`📅 Date: ${data.date}`);
      console.log(`📊 Total Sold: ${data.totalSold}`);
      console.log(`📊 Price Range: $${data.summary.priceRange.min} - $${data.summary.priceRange.max}`);
      console.log(`📊 Average Price: $${data.summary.priceRange.avg}`);
      console.log(`📊 Median Price: $${data.summary.priceRange.median}`);
      
      console.log(`\n📋 Summary by Shape:`);
      Object.entries(data.summary.byShape)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([shape, count]) => {
          console.log(`   ${shape}: ${count}`);
        });
      
      console.log(`\n📋 Summary by Weight:`);
      Object.entries(data.summary.byWeight)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([weight, count]) => {
          console.log(`   ${weight}: ${count}`);
        });
      
      console.log(`\n📋 Sample Certificates (first 10):`);
      data.certificates.slice(0, 10).forEach((cert, index) => {
        console.log(`   ${index + 1}. ${cert.certificateNumber} - ${cert.category} - $${cert.pricePerCarat}`);
      });
      
      // Save JSON file
      const filename = `sold_certificates_${date || new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(__dirname, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`\n✅ JSON file saved: ${filepath}`);
      
      return filepath;
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    throw error;
  }
}

async function exportBothFormats(date) {
  try {
    console.log('🚀 Exporting sold certificates in both formats...\n');
    console.log('=' .repeat(60));
    
    // Export CSV
    console.log('📊 Exporting CSV format...');
    const csvFile = await exportSoldCertificates(date, 'csv');
    
    console.log('\n' + '=' .repeat(60));
    
    // Export JSON
    console.log('📊 Exporting JSON format...');
    const jsonFile = await exportSoldCertificates(date, 'json');
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ Export complete!');
    console.log(`📁 Files created:`);
    console.log(`   - ${csvFile}`);
    console.log(`   - ${jsonFile}`);
    
  } catch (error) {
    console.error('❌ Export failed:', error.message);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const date = args[0];
  const format = args[1] || 'both';
  
  console.log('🚀 Sold Certificates Export Tool\n');
  
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('❌ Invalid date format. Use YYYY-MM-DD');
    process.exit(1);
  }
  
  try {
    if (format === 'both') {
      await exportBothFormats(date);
    } else if (format === 'csv' || format === 'json') {
      await exportSoldCertificates(date, format);
    } else {
      console.error('❌ Invalid format. Use: csv, json, or both');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

// Show usage if no arguments
if (process.argv.length === 2) {
  console.log('Usage:');
  console.log('  node export-sold-certificates.js [date] [format]');
  console.log('');
  console.log('Examples:');
  console.log('  node export-sold-certificates.js                    # Export today in both formats');
  console.log('  node export-sold-certificates.js 2024-01-15        # Export specific date in both formats');
  console.log('  node export-sold-certificates.js 2024-01-15 csv    # Export specific date as CSV');
  console.log('  node export-sold-certificates.js 2024-01-15 json   # Export specific date as JSON');
  console.log('');
  process.exit(0);
}

main().catch(console.error);
