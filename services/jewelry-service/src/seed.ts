import mongoose from 'mongoose';
import { Setting } from './models/Setting.js';
import { Jewelry } from './models/Jewelry.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/stonee_jewelry';

// ---------------------------------------------------------------------------
// Settings — mounts/scaffolds used by the bespoke /craft flow.
// Each entry covers a real jewelry category × setting technique combination
// that we have visuals for in /apps/frontend/public/assets.
// ---------------------------------------------------------------------------

const settings = [
  // ------------------------------ RINGS ------------------------------
  {
    sku: 'SET-RING-PRONG-SOL-01',
    name: 'Classic Solitaire Engagement Ring',
    style: 'Solitaire',
    settingType: 'Prong',
    category: 'Ring',
    metal: 'Platinum',
    color: 'White',
    price: 1200,
    compatibleShapes: ['Round', 'Oval', 'Cushion', 'Princess', 'Pear'],
    images: ['/assets/solitaire_engagement_ring_platinum_1776706103840.png']
  },
  {
    sku: 'SET-RING-PRONG-HALO-01',
    name: 'Petite Hidden Halo Ring',
    style: 'Halo',
    settingType: 'Prong',
    category: 'Ring',
    metal: 'Gold18K',
    color: 'Yellow',
    price: 1850,
    compatibleShapes: ['Round', 'Oval', 'Pear', 'Cushion'],
    images: ['/assets/halo_engagement_ring_gold_yellow_1776706171719.png']
  },
  {
    sku: 'SET-RING-PAVE-BRIDAL-01',
    name: 'Diamond Pavé Bridal Set',
    style: 'Pavé',
    settingType: 'Pavé',
    category: 'Ring',
    metal: 'Gold18K',
    color: 'White',
    price: 2100,
    compatibleShapes: ['Round'],
    images: ['/assets/ring_halo.png']
  },
  {
    sku: 'SET-RING-PAVE-INFINITY-01',
    name: 'Eternal Infinity Band',
    style: 'Pavé',
    settingType: 'Pavé',
    category: 'Ring',
    metal: 'Gold18K',
    color: 'Rose',
    price: 1450,
    compatibleShapes: ['Round'],
    images: ['/assets/infinity_band_rose_gold_1776705924364.png']
  },
  {
    sku: 'SET-RING-BEZEL-MODERN-01',
    name: 'Whisper Bezel Solo',
    style: 'Solitaire',
    settingType: 'Bezel',
    category: 'Ring',
    metal: 'Platinum',
    color: 'White',
    price: 1380,
    compatibleShapes: ['Round', 'Oval', 'Cushion', 'Emerald', 'Asscher'],
    images: ['/assets/ring_solitaire.png']
  },
  {
    sku: 'SET-RING-CHANNEL-ETERNITY-01',
    name: 'River of Light Channel Band',
    style: 'Side-stone',
    settingType: 'Channel',
    category: 'Ring',
    metal: 'Platinum',
    color: 'White',
    price: 2350,
    compatibleShapes: ['Princess', 'Emerald', 'Asscher', 'Radiant'],
    images: ['/assets/ring_infinity.png']
  },
  {
    sku: 'SET-RING-INVISIBLE-MONOLITH-01',
    name: 'Atelier Invisible Monolith',
    style: 'Three-stone',
    settingType: 'Invisible',
    category: 'Ring',
    metal: 'Gold18K',
    color: 'White',
    price: 3850,
    compatibleShapes: ['Princess', 'Asscher'],
    images: ['/assets/media__1776867024380.png']
  },

  // ------------------------------ EARRINGS ------------------------------
  {
    sku: 'SET-EAR-PRONG-STUD-01',
    name: 'Whisper Stud Setting',
    style: 'Solitaire',
    settingType: 'Prong',
    category: 'Earrings',
    metal: 'Gold18K',
    color: 'Yellow',
    price: 780,
    compatibleShapes: ['Round', 'Princess', 'Cushion'],
    images: ['/assets/diamond_stud_earrings_gold_1776705736225.png']
  },
  {
    sku: 'SET-EAR-BEZEL-DROP-01',
    name: 'Bezel Drop Earrings',
    style: 'Solitaire',
    settingType: 'Bezel',
    category: 'Earrings',
    metal: 'Platinum',
    color: 'White',
    price: 920,
    compatibleShapes: ['Round', 'Oval', 'Pear', 'Cushion'],
    images: ['/assets/earrings.png']
  },

  // ------------------------------ NECKLACES ------------------------------
  {
    sku: 'SET-NECK-BEZEL-PENDANT-01',
    name: 'Bezel Solitaire Pendant',
    style: 'Solitaire',
    settingType: 'Bezel',
    category: 'Necklace',
    metal: 'Platinum',
    color: 'White',
    price: 880,
    compatibleShapes: ['Round', 'Oval', 'Pear', 'Heart', 'Cushion'],
    images: ['/assets/solitaire_pendant_platinum_1776705664650.png']
  },
  {
    sku: 'SET-NECK-PRONG-PENDANT-01',
    name: 'Floating Prong Pendant',
    style: 'Solitaire',
    settingType: 'Prong',
    category: 'Necklace',
    metal: 'Gold18K',
    color: 'Yellow',
    price: 990,
    compatibleShapes: ['Round', 'Marquise', 'Pear', 'Heart'],
    images: ['/assets/pendant.png']
  },

  // ------------------------------ BRACELETS ------------------------------
  {
    sku: 'SET-BRACE-TENNIS-CLASSIC-01',
    name: 'Classic Tennis Bracelet Mount',
    style: 'Side-stone',
    settingType: 'Tennis',
    category: 'Bracelet',
    metal: 'Gold18K',
    color: 'White',
    price: 4200,
    compatibleShapes: ['Round'],
    images: ['/assets/media__1776705146363.png']
  },
  {
    sku: 'SET-BRACE-CHANNEL-LINE-01',
    name: 'Channel Line Bracelet',
    style: 'Side-stone',
    settingType: 'Channel',
    category: 'Bracelet',
    metal: 'Platinum',
    color: 'White',
    price: 3650,
    compatibleShapes: ['Princess', 'Emerald'],
    images: ['/assets/media__1776705391630.png']
  }
];

