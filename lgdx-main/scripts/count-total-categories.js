const db = db.getSiblingDB('lgdx');
const r = db.products.aggregate([
  { $match: { status: 'available', onDeal: { $ne: true }, shape: { $exists: true }, weight: { $exists: true }, clarity: { $exists: true }, color: { $exists: true } } },
  { $group: { _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' } } },
  { $count: 'total' }
]).toArray();
print('Total categories (with at least 1 product in stock):', r[0] ? r[0].total : 0);
