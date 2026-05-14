// Update Proudest Legend API configuration in database
const mongoose = require('mongoose');

// Connect to MongoDB (using Docker network)
async function updateProudestLegendConfig() {
    try {
        console.log('Connecting to MongoDB...');
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('Set MONGODB_URI');
            process.exit(1);
        }
        await mongoose.connect(mongoUri);
        console.log('✅ Connected successfully');

        // Define the schema
        const CompanyApiConfig = mongoose.model('CompanyApiConfig', new mongoose.Schema({
            company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
            isActive: Boolean,
            config: {
                url: String,
                requestType: String,
                headers: mongoose.Schema.Types.Mixed,
                params: mongoose.Schema.Types.Mixed,
                baseBodyPayload: mongoose.Schema.Types.Mixed,
                dataKey: String,
                filter: mongoose.Schema.Types.Mixed
            },
            tokenAuthConfig: mongoose.Schema.Types.Mixed,
            syncStatus: String,
            lastSync: Date,
            lastSyncError: String,
            syncSchedule: mongoose.Schema.Types.Mixed,
            createdAt: Date,
            updatedAt: Date
        }, { collection: 'companyapiconfigs' }));

        // Find Proudest Legend configuration
        console.log('\n🔍 Looking for Proudest Legend configuration...');
        const config = await CompanyApiConfig.findOne({
            'config.url': { $regex: 'etherealdiamond' }
        }).populate('company');

        if (!config) {
            console.log('❌ No Proudest Legend configuration found');

            // Show all configurations
            const allConfigs = await CompanyApiConfig.find({}).populate('company').limit(5);
            console.log('\n📋 Available configurations:');
            allConfigs.forEach(c => {
                console.log(`- ${c.company?.name || 'Unknown'}: ${c.config?.url || 'No URL'}`);
            });

            return;
        }

        console.log(`✅ Found configuration for: ${config.company?.name}`);
        console.log(`Current URL: ${config.config.url}`);

        // Update the URL with correct authentication parameters
        const newUrl = 'https://etherealdiamond.com/webServices/inventory_API.svc/GetInventory?username=JulietS&password=LGDeal57&action_type=all&type=etheral&data_key=data';

        config.config.url = newUrl;
        config.isActive = true;
        config.syncStatus = 'idle';
        config.lastSyncError = null;

        await config.save();
        console.log('✅ Configuration updated successfully!');
        console.log(`New URL: ${newUrl}`);

        // Test the configuration
        console.log('\n🧪 Testing the configuration...');
        const { fetchProudestLegendProducts } = require('../dist/sync-strategies/fetchProudestLegendProducts');

        try {
            const result = await fetchProudestLegendProducts(config, config.company._id, config.company.name);
            console.log(`✅ SUCCESS! Retrieved ${result.products.length} products`);
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

updateProudestLegendConfig();
