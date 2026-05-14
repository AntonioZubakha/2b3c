// Final configuration update for Proudest Legend API
const mongoose = require('mongoose');

async function updateConfigForProduction() {
    try {
        console.log('🔧 Updating Proudest Legend configuration for production use...');

        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('Set MONGODB_URI');
            process.exit(1);
        }
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Define the schema
        const CompanyApiConfig = mongoose.model('CompanyApiConfig', new mongoose.Schema({
            company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
            isActive: Boolean,
            config: mongoose.Schema.Types.Mixed,
            syncStatus: String,
            lastSync: Date,
            lastSyncError: String
        }, { collection: 'companyapiconfigs' }));

        // Find Proudest Legend configuration
        const config = await CompanyApiConfig.findOne({
            'config.url': { $regex: 'etherealdiamond' }
        }).populate('company');

        if (!config) {
            console.log('❌ No Proudest Legend configuration found');

            // Show available configurations
            const allConfigs = await CompanyApiConfig.find({}).populate('company').limit(5);
            console.log('\n📋 Available configurations:');
            allConfigs.forEach(c => {
                console.log(`- ${c.company?.name || 'Unknown'}: ${c.config?.url || 'No URL'}`);
            });

            return;
        }

        console.log(`✅ Found configuration for: ${config.company?.name}`);
        console.log(`Current URL: ${config.config.url}`);

        // Update with correct authentication URL
        const correctUrl = 'https://etherealdiamond.com/webServices/inventory_API.svc/GetInventory?username=JulietS&password=LGDeal57&action_type=all&type=etheral&data_key=data';

        config.config.url = correctUrl;
        config.isActive = true;
        config.syncStatus = 'idle';
        config.lastSyncError = null;

        await config.save();

        console.log('✅ Configuration updated successfully!');
        console.log(`New URL: ${correctUrl}`);
        console.log('\n🚀 READY FOR PRODUCTION!');
        console.log('The service will now automatically sync 44,000+ products from Proudest Legend');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

updateConfigForProduction();
