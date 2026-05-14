import type { Locale } from '../../../i18n/types';

export interface DifferencesArticleLocale {
  intro1: string
  intro2: string
  tableCaption: string
  th1: string
  th2: string
  th3: string
  th4: string
  th5: string
  th6: string
  rowDiamond: string
  rowLabDiamond: string
  rowMoissanite: string
  rowCz: string
  crystalCubic: string
  crystalHexagonal: string
  afterTable: string
  natureGrowth: string
  labGrowth: string
  midSection: string
  crystalTitle: string
  crystalBody: string
  inclusionTitle: string
  inclusionBody: string
  fig1: string
  fig2: string
  fig3: string
  closing1: string
  closing2: string
  authorLabel: string
  author: string
}

const en: DifferencesArticleLocale = {
  intro1:
    'A diamond is a mineral that is one of the polymorphic modifications of a chemical element such as carbon (C). Thus, diamond-like graphite and lonsdaleite are completely composed of carbon atoms. The difference lies only in the crystal lattice of these minerals (in the arrangement of atoms). The distinguishing features of diamonds are that it crystallizes in the cubic syngony at very high temperatures and pressures (for example, 1600°C and 6 GPa). A lab-grown diamond is the same diamond, only grown in laboratory conditions. It has the same crystal lattice, identical physical and chemical properties, and it crystallizes naturally in the cubic system. A brilliant is a polished diamond, either natural or lab-grown. Strictly speaking, a brilliant denotes the type of the cut of a diamond that is designed to bring out the optimum optical properties of a diamond.',
  intro2:
    'This is not the case with imitations of a diamond. These are other minerals and chemical compounds which are fundamentally different in chemical composition, crystal lattice, and physical properties. For example, moissanite is silicon carbide (SiC), and it has few similarities with a diamond. It is used as an imitation because of its diamond-like optical properties (dispersion, brilliance, and refractive index).',
  tableCaption: 'Table 1. Some physical constants of diamond and its imitations.',
  th1: 'Mineral / compound',
  th2: 'Chemical formula',
  th3: 'Refractive index',
  th4: 'Specific gravity',
  th5: 'Crystal system',
  th6: 'Mohs hardness',
  rowDiamond: 'Diamond',
  rowLabDiamond: 'Lab-grown diamond',
  rowMoissanite: 'Moissanite',
  rowCz: 'Cubic zirconia',
  crystalCubic: 'Cubic',
  crystalHexagonal: 'Hexagonal',
  afterTable:
    'As we found out, natural and lab-grown diamonds are one and the same in terms of material composition. But then the question arises how can they be distinguished from each other, and what is the difference between them, if any difference even exists.',
  natureGrowth:
    'The answer to this question lies in the process of diamond crystal growth in nature and in the laboratory. In nature, diamonds crystallized deep in the mantle (at depths of ≈150 km) hundreds of millions, or, in some cases, even several billion years ago. Further, this diamond was there for some time (millions of years), and then it was abruptly brought to the earth\'s surface during the formation of Kimberlite explosion pipes (Figure 1). In deposits, diamond is found in rocks of the ultrabasic composition of alkaline orientation called "Kimberlite." It is very difficult to establish the duration of the growth process of a natural crystal, especially since there are crystals that have gone through several periods of growth.',
  labGrowth:
    'In the laboratory, diamond crystallizes in two ways: the first way is in high-pressure cubic presses — HPHT method (Figure 1). The crystal grows on the seed by diffusion of carbon atoms on it (graphite is used as a source) in the melting of the catalyst metal. Here, temperature and pressure conditions are created that are close to those in which natural diamonds have grown. The duration of the process of synthesis of gem-quality crystals is 7–14 days. The second approach is in chemical deposition chambers — CVD method (Figure 1). The crystal grows from the gas phase (methane + hydrogen) on a substrate under plasma conditions. In this method, ultra-high pressures are not needed, as crystal growth is due to the chemical reaction of deposition on the diamond substrate. The synthesis process with a low quality of the crystal can last only one day.',
  midSection:
    'This is where the differences between natural and lab-grown diamonds exist. The differences between natural and lab-grown diamonds (especially diamonds) can often be identified only with the help of instrumental research methods in qualified laboratories. Below we will consider two main differences between natural and lab-grown diamonds that exist today.',
  crystalTitle: 'The shape of the crystals.',
  crystalBody:
    'This would be a very reliable and useful hallmark if the diamond came to you before the cutting/polishing process. In nature, the vast majority of diamond crystals are found in the form of flat-faced octahedrons or forms of dissolution of octahedrons. HPHT diamonds have a much richer morphology, where, in addition to the faces of the octahedron, there are faces of the cube, rhombic dodecahedron, trigontrioctahedron, etc. CVD diamonds are almost always grown on ⟨100⟩ substrates, which gives them the shape of a cube.',
  inclusionTitle: 'Inclusions.',
  inclusionBody:
    'This sign is also very important and reliable. It can be detected in both crystals and diamonds. As we have already discussed, in nature, a diamond crystallizes in the mantle. Under such conditions, it captures inclusions of other minerals that crystallize in the same environment. These are minerals of the garnet, olivine, diopside groups, and various sulfides (Figure 2). In the laboratory, the diamond is in the metal melt (HPHT) and then captures inclusions of metal carbides (Figure 2). Or, it is under plasma deposition (CVD) conditions and captures other (non-diamond) carbon phases (Figure 2).',
  fig1: 'Figure 1. Conditions for the growth of natural and lab-grown diamonds.',
  fig2: 'Figure 2. Morphology of natural and lab-grown diamond crystals.',
  fig3: 'Figure 3. Inclusions in natural and lab-grown diamonds.',
  closing1:
    'Thus, the two principal distinguishing features of natural and lab-grown diamonds are the shape of the crystal and inclusions. Further, taking these main features into account, several additional features are determined that allow the diagnosis of the origin of the stone.',
  closing2:
    'However, when the crystal is already cut and polished and has the highest clarity characteristics, a new question arises. If we do not see either the shape of the crystal or inclusions, then how is it possible to diagnose a diamond? The answer is that these differences can only be registered in a laboratory or with an experienced gemologist. They consist in the presence of impurities in the structure at the atomic level. Also, the most important feature is the zoning of the internal structure, which was formed in the process of growth (it determines the shape of the crystal). These features of the diagnosis of natural and lab-grown diamond crystals (diamonds) will be considered in the following articles.',
  authorLabel: 'Author:',
  author: 'LGDeal Gemology Department',
}

