// Create a sync task for Proudest Legend API
const mongoose = require('mongoose');
const amqp = require('amqplib');

// Connect to MongoDB and create a sync task
async function createSyncTask() {
    try {
        console.log('🔄 Creating sync task for Proudest Legend...');

        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error('Set MONGODB_URI');
            process.exit(1);
        }
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');

        // Find Proudest Legend configuration
        const CompanyApiConfig = mongoose.model('CompanyApiConfig', new mongoose.Schema({
            company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
            isActive: Boolean,
            config: mongoose.Schema.Types.Mixed,
            syncStatus: String
        }, { collection: 'companyapiconfigs' }));

        const config = await CompanyApiConfig.findOne({
            'config.url': { $regex: 'etherealdiamond' }
        }).populate('company');

        if (!config) {
            console.log('❌ No Proudest Legend configuration found');
            return;
        }

        console.log(`✅ Found configuration for: ${config.company?.name}`);
        console.log(`Current status: ${config.syncStatus}`);

        if (config.syncStatus === 'in_progress') {
            console.log('⚠️ Sync already in progress, skipping');
            return;
        }

        // Connect to RabbitMQ
        const connection = await amqp.connect('amqp://lgdx:password@rabbitmq:5672');
        const channel = await connection.createChannel();

        // Create queue if it doesn't exist
        await channel.assertQueue('api_sync_tasks', { durable: true });

        // Send sync task
        const task = {
            configId: config._id.toString(),
            companyId: config.company._id.toString(),
            companyName: config.company.name
        };

        await channel.sendToQueue('api_sync_tasks', Buffer.from(JSON.stringify(task)), {
            persistent: true
        });

        console.log('✅ Sync task sent to queue!');
        console.log(`Task: ${JSON.stringify(task, null, 2)}`);

        await channel.close();
        await connection.close();

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

createSyncTask();
