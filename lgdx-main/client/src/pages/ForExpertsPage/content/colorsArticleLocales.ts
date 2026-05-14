import type { Locale } from '../../../i18n/types';

export interface ColorListItem {
  name: string
  cause: string
  hpht?: string
  cvd?: string
  both?: string
}

export interface ColorsArticleLocale {
  intro1: string
  intro2: string
  compareLeftTitle: string
  compareLeftPrice: string
  compareRightTitle: string
  compareRightPrice: string
  courtesy: string
  sourceLabel: string
  leftSpec: string
  rightSpec: string
  science1: string
  science2: string
  explainIntro: string
  groupI: string
  groupII: string
  typeIDetailIntro: string
  typeIaLead: string
  typeIaSubtypes: [string, string, string]
  typeIb: string
  typeIIDetailIntro: string
  typeIIa: string
  typeIIb: string
  caption3: string
  h2Market: string
  marketParagraph: string
  varietyHeading: string
  techHpht: string
  techCvd: string
  techBoth: string
  listItems: ColorListItem[]
  saturationParagraph: string
  chartIntro: string
  ending: string
  authorLabel: string
  author: string
}

const en: ColorsArticleLocale = {
  intro1:
    "Many buyers are unaware that diamond colors can be completely different from the traditional white stone and can actually vary between red, blue, green, pink, yellow, or brown. Natural colored diamonds are very rare, so they are not often found in jewelry stores. Since the makeup of these stones' color combinations is unique, each stone is evaluated at an auction, where prices can reach millions of dollars per carat.",
  intro2:
    'With the development of production technologies such as HPHT and CVD, the market for laboratory-grown diamonds has changed drastically — the entire spectrum of diamond colors became easily accessible. As a result, the cost of these stones is more reasonable, no longer valued at millions of dollars per carat, but now at the level of grown colorless D-color stones (+10–20% from Rapaport).',
  compareLeftTitle: 'Natural «The Hope» Diamond',
  compareLeftPrice: 'Total price: $250,000,000',
  compareRightTitle: 'HPHT Lab-Grown Diamond',
  compareRightPrice: 'Total price: $50,000',
  courtesy: 'Courtesy of Chip Clark/Smithsonian Institution.',
  sourceLabel: 'Source',
  leftSpec: '45.52 ct Fancy Dark Grayish Blue/VS1',
  rightSpec: '4.15 ct Fancy Deep Blue/VS1',
  science1:
    'Without the precedent set by their natural "older brothers," the reasons behind the different colors of lab-grown diamonds would be moot. The color variation in diamonds was studied in the 20th century using natural stones. Their findings eventually led to the opportunity to create lab-grown stones, by replicating the control and environment that nature created over millions of years. Thus, the scientific reasons for the appearance of color in grown and natural diamonds are the same. The only difference is that natural diamonds were formed deep in the Earth\'s mantle and have been in such conditions for billions of years, and lab-grown stones are man-made in 2 weeks under extreme temperature and pressures — conditions close to natural, but artificial. The color of any diamond is determined by the presence or absence of defect-impurity centers in the crystal lattice of a gem. An ideal colorless diamond consists of carbon atoms, but as soon as atoms of another element are incorporated into its structure or there are violations in the arrangement of atoms, a certain color begins to appear in the diamond.',
  science2:
    'In 1934, Robertson, Fox, and Martin created a physical classification of diamonds, which was refined by many other scientists, and is widely used to this day. The classification is based on the presence of the main impurities in diamond crystals, nitrogen and boron. These impurities most often determine the color of the diamond. If boron is incorporated into the diamond structure only in the form of single atoms, then nitrogen forms more than 15 different defect centers in the diamond structure (single atoms, paired atoms, combinations of several nitrogen atoms with vacancies, etc.). The presence of nitrogen and boron impurities in diamonds is determined mainly using FTIR spectroscopy.',
  explainIntro:
    "Let's explain the physical classification of diamonds in more detail. The classification standards are applicable in equal rights to both natural and grown diamonds. As you can see in the picture, initially all diamonds were divided into 2 types according to the presence of nitrogen impurity:",
  groupI: 'I — with nitrogen',
  groupII: 'II — without nitrogen.',
  typeIDetailIntro:
    'Type I was divided in more detail than Type II (since there are many different nitrogen defects in diamond):',
  typeIaLead: 'I a — diamonds with aggregated nitrogen atoms in the structure',
  typeIaSubtypes: [
    'subtype IaA — diamonds with defects A (a pair of nitrogen atoms),',
    'subtype IaB — diamonds with B1 defects (four nitrogen atoms + vacancy),',
    'subtype IaAB — mixed type, diamonds with A and B1 defects;',
  ],
  typeIb: 'I b — diamonds with single nitrogen atoms in the structure (C defects), yellow;',
  typeIIDetailIntro: 'Type II was then split into 2 subtypes:',
  typeIIa: 'II a — pure diamonds, colorless or brownish;',
  typeIIb: 'II b — diamonds with single boron atoms in the structure, blue.',
  caption3: 'Physical classification of diamonds (C.M. Breeding, Shigley J.E. Gems & Gemology, 2009).',
  h2Market: 'Laboratory-grown Diamond Colors',
  marketParagraph:
    'Moving from complex terminology to a simpler one suitable for use in the market of lab-grown diamonds, 95% of lab-grown diamonds fall into three types according to their physical characteristics: IIa-colorless, IIb-blue, and Ib-yellow. It is important to note, naturally occurring diamonds of all three types are isolated cases, where 95% of natural diamonds are type Ia. This is the main difference between natural and grown diamonds and is often used to identify them.',
  varietyHeading: 'Color Variety of Lab-Grown Diamonds:',
  techHpht: 'HPHT technology',
  techCvd: 'CVD technology',
  techBoth: 'Both technologies',
  listItems: [
    {
      name: 'Yellow',
      cause: 'due to the entry of single nitrogen atoms into the structure of diamond, type I b.',
      hpht:
        'common product, the color is well controlled. Nitrogen is captured from the atmosphere or controlled by the composition of the catalyst metal alloy.',
      cvd: 'not often produced, more difficult to control color. Nitrogen is part of the gas mixture.',
    },
    {
      name: 'Green',
      cause: 'due to the occurrence of vacancies in the structure of the diamond.',
      both: 'as a rule, irradiation of type Ib or IIa diamonds with a beam of fast electrons (with an energy of 1–3 MeV).',
    },
    {
      name: 'Pink and Red',
      cause: 'due to nitrogen vacancy NV centers.',
      hpht:
        'a) low-saturated yellow diamonds of type Ib (with single nitrogen atoms) are grown; b) irradiate them with a beam of fast electrons (with an energy of 1–3 MeV) in charged particle accelerators or reactors (vacancies are formed); c) they are annealed in furnaces at T=800–1200°C (NV centers are formed).',
      cvd: 'either similar to HPHT technology, or NV centers are formed directly during the growth process.',
    },
    {
      name: 'Blue',
      cause: 'due to the entry of single boron atoms into the structure of the diamond, type IIb.',
      hpht:
        'common product, the color is well controlled. Boron (fraction of %) is added to the composition of the metal catalyst alloy.',
      cvd: 'not often produced, more difficult to control color. Boron is added to the gas mixture supplied to the growth chamber.',
    },
    {
      name: 'Colorless',
      cause: 'no impurities, type II a.',
      hpht:
        'common product, the color is well controlled. The absence of impurities is achieved by the presence of "getters" (gas absorbers) in the composition of the metal-catalyst alloy.',
      cvd: 'common product, the color is less controlled, often a light brownish tint.',
    },
    {
      name: 'Brown',
      cause: 'deformation disturbances or nickel-nitrogen centers.',
      hpht:
        'rarely produced, not in demand. Crystals with a high concentration of nitrogen and an impurity of nickel in the structure. Depends on the composition of the catalyst metal alloy.',
      cvd: 'often found when the quality of the synthesis process is poor. Dislocations and structural disturbances are formed.',
    },
  ],
  saturationParagraph:
    'The color saturation of a laboratory-grown diamond depends on the concentration of defect-impurity centers. For diamonds, due to the peculiarities of the atom arrangement in the structure, a very low concentration of impurities is sufficient for it to begin to acquire color. The concentration of impurity elements in a diamond is measured in ppm (parts per million) or even ppb (parts per billion). For example, a yellow diamond with a nitrogen concentration of 1 ppm will have one nitrogen atom in the structure per million carbon atoms — such a small fraction of impure atoms already creates a rich color in the diamond. The concentration of impurities in a diamond is determined using complex spectroscopic research methods (IR Spectroscopy, Optical Spectroscopy, Photoluminescence, etc.), which we will discuss in more detail in the following articles.',
  chartIntro:
    'The picture below shows the color scheme of lab-grown diamonds, starting with colorless stones. The approximate concentration of impurity centers (in ppm), determined by instrumental methods, is compared with the color of the diamond. You can see the direct correlation between the color of a diamond with the concentration of nitrogen and boron, as well as the required nitrogen concentrations needed to change the color of the diamond.',
  ending:
    'Thus, the color of a lab-grown diamond is one of its most important characteristics, the nature of which lies in the defect-impurity composition of the diamond crystal lattice. The color saturation of such a stone depends on the concentration of impurities (mainly nitrogen and boron). The entire spectrum of colored diamonds is available for reproduction in the laboratory (CVD and HPHT methods), which makes them relatively inexpensive and in demand in the market, compared to the naturally-occurring, pure diamonds, which are rare and expensive.',
  authorLabel: 'Author:',
  author: 'LGDeal Gemology Department',
}