const de: DifferencesArticleLocale = {
  intro1:
    'Diamant ist ein Mineral — eine polymorphe Modifikation des Kohlenstoffs (C). Graphit und Lonsdaleit bestehen ebenfalls nur aus Kohlenstoff; der Unterschied liegt im Kristallgitter. Diamant kristallisiert im kubischen System bei sehr hohen Temperaturen und Drücken (z. B. 1600 °C und 6 GPa). Ein Labordiamant ist derselbe Diamant, nur unter Laborbedingungen gewachsen: gleiches Gitter, gleiche physikalische und chemische Eigenschaften, kubische Symmetrie. Ein Brillant ist ein geschliffener Diamant — natürlich oder gezüchtet. Streng genommen bezeichnet «Brillant» eine bestimmte Schliffart zur optimalen optischen Wirkung.',
  intro2:
    'Bei Imitationen verhält es sich anders: andere Minerale und chemische Verbindungen mit anderer Zusammensetzung, Gitter und Eigenschaften. Moissanit ist Siliciumkarbid (SiC) und unterscheidet sich deutlich vom Diamanten; er wird wegen ähnlicher optischer Eigenschaften (Dispersion, Glanz, Brechzahl) als Ersatz genutzt.',
  tableCaption: 'Tabelle 1. Einige physikalische Konstanten von Diamant und Imitationen.',
  th1: 'Mineral / Verbindung',
  th2: 'Chemische Formel',
  th3: 'Brechungsindex',
  th4: 'Spezifisches Gewicht',
  th5: 'Kristallsystem',
  th6: 'Mohs-Härte',
  rowDiamond: 'Diamant',
  rowLabDiamond: 'Labordiamant',
  rowMoissanite: 'Moissanit',
  rowCz: 'Kubischer Zirkonia',
  crystalCubic: 'Kubisch',
  crystalHexagonal: 'Hexagonal',
  afterTable:
    'Natürliche und Labordiamanten sind stofflich gleich — aber wie lassen sie sich unterscheiden, und gibt es überhaupt einen Unterschied?',
  natureGrowth:
    'Die Antwort liegt im Wachstumsprozess. In der Natur kristallisierten Diamanten tief im Mantel (≈150 km) vor Hunderten von Millionen oder Milliarden Jahren. Später gelangten sie mit Kimberlit-Rohren schnell an die Oberfläche (Abb. 1). In Lagerstätten liegen sie in ultrabasischen Gesteinen («Kimberlit»). Die Wachstumsdauer eines Naturkristalls ist schwer zu bestimmen; manche Kristalle durchliefen mehrere Wachstumsphasen.',
  labGrowth:
    'Im Labor entstehen Diamanten auf zwei Wegen: HPHT in Hochdruckpressen (Abb. 1) — der Kristall wächst auf einem Seed durch Kohlenstoffdiffusion aus Graphit in geschmolzenem Katalysator; Bedingungen ähnlich der Natur; typisch 7–14 Tage für Juwelierqualität. CVD in Gasphasenreaktoren (Methan + Wasserstoff, Plasma) auf Substrat — ohne extreme Drücke, durch chemische Abscheidung; bei schlechter Qualität kann die Synthese nur einen Tag dauern.',
  midSection:
    'Hier liegen die Unterschiede zwischen natürlichen und Labordiamanten. Oft sind instrumentelle Methoden in qualifizierten Laboren nötig. Nachfolgend zwei zentrale Merkmale.',
  crystalTitle: 'Kristallform.',
  crystalBody:
    'Sehr zuverlässig, wenn der Rohkristall vor dem Schliff vorliegt. In der Natur dominieren flächige Oktaeder oder aufgelöste Oktaederformen. HPHT-Kristalle zeigen vielfältigere Morphologie (Oktaeder, Würfel, Rhombendodekaeder, Trigoniktoeder usw.). CVD wächst meist auf ⟨100⟩-Substraten und wirkt oft würfelförmig.',
  inclusionTitle: 'Einschlüsse.',
  inclusionBody:
    'Ebenfalls wichtig und zuverlässig — im Rohkristall und im Schliff sichtbar. In der Natur kristallisiert der Diamant im Mantel und fängt gleichzeitig entstehende Minerale ein: Granat, Olivin, Diopsid, Sulfide (Abb. 2). Im Labor (HPHT) liegt Schmelze vor — metallische Karbideinschlüsse (Abb. 2). Bei CVD können andere Kohlenstoffphasen eingeschlossen werden (Abb. 2).',
  fig1: 'Abbildung 1. Bedingungen für das Wachstum natürlicher und gezüchteter Diamanten.',
  fig2: 'Abbildung 2. Morphologie natürlicher und gezüchteter Diamantkristalle.',
  fig3: 'Abbildung 3. Einschlüsse in natürlichen und gezüchteten Diamanten.',
  closing1:
    'Die beiden Hauptmerkmale sind Kristallform und Einschlüsse. Daneben leiten sich weitere Kriterien für die Herkunftsbestimmung ab.',
  closing2:
    'Ist der Stein bereits geschliffen und sehr rein, stellt sich eine neue Frage: ohne Kristallform und ohne sichtbare Einschlüsse — wie die Herkunft bestimmen? Dann sind Laborverfahren oder erfahrene Gemmologen nötig: Spuren von Verunreinigungen auf atomarer Ebene und vor allem Zonierung des inneren Wachstums. Details in weiteren Artikeln.',
  authorLabel: 'Autor:',
  author: 'Gemmologie-Abteilung LGDeal',
}