// ---------------------------------------------------------------------------
// Ready-to-wear jewelry — used by /collections.
// ---------------------------------------------------------------------------

const jewelry = [
  {
    sku: 'JW-NECK-01',
    title: 'The Eternal Solitaire Pendant',
    description:
      'A breathtaking 1.5ct lab-grown diamond suspended in a minimalist platinum frame. Perfect for daily elegance.',
    collectionName: 'Echoes of Light',
    category: 'Necklace',
    price: 3400,
    metal: 'Platinum',
    color: 'White',
    images: ['/assets/solitaire_pendant_platinum_1776705664650.png']
  },
  {
    sku: 'JW-NECK-02',
    title: 'Whisper Halo Pendant',
    description:
      'A 1.0ct round diamond cradled by a halo of pavé brilliance — every angle catches the light.',
    collectionName: 'Echoes of Light',
    category: 'Necklace',
    price: 2680,
    metal: 'Gold18K',
    color: 'Yellow',
    images: ['/assets/pendant.png']
  },
  {
    sku: 'JW-EAR-01',
    title: 'Starlight Stud Earrings',
    description:
      'Matched 1.0ct Round Brilliant diamonds set in 18K Yellow Gold. A timeless staple for every collection.',
    collectionName: 'Essentials',
    category: 'Earrings',
    price: 2150,
    metal: 'Gold18K',
    color: 'Yellow',
    images: ['/assets/diamond_stud_earrings_gold_1776705736225.png']
  },
  {
    sku: 'JW-EAR-02',
    title: 'Atelier Drop Earrings',
    description:
      'Two oval lab-grown diamonds suspended on platinum threads — gentle movement, quiet brilliance.',
    collectionName: 'Atelier',
    category: 'Earrings',
    price: 1890,
    metal: 'Platinum',
    color: 'White',
    images: ['/assets/earrings.png']
  },
  {
    sku: 'JW-RING-01',
    title: 'Midnight Infinity Band',
    description:
      'Vibrant pavé-set diamonds wrapping around a Rose Gold band. Symbolizing eternal love.',
    collectionName: 'Artisanal',
    category: 'Ring',
    price: 1800,
    metal: 'Gold18K',
    color: 'Rose',
    images: ['/assets/infinity_band_rose_gold_1776705924364.png']
  },
  {
    sku: 'JW-RING-02',
    title: 'Hidden Halo Engagement Ring',
    description:
      '1.25ct round brilliant centered in an 18K yellow gold frame with a hidden halo of micro pavé.',
    collectionName: 'Promesa',
    category: 'Ring',
    price: 4200,
    metal: 'Gold18K',
    color: 'Yellow',
    images: ['/assets/halo_engagement_ring_gold_yellow_1776706171719.png']
  },
  {
    sku: 'JW-RING-03',
    title: 'Classic Solitaire',
    description:
      'A 1.5ct round brilliant in a six-prong platinum mount — the most enduring silhouette in fine jewelry.',
    collectionName: 'Promesa',
    category: 'Ring',
    price: 3950,
    metal: 'Platinum',
    color: 'White',
    images: ['/assets/ring_solitaire.png']
  },
  {
    sku: 'JW-BRACE-01',
    title: 'Riviera Tennis Bracelet',
    description:
      'Forty-two matched round brilliants in a continuous tennis line — quiet, endless brilliance.',
    collectionName: 'Riviera',
    category: 'Bracelet',
    price: 5400,
    metal: 'Gold18K',
    color: 'White',
    images: ['/assets/media__1776705146363.png']
  }
];

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Clearing old data...');
    await Setting.deleteMany({});
    await Jewelry.deleteMany({});

    console.log(`Seeding ${settings.length} settings...`);
    await Setting.insertMany(settings);

    console.log(`Seeding ${jewelry.length} jewelry items...`);
    await Jewelry.insertMany(jewelry);

    console.log('Seed successful!');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