const de: ColorsArticleLocale = {
  intro1:
    'Viele Käufer wissen nicht, dass Diamanten völlig anders aussehen können als der klassische weiße Stein — sie können rot, blau, grün, rosa, gelb oder braun sein. Natürliche Farbdiamanten sind sehr selten und deshalb selten im Schmuckhandel zu finden. Da jede Farbkombination einzigartig ist, werden solche Steine oft versteigert; Preise von Millionen Dollar pro Karat sind möglich.',
  intro2:
    'Mit HPHT- und CVD-Technologien hat sich der Markt für Labor­diamanten stark verändert: das gesamte Farbspektrum ist leichter verfügbar. Die Kosten liegen daher deutlich niedriger — nicht mehr Millionen pro Karat, sondern eher auf dem Niveau farbloser gezüchteter D-Farben (+10–20 % gegenüber Rapaport).',
  compareLeftTitle: 'Natürlicher «Hope»-Diamant',
  compareLeftPrice: 'Gesamtpreis: 250.000.000 $',
  compareRightTitle: 'HPHT-Labordiamant',
  compareRightPrice: 'Gesamtpreis: 50.000 $',
  courtesy: 'Mit freundlicher Genehmigung von Chip Clark/Smithsonian Institution.',
  sourceLabel: 'Quelle',
  leftSpec: '45,52 ct Fancy Dark Grayish Blue/VS1',
  rightSpec: '4,15 ct Fancy Deep Blue/VS1',
  science1:
    'Ohne die natürlichen «älteren Brüder» wäre die Erklärung der Farben von Labordiamanten kaum möglich gewesen. Die Farbvariation wurde im 20. Jahrhundert an natürlichen Steinen erforscht und führte dazu, dass Wachstumsbedingungen nachgebildet werden konnten. Die physikalischen Ursachen sind bei natürlichen und gezüchteten Diamanten dieselben: Natürliche entstanden tief im Erdmantel über Milliarden Jahre, Labordiamanten werden in etwa zwei Wochen unter extremen Druck- und Temperaturbedingungen erzeugt. Die Farbe hängt von Defekt- und Fremdatomzentren im Kristallgitter ab. Ein ideal farbloser Diamant besteht nur aus Kohlenstoff; sobald Fremdatome eingebaut werden oder das Gitter gestört ist, entsteht Farbe.',
  science2:
    '1934 schufen Robertson, Fox und Martin eine physikalische Klassifikation der Diamanten, die später verfeinert wurde und heute üblich ist. Sie basiert auf den Hauptverunreinigungen Stickstoff und Bor. Bor tritt oft als Einzelatome auf, Stickstoff bildet mehr als 15 verschiedene Defektzentren (Einzelatome, Paare, Kombinationen mit Leerstellen usw.). Stickstoff und Bor werden vor allem per FTIR-Spektroskopie nachgewiesen.',
  explainIntro:
    'Die physikalische Klassifikation im Detail: Sie gilt gleichermaßen für natürliche und gezüchtete Diamanten. Zunächst teilt man alle Diamanten nach Vorhandensein von Stickstoff in zwei Typen:',
  groupI: 'I — mit Stickstoff',
  groupII: 'II — ohne Stickstoff.',
  typeIDetailIntro:
    'Typ I ist feiner unterteilt als Typ II (weil es viele verschiedene Stickstoffdefekte gibt):',
  typeIaLead: 'I a — Diamanten mit aggregierten Stickstoffatomen im Gitter',
  typeIaSubtypes: [
    'Untertyp IaA — Defekte A (Stickstoffpaar),',
    'Untertyp IaB — B1-Defekte (vier Stickstoffatome + Leerstelle),',
    'Untertyp IaAB — gemischt, A- und B1-Defekte;',
  ],
  typeIb: 'I b — einzelne Stickstoffatome (C-Defekte), gelb;',
  typeIIDetailIntro: 'Typ II wird in zwei Untertypen gegliedert:',
  typeIIa: 'II a — reine Diamanten, farblos oder bräunlich;',
  typeIIb: 'II b — einzelne Boratome im Gitter, blau.',
  caption3: 'Physikalische Klassifikation von Diamanten (C.M. Breeding, Shigley J.E. Gems & Gemology, 2009).',
  h2Market: 'Farben von im Labor gezüchteten Diamanten',
  marketParagraph:
    'In einfacherer Marktterminologie entfallen etwa 95 % der Labordiamanten auf drei physikalische Typen: IIa farblos, IIb blau und Ib gelb. Bei Naturdiamanten sind alle drei Typen selten; etwa 95 % der Naturdiamanten sind Typ Ia — ein wichtiger Unterschied zur Identifikation.',
  varietyHeading: 'Farbspektrum von Labordiamanten:',
  techHpht: 'HPHT-Technologie',
  techCvd: 'CVD-Technologie',
  techBoth: 'Beide Technologien',
  listItems: [
    {
      name: 'Gelb',
      cause: 'Einbau einzelner Stickstoffatome, Typ I b.',
      hpht:
        'übliches Produkt, Farbe gut steuerbar. Stickstoff aus der Atmosphäre oder über die Katalysatorlegierung.',
      cvd: 'seltener, schwerer steuerbar. Stickstoff in der Gasphase.',
    },
    {
      name: 'Grün',
      cause: 'Leerstellen im Gitter.',
      both: 'typisch: Bestrahlung von Typ-Ib- oder IIa-Diamanten mit schnellen Elektronen (1–3 MeV).',
    },
    {
      name: 'Rosa und Rot',
      cause: 'NV-Zentren (Stickstoff-Leerstelle).',
      hpht:
        'a) schwach gesättigte gelbe Ib-Steine züchten; b) mit schnellen Elektronen bestrahlen (Beschleuniger/Reaktor); c) bei 800–1200 °C tempern (NV-Bildung).',
      cvd: 'ähnlich wie HPHT oder NV-Zentren direkt beim Wachstum.',
    },
    {
      name: 'Blau',
      cause: 'Einzelne Boratome, Typ IIb.',
      hpht: 'üblich, gut steuerbar. Bor in der Metallkatalysatorlegierung.',
      cvd: 'seltener, Bor im Gasgemisch.',
    },
    {
      name: 'Farblos',
      cause: 'kaum Verunreinigungen, Typ II a.',
      hpht:
        'üblich, gut steuerbar. «Getter» in der Katalysatorlegierung binden Gase.',
      cvd: 'üblich, oft schlechter gesteuert, manchmal leicht bräunlich.',
    },
    {
      name: 'Braun',
      cause: 'Verformungsdefekte oder Nickel-Stickstoff-Zentren.',
      hpht: 'selten, wenig nachgefragt. Hoher Stickstoff, Nickel im Gitter.',
      cvd: 'bei schlechter Synthesequalität; Versetzungen und Gitterstörungen.',
    },
  ],
  saturationParagraph:
    'Die Farbsättigung hängt von der Konzentration der Defekt- und Fremdatomzentren ab. Schon sehr geringe Konzentrationen (ppm oder ppb) können sichtbare Farbe erzeugen. Beispiel: 1 ppm Stickstoff bedeutet ein Stickstoffatom pro Million Kohlenstoffatome — und kann bereits kräftiges Gelb ergeben. Die Konzentration wird spektroskopisch bestimmt (IR, optische Spektroskopie, Photolumineszenz usw.; Details folgen in weiteren Artikeln).',
  chartIntro:
    'Das Bild unten zeigt das Farbschema von Labordiamanten beginnend bei farblosen Steinen: ppm-Konzentrationen der Zentren (instrumentell) im Vergleich zur sichtbaren Farbe — inklusive Zusammenhang zwischen Stickstoff-, Bor-Konzentration und Farbe.',
  ending:
    'Die Farbe ist eine zentrale Eigenschaft von Labordiamanten und beruht auf Defekten und Fremdatomen im Gitter. Das gesamte Farbspektrum lässt sich im Labor (CVD/HPHT) reproduzieren — im Gegensatz zu seltenen, teuren Naturfarbdiamanten.',
  authorLabel: 'Autor:',
  author: 'LGDeal Gemmologie-Abteilung',
}

