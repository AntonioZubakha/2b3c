// MongoDB initialization script for LGDX (runs once on empty data volume).
// Keep lgdx_admin password in sync with your Swarm/docker-secrets workflow; never log it.
print('Starting MongoDB initialization...');

// Create lgdx_admin user in admin database
db = db.getSiblingDB('admin');

try {
  db.createUser({
    user: 'lgdx_admin',
    pwd: 'bc4a857cc80d6198bb866a003ecf17ba',
    roles: [
      { role: 'readWrite', db: 'lgdx' },
      { role: 'dbAdmin', db: 'lgdx' },
      { role: 'userAdmin', db: 'admin' }
    ]
  });
  print('✅ lgdx_admin user created successfully');
} catch (error) {
  print('⚠️ lgdx_admin user already exists or error: ' + error.message);
}

// Switch to lgdx database
db = db.getSiblingDB('lgdx');

// Create collections
db.createCollection('users');
db.createCollection('products');
db.createCollection('deals');
db.createCollection('companies');
db.createCollection('carts');

print('✅ Collections created successfully');
print('MongoDB initialization completed successfully!');
print('Database: lgdx');
print('Users: admin, lgdx_admin');