const fr: DifferencesArticleLocale = {
  intro1:
    'Le diamant est un minéral — une forme polymorphe du carbone (C). Graphite et lonsdaleite sont aussi du carbone pur ; la différence est le réseau cristallin. Le diamant cristallise dans le système cubique à très haute température et pression (ex. 1600 °C et 6 GPa). Un diamant de laboratoire est le même minéral, produit en laboratoire : même réseau, mêmes propriétés physicochimiques. Un brillant est un diamant taillé — naturel ou de laboratoire ; « brillant » désigne surtout une taille optimisant l’optique.',
  intro2:
    'Les imitations sont d’autres minéraux ou composés, de composition, réseau et propriétés différents. La moissanite est du carbure de silicium (SiC), peu comparable au diamant ; elle imite l’optique (dispersion, éclat, indice).',
  tableCaption: 'Tableau 1. Quelques constantes physiques du diamant et de ses imitations.',
  th1: 'Minéral / composé',
  th2: 'Formule chimique',
  th3: 'Indice de réfraction',
  th4: 'Densité',
  th5: 'Système cristallin',
  th6: 'Dureté Mohs',
  rowDiamond: 'Diamant',
  rowLabDiamond: 'Diamant de laboratoire',
  rowMoissanite: 'Moissanite',
  rowCz: 'Zircone cubique',
  crystalCubic: 'Cubique',
  crystalHexagonal: 'Hexagonal',
  afterTable:
    'Naturel et laboratoire partagent la même composition — comment les distinguer, et existe-t-il vraiment une différence ?',
  natureGrowth:
    'La réponse est dans la croissance. En profondeur (≈150 km), les diamants naturels ont cristallisé il y a des centaines de millions à des milliards d’années, puis remonté vite via les tuyaux kimberlitiques (fig. 1). Dans les gisements, ils se trouvent dans des roches ultrabasiques (« kimberlite »). La durée de croissance est difficile à établir ; certains cristaux ont plusieurs épisodes de croissance.',
  labGrowth:
    'Au laboratoire : HPHT dans des presses (fig. 1) — croissance sur germe par diffusion du carbone depuis le graphite dans le métal catalyseur, conditions proches de la nature, souvent 7–14 jours pour une qualité gemme. CVD en chambre gaz (méthane + hydrogène, plasma) sur substrat — sans pressions extrêmes, croissance par dépôt chimique ; une synthèse de mauvaise qualité peut durer un jour.',
  midSection:
    'C’est là qu’apparaissent les différences. Souvent, seules des méthodes instrumentales en laboratoire qualifié permettent de trancher. Voici deux critères majeurs.',
  crystalTitle: 'Forme des cristaux.',
  crystalBody:
    'Très fiable si vous avez le brut avant taille. En nature, on voit surtout des octaèdres à faces plates ou des formes d’attaque. En HPHT, la morphologie est riche (octaèdre, cube, dodécaèdre rhombique, etc.). En CVD, croissance souvent sur substrat ⟨100⟩, aspect cubique.',
  inclusionTitle: 'Inclusions.',
  inclusionBody:
    'Important et fiable, visibles sur brut ou taillé. En nature, le diamant cristallise dans le manteau et piège grenat, olivine, diopside, sulfures (fig. 2). Au laboratoire, fonte métallique HPHT → carbures métalliques (fig. 2). En CVD, autres phases carbone (fig. 2).',
  fig1: 'Figure 1. Conditions de croissance des diamants naturels et de laboratoire.',
  fig2: 'Figure 2. Morphologie des cristaux naturels et de laboratoire.',
  fig3: 'Figure 3. Inclusions dans les diamants naturels et de laboratoire.',
  closing1:
    'Les deux marqueurs principaux sont la morphologie et les inclusions ; d’autres indices en découlent pour l’origine.',
  closing2:
    'Si la pierre est déjà taillée et très pure, comment faire sans forme de cristal ni inclusions visibles ? Il faut des analyses de laboratoire ou un gemmologue expérimenté : impuretés à l’échelle atomique et zonage interne lié à la croissance. Nous y reviendrons.',
  authorLabel: 'Auteur :',
  author: 'Département de gemmologie LGDeal',
}