const fr: ColorsArticleLocale = {
  intro1:
    "Beaucoup d'acheteurs ignorent que les diamants peuvent être très différents du blanc classique : rouge, bleu, vert, rose, jaune ou brun. Les diamants de couleur naturels sont rares et peu visibles en bijouterie. Chaque combinaison de couleurs étant unique, ces pierres sont souvent vendues aux enchères à des prix pouvant atteindre des millions de dollars par carat.",
  intro2:
    "Avec le développement du HPHT et du CVD, le marché des diamants de laboratoire a changé : tout le spectre de couleurs est devenu accessible. Les prix ne sont plus de millions par carat, mais plutôt du niveau des diamants incolores de laboratoire D (+10–20 % par rapport à Rapaport).",
  compareLeftTitle: 'Diamant naturel « The Hope »',
  compareLeftPrice: 'Prix total : 250 000 000 $',
  compareRightTitle: 'Diamant de laboratoire HPHT',
  compareRightPrice: 'Prix total : 50 000 $',
  courtesy: 'Avec l’aimable autorisation de Chip Clark / Smithsonian Institution.',
  sourceLabel: 'Source',
  leftSpec: '45,52 ct Fancy Dark Grayish Blue/VS1',
  rightSpec: '4,15 ct Fancy Deep Blue/VS1',
  science1:
    "Sans les diamants naturels « aînés », on ne pourrait pas expliquer les couleurs des diamants de laboratoire. L'étude des couleurs au XXe siècle sur pierres naturelles a permis de reproduire les conditions de la nature. Les mécanismes physiques sont les mêmes pour naturel et laboratoire : les naturels se forment profondément dans le manteau sur des milliards d'années ; les laboratoire se fabriquent en environ deux semaines sous pression et température extrêmes. La couleur vient des centres de défauts et d'impuretés dans le réseau cristallin.",
  science2:
    "En 1934, Robertson, Fox et Martin ont proposé une classification physique des diamants, affinée depuis et encore utilisée. Elle repose sur l'azote et le bore comme impuretés principales. Le bore s'intègre souvent comme atomes isolés ; l'azote forme plus de 15 types de défauts. La détection se fait surtout par spectroscopie FTIR.",
  explainIntro:
    'Détaillons la classification physique : elle s’applique également aux diamants naturels et de laboratoire. Au départ, on divise les diamants en deux types selon la présence d’azote :',
  groupI: 'I — avec azote',
  groupII: 'II — sans azote.',
  typeIDetailIntro:
    'Le type I est subdivisé plus finement que le type II (nombreux défauts azotés) :',
  typeIaLead: 'I a — diamants avec azote agrégé dans la structure',
  typeIaSubtypes: [
    'sous-type IaA — défauts A (paire d’azote),',
    'sous-type IaB — défauts B1 (quatre azote + lacune),',
    'sous-type IaAB — type mixte, défauts A et B1 ;',
  ],
  typeIb: 'I b — azote isolé (défauts C), jaune ;',
  typeIIDetailIntro: 'Le type II se divise en deux sous-types :',
  typeIIa: 'II a — diamants purs, incolores ou légèrement bruns ;',
  typeIIb: 'II b — bore isolé dans la structure, bleu.',
  caption3: 'Classification physique des diamants (C.M. Breeding, Shigley J.E. Gems & Gemology, 2009).',
  h2Market: 'Couleurs des diamants de laboratoire',
  marketParagraph:
    'En langage marché, environ 95 % des diamants de laboratoire relèvent de trois types : IIa incolore, IIb bleu, Ib jaune. Chez les pierres naturelles, ces trois types sont rares ; environ 95 % des naturels sont de type Ia — un marqueur d’identification important.',
  varietyHeading: 'Variété des couleurs (diamants de laboratoire) :',
  techHpht: 'Technologie HPHT',
  techCvd: 'Technologie CVD',
  techBoth: 'Les deux technologies',
  listItems: [
    {
      name: 'Jaune',
      cause: 'azote isolé dans la structure, type I b.',
      hpht:
        'produit courant, couleur bien maîtrisée. Azote capté de l’air ou via l’alliage catalyseur.',
      cvd: 'moins courant, couleur plus difficile à maîtriser ; azote dans le gaz.',
    },
    {
      name: 'Vert',
      cause: 'lacunes dans le réseau.',
      both: 'en général irradiation d’un Ib ou IIa par faisceau d’électrons rapides (1–3 MeV).',
    },
    {
      name: 'Rose et rouge',
      cause: 'centres NV (azote-lacune).',
      hpht:
        'a) croissance de jaunes Ib peu saturés ; b) irradiation par électrons rapides ; c) recuit 800–1200 °C (formation NV).',
      cvd: 'similaire au HPHT ou NV formés pendant la croissance.',
    },
    {
      name: 'Bleu',
      cause: 'bore isolé, type IIb.',
      hpht: 'courant, bonne maîtrise ; bore dans l’alliage catalyseur.',
      cvd: 'moins courant ; bore dans le gaz.',
    },
    {
      name: 'Incolore',
      cause: 'peu d’impuretés, type II a.',
      hpht:
        'courant ; « getters » dans l’alliage pour absorber les gaz.',
      cvd: 'courant, parfois moins maîtrisé, teinte brunâtre légère.',
    },
    {
      name: 'Brun',
      cause: 'déformations ou centres azote-nickel.',
      hpht: 'rare ; azote élevé, nickel dans la structure.',
      cvd: 'si synthèse de mauvaise qualité ; dislocations et défauts.',
    },
  ],
  saturationParagraph:
    'La saturation dépend de la concentration des centres de défauts et d’impuretés. Des concentrations très faibles (ppm ou ppb) suffisent à une couleur visible. Exemple : 1 ppm d’azote correspond à un atome d’azote pour un million d’atomes de carbone. Les concentrations se mesurent par méthodes spectroscopiques (IR, optique, photoluminescence, etc.).',
  chartIntro:
    'Le schéma ci-dessous illustre les couleurs des diamants de laboratoire à partir des incolores, avec concentrations approximatives en ppm : corrélation entre couleur et teneur en azote ou bore.',
  ending:
    'La couleur est une caractéristique majeure des diamants de laboratoire, liée aux défauts et impuretés du réseau. Tout le spectre peut être reproduit au laboratoire (CVD/HPHT), contrairement aux pierres naturelles rares et coûteuses.',
  authorLabel: 'Auteur :',
  author: 'Département de gemmologie LGDeal',
}

