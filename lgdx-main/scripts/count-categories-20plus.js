// Count categories with 20+ products in stock
const db = db.getSiblingDB('lgdx');
const total = db.products.aggregate([
  { $match: { status: 'available', onDeal: { $ne: true }, shape: { $exists: true }, weight: { $exists: true }, clarity: { $exists: true }, color: { $exists: true } } },
  { $group: { _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' }, count: { $sum: 1 } } },
  { $match: { count: { $gte: 20 } } },
  { $count: 'categories' }
]).toArray();
print('Categories with 20+ products:', total[0] ? total[0].categories : 0);