const zh: DifferencesArticleLocale = {
  intro1:
    '钻石是碳（C）的一种同质多象变体。石墨、朗斯代尔石也全部由碳原子构成，差异在于晶体结构。钻石在极高温高压下于立方晶系结晶（例如 1600°C、6 GPa）。培育钻石与天然钻石为同一种物质，仅在实验室中生长：晶格相同、物理化学性质一致。明亮式琢型指为获得最佳光学效果而设计的切工；天然或培育的抛光钻石都可称为「明亮式」。',
  intro2:
    '仿钻则完全不同：化学成分、晶格与物理性质都不同。例如莫桑石为碳化硅（SiC），与钻石差异很大；因其色散、光泽、折射率接近钻石而被用作仿品。',
  tableCaption: '表1：钻石与常见仿钻的部分物理常数。',
  th1: '矿物 / 化合物',
  th2: '化学式',
  th3: '折射率',
  th4: '比重',
  th5: '晶系',
  th6: '莫氏硬度',
  rowDiamond: '钻石',
  rowLabDiamond: '培育钻石',
  rowMoissanite: '莫桑石',
  rowCz: '立方氧化锆',
  crystalCubic: '立方晶系',
  crystalHexagonal: '六方晶系',
  afterTable:
    '可见天然与培育钻石在物质组成上相同——那么如何区分？二者是否真有差别？',
  natureGrowth:
    '答案在于生长过程。天然钻石在地幔深处（约150 km）经数亿至数十亿年结晶，随后通过金伯利岩筒快速到达地表（图1）。矿床中多见于超基性「金伯利岩」。天然晶体生长时长难以确定，部分晶体经历多期生长。',
  labGrowth:
    '实验室有两条路径：HPHT 高压装置（图1）——在熔融触媒中于晶种上通过碳扩散生长（石墨为碳源），条件接近天然；优质宝石级晶体常需7–14天。CVD 气相沉积（甲烷+氢气，等离子体）在衬底上生长——无需极高压力，靠化学沉积；若质量差，合成可短至一天。',
  midSection:
    '天然与培育的差异正体现在此。许多情况下需借助专业实验室的仪器方法。下面讨论两个主要差异。',
  crystalTitle: '晶体形状。',
  crystalBody:
    '若在切磨前见到原石，这是可靠特征。天然晶体多为平面八面体或溶蚀八面体形态。HPHT 晶体形貌更丰富（八面体、立方体、菱形十二面体等）。CVD 常在⟨100⟩衬底上生长，外观常呈立方体。',
  inclusionTitle: '包体。',
  inclusionBody:
    '同样重要且可靠，原石与成品均可观察。天然钻石在地幔中结晶，可包裹石榴石、橄榄石、辉石及各类硫化物等（图2）。实验室 HPHT 处于金属熔体中，可包裹金属碳化物（图2）。CVD 条件下可包裹其他非钻石碳相（图2）。',
  fig1: '图1：天然与培育钻石的生长条件。',
  fig2: '图2：天然与培育钻石晶体形貌。',
  fig3: '图3：天然与培育钻石中的包体。',
  closing1:
    '两大核心识别特征是晶体形貌与包体；据此还可衍生其他判断产地的线索。',
  closing2:
    '若石头已切磨且净度极高，既看不到晶体外形也看不到包体，如何鉴定？需实验室或资深宝石学家：原子尺度的杂质与生长形成的内部结构分带等。后续文章再详述。',
  authorLabel: '作者：',
  author: 'LGDeal 宝石学部门',
}