const zh: ColorsArticleLocale = {
  intro1:
    '许多买家并不知道，钻石的颜色可以与传统白钻完全不同——红、蓝、绿、粉、黄、棕皆有可能。天然彩钻非常稀有，珠宝店中并不常见。由于每颗石头的颜色组合都独一无二，往往通过拍卖成交，单克拉价格可达数百万美元。',
  intro2:
    '随着 HPHT、CVD 等生产技术的发展，培育钻石市场发生了巨大变化——整片颜色谱系都变得容易获得。因此价格不再动辄每克拉数百万美元，而更接近无色培育 D 色水平（相对 Rapaport 约 +10–20%）。',
  compareLeftTitle: '天然「希望」钻石',
  compareLeftPrice: '总价：$250,000,000',
  compareRightTitle: 'HPHT 培育钻石',
  compareRightPrice: '总价：$50,000',
  courtesy: '图片来源：Chip Clark / Smithsonian Institution。',
  sourceLabel: '来源',
  leftSpec: '45.52 克拉 Fancy Dark Grayish Blue/VS1',
  rightSpec: '4.15 克拉 Fancy Deep Blue/VS1',
  science1:
    '若没有天然钻石这一「前辈」的研究基础，培育钻石的多色成因就难以理解。20 世纪对天然石的研究最终使人们能够复现自然界的控制与环境。天然与培育的致色机理相同：天然石在地幔深处经数十亿年形成，培育石则在约两周内于高温高压下人工生长。任何钻石的颜色都取决于晶格中的缺陷与杂质中心；理想无色钻几乎全为碳原子，一旦有其他原子进入或排列紊乱，就会出现颜色。',
  science2:
    '1934 年 Robertson、Fox 与 Martin 提出了钻石的物理分类，后经众多学者完善并沿用至今。分类以氮、硼两类主要杂质为基础。硼多以单原子形式进入结构，氮则可形成十余种不同缺陷中心（单原子、原子对、与空位组合等）。氮、硼的存在主要通过 FTIR 光谱测定。',
  explainIntro:
    '下面更详细地说明物理分类：该标准同等适用于天然与培育钻石。如图所示，最初按是否含氮将钻石分为两类：',
  groupI: 'I 型 — 含氮',
  groupII: 'II 型 — 不含氮。',
  typeIDetailIntro:
    'I 型比 II 型划分更细（因为氮缺陷种类更多）：',
  typeIaLead: 'Ia — 结构中含聚集氮原子的钻石',
  typeIaSubtypes: [
    '亚型 IaA — A 缺陷（一对氮原子），',
    '亚型 IaB — B1 缺陷（四个氮原子 + 空位），',
    '亚型 IaAB — 混合型，含 A 与 B1 缺陷；',
  ],
  typeIb: 'Ib — 结构中单氮原子（C 缺陷），偏黄；',
  typeIIDetailIntro: 'II 型再分为两个亚型：',
  typeIIa: 'IIa — 纯净钻石，无色或略褐；',
  typeIIb: 'IIb — 结构中单硼原子，偏蓝。',
  caption3: '钻石物理分类（C.M. Breeding, Shigley J.E. Gems & Gemology, 2009）。',
  h2Market: '培育钻石的颜色',
  marketParagraph:
    '从复杂术语转向市场常用表述：约 95% 的培育钻石在物理类型上可归为三类：IIa 无色、IIb 蓝色、Ib 黄色。值得注意的是，天然钻石中这三类都属个案，而约 95% 的天然钻为 Ia 型——这是区分天然与培育的重要线索之一。',
  varietyHeading: '培育钻石的颜色种类：',
  techHpht: 'HPHT 技术',
  techCvd: 'CVD 技术',
  techBoth: '两种技术',
  listItems: [
    {
      name: '黄色',
      cause: '单氮原子进入结构，Ib 型。',
      hpht: '常见产品，颜色易控。氮来自气氛或由催化剂合金成分控制。',
      cvd: '产量较少，颜色更难控。氮存在于气体原料中。',
    },
    {
      name: '绿色',
      cause: '结构中出现空位。',
      both: '通常对 Ib 或 IIa 钻石进行快电子束辐照（能量约 1–3 MeV）。',
    },
    {
      name: '粉红与红色',
      cause: '氮—空位 NV 中心。',
      hpht:
        'a）先培育低饱和黄色 Ib；b）用快电子束辐照（加速器或反应堆中产生空位）；c）在 800–1200°C 退火形成 NV。',
      cvd: '流程类似 HPHT，或在生长过程中直接形成 NV。',
    },
    {
      name: '蓝色',
      cause: '单硼原子进入结构，IIb 型。',
      hpht: '常见，颜色易控。在金属催化剂合金中加入少量硼。',
      cvd: '较少见；硼加入生长腔的气体混合物。',
    },
    {
      name: '无色',
      cause: '几乎无杂质，IIa 型。',
      hpht: '常见，颜色易控。合金中含「吸气剂」以除去气体杂质。',
      cvd: '常见，但颜色控制略差，常带浅褐色调。',
    },
    {
      name: '棕色',
      cause: '形变缺陷或镍—氮相关中心。',
      hpht: '少见、需求低。高氮并含镍，取决于催化剂合金。',
      cvd: '合成质量差时常见，产生位错与结构扰动。',
    },
  ],
  saturationParagraph:
    '培育钻石的颜色饱和度取决于缺陷—杂质中心的浓度。由于碳原子排列特点，极低杂质浓度即可显色；杂质浓度以 ppm（百万分之一）甚至 ppb（十亿分之一）计量。例如含 1 ppm 氮的黄钻，意味着每百万个碳原子中约有一个氮原子——如此低的杂质比例即可呈现浓郁颜色。杂质浓度需借助红外光谱、光学光谱、光致发光等复杂方法测定（后续文章再详述）。',
  chartIntro:
    '下图展示从无色石开始的培育钻石颜色方案：将仪器测得的杂质中心浓度（ppm）与肉眼颜色对应，可直观看到颜色与氮、硼浓度之间的关系及改色所需氮浓度。',
  ending:
    '因此，颜色是培育钻石最重要的特征之一，其本质来自晶格中的缺陷—杂质组成；饱和度主要取决于氮、硼等杂质浓度。实验室可用 CVD 与 HPHT 复现整片彩色谱系，使其相对易得、价格可及；而天然纯色彩钻则稀有昂贵。',
  authorLabel: '作者：',
  author: 'LGDeal 宝石学部门',
}

