// MongoDB initialization script for LGDX Development
// This script creates the necessary database and user for development environment

// Switch to lgdx_dev database
db = db.getSiblingDB('lgdx_dev');

// Create admin user in lgdx_dev database
db.createUser({
  user: 'admin',
  pwd: 'password',
  roles: [
    { role: 'readWrite', db: 'lgdx_dev' },
    { role: 'dbAdmin', db: 'lgdx_dev' }
  ]
});

// Create some initial collections for development
db.createCollection('users');
db.createCollection('products');
db.createCollection('deals');
db.createCollection('companies');
db.createCollection('carts');

// Create indexes for better performance
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "company": 1 });
db.products.createIndex({ "sku": 1 }, { unique: true, sparse: true });
db.products.createIndex({ "company": 1 });
db.products.createIndex({ "shape": 1, "carat": 1, "color": 1, "clarity": 1 });
db.deals.createIndex({ "buyer": 1 });
db.deals.createIndex({ "seller": 1 });
db.deals.createIndex({ "status": 1 });
db.companies.createIndex({ "name": 1 });

print('MongoDB development initialization completed successfully!');
print('Database: lgdx_dev');
print('User: admin');
print('Password: password');
print('Port: 27019');
print('Indexes created for better performance'); 