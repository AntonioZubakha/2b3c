/** Соответствует сиду jewelry-service (seed.ts). */
export const catalog = {
  jewelryCategory: {
    Ring: 'Кольцо',
    Earrings: 'Серьги',
    Necklace: 'Колье',
    Bracelet: 'Браслет',
  },
  metal: {
    Gold14K: 'Золото 585 пробы',
    Gold18K: 'Золото 750 пробы',
    Platinum: 'Платина',
  },
  metalColor: {
    Yellow: 'жёлтый',
    White: 'белый',
    Rose: 'розовый',
  },
  settingStyle: {
    Solitaire: 'Солитер',
    Halo: 'Ореол',
    Pavé: 'Паве',
    'Side-stone': 'С боковыми камнями',
    'Three-stone': 'Три камня',
  },
  diamondShape: {
    Round: 'Круг',
    Oval: 'Овал',
    Emerald: 'Изумруд',
    Princess: 'Принцесса',
    Cushion: 'Подушка',
    Radiant: 'Радиант',
    Pear: 'Груша',
    Asscher: 'Ашер',
    Marquise: 'Маркиз',
    Heart: 'Сердце',
  },
  settingType: {
    Prong: {
      label: 'Когти',
      tagline:
        'Четыре–шесть тонких зубцов держат камень — максимум света сквозь огранку.',
    },
    Bezel: {
      label: 'Безель',
      tagline: 'Мягкая оправа обнимает камень — надёжно и по-современному.',
    },
    Channel: {
      label: 'Канальное',
      tagline: 'Камни между двумя стенками металла — непрерывная река блеска.',
    },
    Pavé: {
      label: 'Паве',
      tagline: 'Микро-камни так близко, что металл почти исчезает в сиянии.',
    },
    Peg: {
      label: 'Штифт',
      tagline: 'Тонкий штифт в отверстии камня — классика для жемчуга и бусин.',
    },
    Screw: {
      label: 'Винтовое',
      tagline: 'Крепление винтом — съёмно, как у наследственных украшений.',
    },
    Tennis: {
      label: 'Теннис',
      tagline: 'По четыре когтя на камень — бесшовная линия огней.',
    },
    Invisible: {
      label: 'Невидимое',
      tagline: 'Металл не виден — камни сливаются в единую поверхность.',
    },
  },
  settings: {
    'SET-RING-PRONG-SOL-01': { name: 'Классическое кольцо-солитер для помолвки' },
    'SET-RING-PRONG-HALO-01': { name: 'Кольцо с миниатюрным скрытым ореолом' },
    'SET-RING-PAVE-BRIDAL-01': { name: 'Свадебный комплект с дорожкой паве' },
    'SET-RING-PAVE-INFINITY-01': { name: 'Кольцо «бесконечность» с паве' },
    'SET-RING-BEZEL-MODERN-01': { name: 'Солитер в безеле «шёпот»' },
    'SET-RING-CHANNEL-ETERNITY-01': { name: 'Канальное кольцо «река света»' },
    'SET-RING-INVISIBLE-MONOLITH-01': { name: 'Кольцо с невидимым закреплением' },
    'SET-EAR-PRONG-STUD-01': { name: 'Пусеты «шёпот»' },
    'SET-EAR-BEZEL-DROP-01': { name: 'Серьги-подвески в безеле' },
    'SET-NECK-BEZEL-PENDANT-01': { name: 'Кулон-солитер в безеле' },
    'SET-NECK-PRONG-PENDANT-01': { name: 'Кулон на когтях «в воздухе»' },
    'SET-BRACE-TENNIS-CLASSIC-01': { name: 'Классическое крепление теннис-браслета' },
    'SET-BRACE-CHANNEL-LINE-01': { name: 'Канальный браслет-линия' },
  },
  jewelry: {
    'JW-NECK-01': {
      title: 'Кулон-солитер «Вечный свет»',
      description:
        'Лабораторный бриллиант 1,5 ct в лаконичной платиновой оправе — элегантность на каждый день.',
      collectionName: 'Отголоски света',
    },
    'JW-NECK-02': {
      title: 'Кулон с ореолом «Шёпот»',
      description:
        'Круглый бриллиант 1,0 ct в ореоле паве — свет с любого ракурса.',
      collectionName: 'Отголоски света',
    },
    'JW-EAR-01': {
      title: 'Пусеты «Звёздный свет»',
      description:
        'Парные бриллианты Round Brilliant 1,0 ct в жёлтом золоте 750 пробы — базовая классика коллекции.',
      collectionName: 'Базовая линия',
    },
    'JW-EAR-02': {
      title: 'Серьги-подвески ателье',
      description:
        'Два овальных лабораторных бриллианта на платиновых нитях — лёгкое движение, сдержанный блеск.',
      collectionName: 'Ателье',
    },
    'JW-RING-01': {
      title: 'Кольцо «Полночная бесконечность»',
      description:
        'Яркая дорожка паве на розовом золоте — символ вечной любви.',
      collectionName: 'Ручная работа',
    },
    'JW-RING-02': {
      title: 'Помолвочное кольцо со скрытым ореолом',
      description:
        'Бриллиант 1,25 ct в жёлтом золоте 750 пробы со скрытым микро-паве.',
      collectionName: 'Promesa',
    },
    'JW-RING-03': {
      title: 'Классический солитер',
      description:
        'Бриллиант 1,5 ct в шестикогтевой платиновой оправе — самый узнаваемый силуэт.',
      collectionName: 'Promesa',
    },
    'JW-BRACE-01': {
      title: 'Теннис-браслет «Ривьера»',
      description:
        'Сорок два подобранных круглых бриллианта в непрерывной линии — тихое, бесконечное сияние.',
      collectionName: 'Ривьера',
    },
  },
};