const ja: ColorsArticleLocale = {
  intro1:
    '多くのバイヤーは、ダイヤモンドが従来の白だけでなく、赤・青・緑・ピンク・黄・茶などさまざまな色になり得ることを知りません。天然のカラーダイヤは非常に希少で、宝石店ではあまり見かけません。色の組み合わせは一つとして同じものがなく、オークションではカラット当たり数百万ドルに達することもあります。',
  intro2:
    'HPHT や CVD などの技術発展により、ラボグロウンダイヤモンド市場は大きく変化し、あらゆる色が手に入りやすくなりました。その結果、価格はカラット数百万ドルではなく、無色の D 相当のラボグロウン水準（Rapaport 比 +10〜20% 程度）に近づいています。',
  compareLeftTitle: '天然「ホープ」ダイヤモンド',
  compareLeftPrice: '総額: $250,000,000',
  compareRightTitle: 'HPHT ラボグロウンダイヤモンド',
  compareRightPrice: '総額: $50,000',
  courtesy: '画像提供：Chip Clark / Smithsonian Institution',
  sourceLabel: '出典',
  leftSpec: '45.52ct Fancy Dark Grayish Blue/VS1',
  rightSpec: '4.15ct Fancy Deep Blue/VS1',
  science1:
    '天然ダイヤという「先輩」がなければ、ラボグロウンの多様な色の説明は成り立ちません。20 世紀に天然石で研究された結果、自然界の条件を再現する道が開けました。発色の科学は天然もラボグロウンも同じです。天然はマントル深部で数十億年かけて形成され、ラボグロウンは約 2 週間で極限の温圧下に作られます。色は格子欠陥と不純物中心の有無で決まり、理想の無色は炭素のみですが、他元素の混入や配列の乱れで色が現れます。',
  science2:
    '1934 年に Robertson、Fox、Martin による物理分類が示され、その後多くの研究者によって洗練され、現在も広く使われています。主な不純物である窒素とホウ素に基づきます。ホウ素は単原子で入りやすく、窒素は単体・ペア、空孔との複合体など 15 種類以上の欠陥中心を形成します。窒素・ホウ素の同定には主に FTIR 分光が用いられます。',
  explainIntro:
    '物理分類をもう少し詳しく説明します。この基準は天然石とラボグロウンに同様に適用されます。図のとおり、まず窒素の有無で 2 タイプに分けます。',
  groupI: 'I — 窒素あり',
  groupII: 'II — 窒素なし。',
  typeIDetailIntro:
    'タイプ I は、窒素欠陥の多様性から II より細かく分類されます。',
  typeIaLead: 'I a — 構造に凝集窒素を持つダイヤモンド',
  typeIaSubtypes: [
    '亜型 IaA — A 欠陥（窒素のペア）、',
    '亜型 IaB — B1 欠陥（窒素 4 原子 + 空孔）、',
    '亜型 IaAB — 混合型（A と B1）、',
  ],
  typeIb: 'I b — 単一窒素（C 欠陥）、黄色味；',
  typeIIDetailIntro: 'タイプ II は 2 つの下位に分かれます。',
  typeIIa: 'II a — 純度が高く、無色またはやや褐色；',
  typeIIb: 'II b — 単一ホウ素、青色。',
  caption3: 'ダイヤモンドの物理分類（C.M. Breeding, Shigley J.E. Gems & Gemology, 2009）。',
  h2Market: 'ラボグロウンダイヤモンドの色',
  marketParagraph:
    '専門用語から市場向けの言い方に移ると、ラボグロウンの約 95% は物理特性で IIa（無色）、IIb（青）、Ib（黄）のいずれかに分類されます。天然ではこの 3 タイプは例外的で、天然の約 95% は Ia 型です。これが産地判別の大きな手がかりになります。',
  varietyHeading: 'ラボグロウンの色のバリエーション：',
  techHpht: 'HPHT 技術',
  techCvd: 'CVD 技術',
  techBoth: '両技術',
  listItems: [
    {
      name: '黄色',
      cause: '単一窒素が構造に入る Ib 型。',
      hpht:
        '一般的製品で色は制御しやすい。窒素は雰囲気から取り込むか触媒合金で調整。',
      cvd: '少なく、色制御は難しめ。窒素はガス混合物に含まれる。',
    },
    {
      name: '緑色',
      cause: '格子の空孔。',
      both: '通常は Ib または IIa を高速電子線（1〜3 MeV）で照射。',
    },
    {
      name: 'ピンク・レッド',
      cause: 'NV（窒素-空孔）中心。',
      hpht:
        'a）低彩度の黄色 Ib を育成；b）高速電子線照射で空孔形成；c）800〜1200°C でアニールして NV 形成。',
      cvd: 'HPHT に似るか、成長中に NV が形成される。',
    },
    {
      name: '青色',
      cause: '単一ホウ素、IIb 型。',
      hpht: '一般的で色は制御しやすい。金属触媒合金にホウ素を添加。',
      cvd: 'やや少なく、成長室へのガス混合物にホウ素。',
    },
    {
      name: '無色',
      cause: '不純物がほぼない IIa 型。',
      hpht:
        '一般的。不純物除去のため触媒合金にゲッター（吸気材）を含める。',
      cvd: '一般的だが色制御はやや難しく、薄茶褐色になりがち。',
    },
    {
      name: '褐色',
      cause: '変形欠陥やニッケル-窒素中心。',
      hpht: '希少で需要も低い。高窒素・ニッケル混入は触媒合金に依存。',
      cvd: '合成品質が悪いと多く、転位や構造乱れが生じる。',
    },
  ],
  saturationParagraph:
    '色の彩度は欠陥・不純物中心の濃度に依存します。ダイヤモンドではごく低い濃度でも色が出やすく、ppm や ppb 単位で測ります。例：窒素 1 ppm は炭素 100 万個に窒素 1 個という割合でも濃い黄色になり得ます。濃度は赤外・光学・光致発光などの分光法で評価します（詳細は後の記事で）。',
  chartIntro:
    '下図は無色石から始まるラボグロウンの色のスキームで、機器で求めた不純物中心濃度（ppm）と色の対応、窒素・ホウ素濃度と色の関係を示します。',
  ending:
    '以上のように、色はラボグロウンの重要特性であり、格子の欠陥・不純物組成に由来します。彩度は主に窒素とホウ素の濃度に依存します。CVD・HPHT で全スペクトルを再現できるため相対的に手頃ですが、希少で高価な天然の純粋な彩石とは対照的です。',
  authorLabel: '著者：',
  author: 'LGDeal 宝石学部門',
}