const ja: DifferencesArticleLocale = {
  intro1:
    'ダイヤモンドは炭素（C）の多形の一つです。黒鉛やロンズデイルタイトも炭素のみですが、格子配列が異なります。ダイヤモンドは極めて高温高圧で立方晶系に結晶します（例：1600°C、6 GPa）。ラボグロウンは同じ鉱物で、実験室で育成されたものにすぎません。格子も物性も同一です。ブリリアントは研磨されたダイヤモンド（天然・ラボグロウン）を指し、光学特性を最大にするカット様式を意味します。',
  intro2:
    '模造品は別の鉱物・化合物で、組成・格子・物性が根本的に異なります。モアサナイトは炭化ケイ素（SiC）で、ダイヤモンドとは大きく違います。分散・輝き・屈折率が似ているため代用品にされます。',
  tableCaption: '表1. ダイヤモンドと模造石の主な物理定数',
  th1: '鉱物 / 化合物',
  th2: '化学式',
  th3: '屈折率',
  th4: '比重',
  th5: '結晶系',
  th6: 'モース硬度',
  rowDiamond: 'ダイヤモンド',
  rowLabDiamond: 'ラボグロウンダイヤモンド',
  rowMoissanite: 'モアサナイト',
  rowCz: 'キュービックジルコニア',
  crystalCubic: '立方晶系',
  crystalHexagonal: '六方晶系',
  afterTable:
    '天然もラボグロウンも物質として同一ですが、どう区別するのか、違いは何か。',
  natureGrowth:
    '答えは成長プロセスにあります。天然はマントル深部（約150 km）で数億〜数十億年前に結晶し、キンバーライト管などで地表へ（図1）。鉱床では超塩基性の「キンバーライト」岩に含まれます。成長期間の確定は難しく、複数成長期を経た結晶もあります。',
  labGrowth:
    '実験室では二通り：HPHT（図1）— 触媒金属中でシード上に炭素拡散（黒鉛源）、天然に近い条件、宝石級は7〜14日程度。CVD—メタン+水素プラズマで基板上に気相成長、超高圧不要、化学堆積；品質が悪ければ一日で終わることもあります。',
  midSection:
    'ここに天然とラボグロウンの差が現れます。多くの場合、資格のあるラボの機器分析が必要です。以下、二つの主な違いです。',
  crystalTitle: '結晶の形。',
  crystalBody:
    '研磨前の原石なら非常に信頼できる特徴です。天然は平面八面体や溶食形が多いです。HPHTは八面体・立方体・菱形十二面体など形態が豊富。CVDは⟨100⟩基板上で立方体状になりやすいです。',
  inclusionTitle: 'インクルージョン。',
  inclusionBody:
    '原石・製品の両方で重要です。天然はマントルで結晶化し、ガーネット・オリビン・輝石・硫化物などを取り込みます（図2）。HPHTは金属溶体中で金属炭化物を取り込み（図2）。CVDでは別の炭素相を取り込むことも（図2）。',
  fig1: '図1. 天然石とラボグロウンの成長条件。',
  fig2: '図2. 天然石とラボグロウン結晶の形態。',
  fig3: '図3. 天然石とラボグロウンに見られる包有物。',
  closing1:
    '二つの主要な識別点は結晶形態とインクルージョンです。これらを手がかりに、産地診断の補助特徴も判断されます。',
  closing2:
    'すでに研磨され高純度で、結晶形もインクルージョンも見えない場合は？高度なラボ検査か熟練の宝石鑑定士が必要です。原子レベルの不純物と、成長に伴う内部ゾーニングが鍵となります。詳細は別稿で。',
  authorLabel: '著者：',
  author: 'LGDeal 宝石学部門',
}

