// Count categories (shape+weight+clarity+color) that have exactly 1 product in stock
const db = db.getSiblingDB('lgdx');
const pipeline = [
  {
    $match: {
      status: 'available',
      onDeal: { $ne: true },
      shape: { $exists: true, $ne: null },
      weight: { $exists: true, $ne: null },
      clarity: { $exists: true, $ne: null },
      color: { $exists: true, $ne: null }
    }
  },
  {
    $group: {
      _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' },
      count: { $sum: 1 }
    }
  },
  { $match: { count: 1 } },
  { $count: 'categoriesWithOneProduct' }
];
const result = db.products.aggregate(pipeline).toArray();
print('Categories with exactly 1 product in stock:', result[0] ? result[0].categoriesWithOneProduct : 0);

// Also total categories and breakdown by count
const breakdown = db.products.aggregate([
  { $match: { status: 'available', onDeal: { $ne: true }, shape: { $exists: true }, weight: { $exists: true }, clarity: { $exists: true }, color: { $exists: true } } },
  { $group: { _id: { shape: '$shape', weight: '$weight', clarity: '$clarity', color: '$color' }, count: { $sum: 1 } } },
  { $group: { _id: '$count', numCategories: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]).toArray();
print('\nBreakdown (products per category -> number of such categories):');
breakdown.forEach(function(r) { print('  ' + r._id + ' product(s): ' + r.numCategories + ' categories'); });