const hi: ColorsArticleLocale = {
  intro1:
    'कई खरीदारों को पता नहीं होता कि हीरे के रंग पारंपरिक सफेद से पूरी तरह अलग हो सकते हैं—लाल, नीला, हरा, गुलाबी, पीला या भूरा। प्राकृतिक रंगीन हीरे बहुत दुर्लभ हैं, इसलिए आमतौर पर आभूषण दुकानों में नहीं मिलते। प्रत्येक पत्थर का रंग संयोजन अद्वितीय होता है, अक्सर नीलामी में मूल्य प्रति कैरेट लाखों डॉलर तक पहुंच जाता है।',
  intro2:
    'HPHT और CVD जैसी तकनीकों के विकास से लैब-ग्रोन हीरों का बाजार बदल गया—पूरा रंग स्पेक्ट्रम अधिक सुलभ हो गया। परिणामस्वरूप कीमतें अब प्रति कैरेट लाखों डॉलर नहीं, बल्कि बिना रंग वाले लैब-ग्रोन D-ग्रेड स्तर (+ Rapaport से लगभग 10–20%) के करीब हैं।',
  compareLeftTitle: 'प्राकृतिक «The Hope» हीरा',
  compareLeftPrice: 'कुल कीमत: $250,000,000',
  compareRightTitle: 'HPHT लैब-ग्रोन हीरा',
  compareRightPrice: 'कुल कीमत: $50,000',
  courtesy: 'सौजन्य: Chip Clark / Smithsonian Institution',
  sourceLabel: 'स्रोत',
  leftSpec: '45.52 ct Fancy Dark Grayish Blue/VS1',
  rightSpec: '4.15 ct Fancy Deep Blue/VS1',
  science1:
    'प्राकृतिक हीरों द्वारा तय किए गए अध्ययन के बिना लैब-ग्रोन रंगों की व्याख्या संभव नहीं होती। बीसवीं सदी में प्राकृतिक पत्थरों पर किए गए अनुसंधान ने प्रकृति की स्थितियों को दोहराने का रास्ता दिया। रंग बनने का विज्ञान दोनों में समान है: प्राकृतिक पत्थर पृथ्वी के मेंटल में अरबों वर्षों में बने, लैब-ग्रोन लगभग दो सप्ताह में चरम ताप-दाब पर बनते हैं। रंग क्रिस्टल जाल में दोष-अशुद्धि केंद्रों पर निर्भर करता है।',
  science2:
    '1934 में Robertson, Fox और Martin ने भौतिक वर्गीकरण दिया, जिसे बाद के वैज्ञानिकों ने परिष्कृत किया और आज भी उपयोग होता है। यह मुख्यतः नाइट्रोजन और बोरॉन अशुद्धियों पर आधारित है। बोरॉन अक्सर एकल परमाणु रूप में आता है, जबकि नाइट्रोजन 15 से अधिक विभिन्न दोष केंद्र बना सकता है। नाइट्रोजन और बोरॉन की पहचान मुख्यतः FTIR स्पेक्ट्रोस्कोपी से होती है।',
  explainIntro:
    'भौतिक वर्गीकरण विस्तार से: यह मानक प्राकृतिक और लैब-ग्रोन दोनों पर समान रूप से लागू होता है। चित्र के अनुसार, पहले सभी हीरों को नाइट्रोजन की उपस्थिति के अनुसार दो प्रकारों में बांटा गया:',
  groupI: 'I — नाइट्रोजन के साथ',
  groupII: 'II — नाइट्रोजन के बिना।',
  typeIDetailIntro:
    'प्रकार I को प्रकार II की तुलना में अधिक विस्तार से बांटा गया (क्योंकि नाइट्रोजन दोष कई प्रकार के होते हैं):',
  typeIaLead: 'I a — संरचना में एकत्रित नाइट्रोजन परमाणु वाले हीरे',
  typeIaSubtypes: [
    'उपप्रकार IaA — A दोष (नाइट्रोजन जोड़ा),',
    'उपप्रकार IaB — B1 दोष (चार नाइट्रोजन + रिक्ति),',
    'उपप्रकार IaAB — मिश्रित, A और B1 दोष;',
  ],
  typeIb: 'I b — एकल नाइट्रोजन (C दोष), पीला;',
  typeIIDetailIntro: 'प्रकार II दो उपप्रकारों में बंटा:',
  typeIIa: 'II a — शुद्ध हीरे, रंगहीन या हल्के भूरे;',
  typeIIb: 'II b — एकल बोरॉन परमाणु, नीला।',
  caption3: 'हीरों का भौतिक वर्गीकरण (C.M. Breeding, Shigley J.E. Gems & Gemology, 2009)।',
  h2Market: 'लैब-ग्रोन हीरों के रंग',
  marketParagraph:
    'जटिल शब्दावली से बाजार की सरल भाषा की ओर: लगभग 95% लैब-ग्रोन हीरे भौतिक रूप से तीन प्रकारों में आते हैं: IIa रंगहीन, IIb नीला, Ib पीला। प्राकृतिक हीरों में ये तीनों दुर्लभ हैं; लगभग 95% प्राकृतिक हीरे प्रकार Ia हैं—यह पहचान में महत्वपूर्ण अंतर है।',
  varietyHeading: 'लैब-ग्रोन हीरों की रंग विविधता:',
  techHpht: 'HPHT तकनीक',
  techCvd: 'CVD तकनीक',
  techBoth: 'दोनों तकनीकें',
  listItems: [
    {
      name: 'पीला',
      cause: 'एकल नाइट्रोजन परमाणु, प्रकार I b।',
      hpht:
        'आम उत्पाद, रंग अच्छी तरह नियंत्रित। नाइट्रोजन वायुमंडल से या उत्प्रेरक मिश्र धातु से।',
      cvd: 'कम उत्पादित, रंग नियंत्रण कठिन। नाइट्रोजन गैस मिश्रण में।',
    },
    {
      name: 'हरा',
      cause: 'संरचना में रिक्तियाँ।',
      both: 'आमतौर पर Ib या IIa पर तेज़ इलेक्ट्रॉन बीम (1–3 MeV) से विकिरण।',
    },
    {
      name: 'गुलाबी और लाल',
      cause: 'NV (नाइट्रोजन-रिक्ति) केंद्र।',
      hpht:
        'क) कम संतृप्त पीले Ib उगाएं; ख) तेज़ इलेक्ट्रॉन से विकिरण; ग) 800–1200°C पर एनिल (NV निर्माण)।',
      cvd: 'HPHT जैसा या वृद्धि के दौरान NV।',
    },
    {
      name: 'नीला',
      cause: 'एकल बोरॉन, प्रकार IIb।',
      hpht: 'आम, रंग नियंत्रित। बोरॉन धातु उत्प्रेरक मिश्रण में।',
      cvd: 'कम आम; बोरॉन गैस मिश्रण में।',
    },
    {
      name: 'रंगहीन',
      cause: 'लगभग कोई अशुद्धि नहीं, प्रकार II a।',
      hpht:
        'आम, रंग नियंत्रित। मिश्र धातु में «गेटर» से गैस अवशोषण।',
      cvd: 'आम, कम नियंत्रित, हल्का भूरा रंग।',
    },
    {
      name: 'भूरा',
      cause: 'विरूपण दोष या निकल-नाइट्रोजन केंद्र।',
      hpht: 'दुर्लभ, कम मांग। उच्च नाइट्रोजन + निकल।',
      cvd: 'खराब संश्लेषण पर अक्सर; डिसलोकेशन।',
    },
  ],
  saturationParagraph:
    'रंग की संतृप्ति दोष-अशुद्धि केंद्रों की सांद्रता पर निर्भर करती है। बहुत कम सांद्रता (ppm या ppb) भी दृश्य रंग दे सकती है। उदाहरण: 1 ppm नाइट्रोजन का अर्थ है प्रति लाख कार्बन परमाणुओं में एक नाइट्रोजन—यह भी गहरा पीला बना सकता है। सांद्रता IR, ऑप्टिकल, फोटोलुमिनेसेंस आदि से मापी जाती है।',
  chartIntro:
    'नीचे का चित्र रंगहीन पत्थरों से शुरू होकर लैब-ग्रोन रंग योजना दिखाता है: ppm में केंद्र सांद्रता और रंग का सीधा संबंध।',
  ending:
    'इस प्रकार, रंग लैब-ग्रोन हीरे की प्रमुख विशेषता है; यह क्रिस्टल जाल की दोष-अशुद्धि संरचना पर आधारित है। CVD/HPHT से पूरा रंग स्पेक्ट्रम पुनरुत्पादित किया जा सकता है, जबकि दुर्लभ प्राकृतिक रंगीन हीरे महंगे रहते हैं।',
  authorLabel: 'लेखक:',
  author: 'LGDeal जेमोलॉजी विभाग',
}

export const colorsArticleLocales: Record<Locale, ColorsArticleLocale> = {
  en,
  de,
  fr,
  zh,
  ja,
  hi,
}