const hi: DifferencesArticleLocale = {
  intro1:
    'हीरा कार्बन (C) का बहुरूपी खनिज है। ग्रेफाइट आदि भी कार्बन हैं; अंतर क्रिस्टल जाल में है। हीरा उच्च ताप-दाब पर घन सममिति में क्रिस्टलाइज होता है (उदा. 1600°C, 6 GPa)। लैब-ग्रोन वही हीरा है, केवल प्रयोगशाला में उगाया गया। कटा हुआ पत्थर प्राकृतिक या लैब-ग्रोन — «ब्रिलियंट» मुख्यतः कट प्रकार को दर्शाता है।',
  intro2:
    'नकली पत्थर अलग खनिज/यौगिक हैं। मोइसानाइट सिलिकॉन कार्बाइड (SiC) है; हीरे से भिन्न। प्रकाशीय गुणों के कारण नकल के रूप में उपयोग।',
  tableCaption: 'तालिका 1. हीरे और उसकी नकल के कुछ भौतिक स्थिरांक।',
  th1: 'खनिज / यौगिक',
  th2: 'रासायनिक सूत्र',
  th3: 'अपवर्तनांक',
  th4: 'विशिष्ट गुरुत्व',
  th5: 'क्रिस्टल प्रणाली',
  th6: 'मोह्स कठोरता',
  rowDiamond: 'डायमंड',
  rowLabDiamond: 'लैब-ग्रोन डायमंड',
  rowMoissanite: 'मोइसानाइट',
  rowCz: 'क्यूबिक जिरकोनिया',
  crystalCubic: 'क्यूबिक',
  crystalHexagonal: 'हेक्सागोनल',
  afterTable:
    'प्राकृतिक और लैब-ग्रोन सामग्री में समान — फिर अंतर कैसे पहचानें?',
  natureGrowth:
    'उत्तर वृद्धि प्रक्रिया में है। प्राकृतिक हीरे मैंटल (~150 km गहराई) में अरबों वर्ष पहले बने, फिर किंबरलाइट पाइपों से सतह पर (चित्र 1)। निक्षेप अल्ट्राबेसिक «किंबरलाइट» चट्टानों में। वृद्धि अवधि निर्धारित करना कठिन है।',
  labGrowth:
    'प्रयोगशाला में दो तरीके: HPHT (चित्र 1) — उच्च दाब प्रेस में सीड पर कार्बन प्रसार, प्राकृतिक जैसी स्थितियां, 7–14 दिन। CVD — मीथेन+हाइड्रोजन प्लाज्मा में सब्सट्रेट पर, रासायनिक निक्षेप; खराब गुणवत्ता में एक दिन भी।',
  midSection:
    'यहीं प्राकृतिक और लैब-ग्रोन में अंतर है। अक्सर योग्य प्रयोगशाला उपकरण चाहिए। दो मुख्य अंतर नीचे।',
  crystalTitle: 'क्रिस्टल का आकार।',
  crystalBody:
    'कटाई से पहले रॉ क्रिस्टल मिले तो बहुत विश्वसनीय। प्रकृत में अक्सर समतल अष्टफलक या घुलन रूप। HPHT में अधिक मॉर्फोलॉजी (अष्टफलक, घन, रोम्बिक डोडेकाहेड्रन)। CVD अक्सर ⟨100⟩ सब्सट्रेट पर घन जैसा।',
  inclusionTitle: 'इंक्लूजन्स।',
  inclusionBody:
    'महत्वपूर्ण और विश्वसनीय। प्राकृतिक मैंटल में बनते समय गार्नेट, ऑलिविन, डायोपसाइड, सल्फाइड आदि फंसते हैं (चित्र 2)। HPHT में धातु पिघल — धातु कार्बाइड (चित्र 2)। CVD में अन्य कार्बन फेज (चित्र 2)।',
  fig1: 'चित्र 1. प्राकृतिक और लैब-ग्रोन हीरे की वृद्धि स्थितियां।',
  fig2: 'चित्र 2. प्राकृतिक और लैब-ग्रोन क्रिस्टल की मॉर्फोलॉजी।',
  fig3: 'चित्र 3. प्राकृतिक और लैब-ग्रोन में इंक्लूजन्स।',
  closing1:
    'दो मुख्य पहचान विशेषताएं क्रिस्टल आकार और इंक्लूजन्स हैं; इनसे उत्पत्ति निदान में अन्य संकेत मिलते हैं।',
  closing2:
    'यदि पत्थर कट-पॉलिश हो और उच्च क्लैरिटी हो तो? प्रयोगशाला या अनुभवी जेमोलॉजिस्ट — परमाणु स्तर अशुद्धियां और वृद्धि ज़ोनिंग। विवरण आगे के लेखों में।',
  authorLabel: 'लेखक:',
  author: 'LGDeal जेमोलॉजी विभाग',
}

export const differencesArticleLocales: Record<Locale, DifferencesArticleLocale> = {
  en,
  de,
  fr,
  zh,
  ja,
  hi,
}
