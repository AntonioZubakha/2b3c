// One-off: set user 68b577c7587989847ae5cf22 role to 'admin'
// Run from MongoDB container: mongosh "mongodb://..." < scripts/set-user-admin.js
// Or: node scripts/set-user-admin.js (with mongodb package)

const doc = db.users.updateOne(
  { _id: ObjectId('68b577c7587989847ae5cf22') },
  { $set: { role: 'admin' } }
);
print('Matched:', doc.matchedCount, 'Modified:', doc.modifiedCount);
if (doc.modifiedCount === 1) print('User is now admin.');
