import type { Locale } from '../../../i18n/types';

export interface ColorGradingArticleLocale {
  sourceLabel: string
  intro: string
  headingAssess: string
  colorlessTitle: string
  colorlessBody: string
  fancyTitle: string
  fancyBody: string
  instrumental: string
  gradation: string
  headingCost: string
  cost1: string
  cost2: string
  cost3: string
  closing1: string
  closing2: string
  closing3: string
  fig1Caption: string
  fig1Source: string
  fig2Caption: string
  fig2Source: string
  authorLabel: string
  author: string
}

const en: ColorGradingArticleLocale = {
  sourceLabel: 'Source',
  intro:
    'Having considered the main mechanisms for the formation of fancy colors of laboratory-grown diamonds, we smoothly move on to how to correctly characterize the color of such a stone, because the color of a diamond is the key factor that most strongly affects its value. In assessing the color of synthetic diamonds, as well as in the mechanisms of color appearance, one cannot get away from their natural counterparts. The color grading of any diamond is predominantly made according to the GIA systems developed for natural stones. But this is good, there is no need to come up with new classification systems, assessment tables — everything is ready, you just need to adapt a little to the specifics of the grown diamonds. Color is a subjective characteristic visually determined by the human eye and located in the visible range of the electromagnetic spectrum. A particular color is determined by the wavelength of the observed radiation. There are three characteristics for describing color: hue, lightness, and saturation. The term "fancy" means a rare or attractive intense color, used to describe the combined effect of hue and saturation.',
  headingAssess: 'How do I correctly assess the color of a diamond?',
  colorlessTitle: 'Evaluation of colorless diamonds',
  colorlessBody:
    'in gemological practice is carried out under a D65 lamp with a color temperature of 6500 K, on a white paper tray and using standards. The diamond is positioned spike upwards at a 45° angle of view (in the case of LGD, sometimes they look through the platform too), to the left and to the right of it, two reference stones that are closest in color are placed. Also, gemologists sometimes use a colorimeter — a device designed to determine the color (D–L) of a diamond by measuring the values of absorption and transmission in the visible part of the electromagnetic radiation spectrum.',
  fancyTitle: 'Fancy colors of diamonds',
  fancyBody:
    'are evaluated under all the same conditions as colorless ones, but with the platform up. For a rigorous assessment, the laboratory uses a viewing cabinet — a spacious chamber of about 0.5 m³ with special lighting and walls in a neutral color.',
  instrumental:
    'Now, instrumental methods for assessing color with computer data processing are also being developed — this is an analysis of the absorption spectra of diamonds in the visible region, the selection of corners that emphasize the color as much as possible for cutting a stone, an analysis of the resulting color by the coordinates of the color space. Because fancy diamond colors are unique and have an incredible range of shades, they cannot be compiled as a compact set of reference stones. Therefore, Munsell\'s atlas of colors is used as color standards — a book with pages in the form of plastic sheets with cells in which colored color swatches are inserted. Each sample in this atlas has its own coordinates in terms of hue, lightness and saturation. For example, a sample chip with coordinates 5Y7/4 will have a description for a hue of 5Y (yellow), lightness 7 (light), and saturation /4 (negligible). The comparison method is used to select a chip sample that is as close as possible in color to the diamond under study. The GIA system adapted Munsell\'s atlas to its requirements in diamond grading, resulting in 27 color tone names and about 9 lightness and saturation groups.',
  gradation:
    'The color gradation of laboratory-grown diamonds in terms of lightness and saturation (i.e., according to the degree of "fancy") generally consists of the following groups and in the following sequence: a number of colorless (D–Z), then a gradual increase in one or another color in terms of tone and saturation — the Faint, Very Light and Light, then fancy colors — Fancy (Light, Intense, Vivid, Deep, Dark). After this description, the name of the color tone is substituted, for example, Fancy Light Blue. Sometimes there is an additional shade, it is placed in the name before the main color (for example, Fancy Intense Purplish Pink).',
  headingCost: 'The cost of laboratory-grown fancy color diamonds',
  cost1:
    'In the laboratory-grown diamond market, there is no price gap between colored and colorless diamonds that exists in natural stones. Quite often, a premium to a lab-grown colored diamond is placed relative to the same (by weight and shape) diamond of color D (for example, a cushion 3.05 ct Fancy Vivid Blue diamond may have a 20–30% premium to the value of the price of the same diamond of color D). The complexity and cost of production of colorless, yellow, blue LGDs are almost the same, therefore their price cannot differ by much. Pink is a little more complicated, because the price of irradiation and annealing of this stone (about $100/ct) is added to the price of a yellow diamond.',
  cost2:
    'The most expensive group is Fancy — stones with a distinct fancy color throughout the entire volume of the stone. The most expensive positions among the Fancy group are Intense and Vivid, for such stones a more significant premium to the cost can go (you need not only to grow a colored crystal, but also to correctly cut it, emphasize the color). The most attractive and trendy colors among LGD are pink, yellow, blue. Colorless stones are always in trend, they are classics.',
  cost3:
    'Colors with prefixes Faint, Light and Dark are not attractive to buyers, therefore the cost of diamonds of this color is lower than colorless (D–F) and it is more difficult to sell such stones. For example, colorless stones with a very weak Faint Blue color are sold either at a higher discount, or at the price of low colors of the colorless range. The variation in shades of natural diamonds is wider than that of synthetic stones. This is due to the fact that each natural stone contains a unique inimitable set of admixtures, sealed in its structure, like DNA. And in laboratory-grown diamonds, we can control the concentration of impurities and, accordingly, the color.',
  closing1:
    'This is much more convenient for the jewelry market — you can easily pick up a necklace with perfectly color-calibrated fancy diamonds.',
  closing2:
    'Thus, the assessment of fancy colors of laboratory-grown diamonds requires additional equipment and the qualifications of a gemologist, however, reproducible colors are often found on laboratory-grown diamonds and this simplifies the work.',
  closing3:
    'For a complete description of the color, you need to correctly determine the tone and degree of fancy of the stone (lightness + saturation). The cost of the best colored LGDs is higher than colorless (D–F), but not significantly (not several orders of magnitude higher). Pink, canary and blue remain the most sought-after colors on the market. LGD color has a significant impact on the visual characteristics of the jewelry and the aesthetics of its perception.',
  fig1Caption: 'Color tones of fancy diamonds according to the GIA system',
  fig1Source: 'J.M. King, GIA colored diamonds, color reference charts',
  fig2Caption:
    'Gradation of orangy pink diamonds by lightness and saturation — according to the degree of fancy (from Faint to Fancy Deep)',
  fig2Source: 'J.M. King, GIA colored diamonds, color reference charts.',
  authorLabel: 'Author:',
  author: 'LGDeal Gemology Department',
}

const de: ColorGradingArticleLocale = {
  sourceLabel: 'Quelle',
  intro:
    'Nach den wichtigsten Mechanismen der Entstehung von Fancy-Farben bei Labor­diamanten erläutern wir, wie man die Farbe eines solchen Steins korrekt beschreibt — denn die Farbe ist der stärkste Werttreiber. Bei synthetischen Diamanten gelten dieselben Grundsätze wie bei Naturdiamanten: Die Farbklassifizierung folgt überwiegend den GIA-Systemen für Natursteine. Es müssen keine neuen Systeme erfunden werden — man passt sich nur den Besonderheiten gezüchteter Diamanten an. Farbe ist subjektiv und wird visuell im sichtbaren Spektrum bewertet; sie hängt von der Wellenlänge ab. Beschrieben werden Farbton, Helligkeit und Sättigung. «Fancy» bezeichnet eine seltene oder besonders attraktive intensive Farbe — die kombinierte Wirkung von Farbton und Sättigung.',
  headingAssess: 'Wie bewertet man die Farbe eines Diamanten korrekt?',
  colorlessTitle: 'Bewertung farbloser Diamanten',
  colorlessBody:
    'erfolgt in der gemmologischen Praxis unter einer D65-Lampe (6500 K) auf weißem Papier mit Referenzsteinen. Der Diamant liegt mit der Spitze nach oben unter etwa 45° (bei LGD teils auch durch die Tafel); links und rechts liegen die farblich nächsten Referenzsteine. Zusätzlich kommt gelegentlich ein Kolorimeter zum Einsatz — ein Gerät zur Bestimmung der Farbe (D–L) über Absorption und Transmission im sichtbaren Spektrum.',
  fancyTitle: 'Fancy-Farben von Diamanten',
  fancyBody:
    'werden unter denselben Bedingungen wie farblose Steine bewertet, jedoch mit der Tafel nach oben. Für eine strenge Bewertung nutzt das Labor oft einen Betrachtungsschrank — eine große Kammer (~0,5 m³) mit spezieller Beleuchtung und neutralen Wänden.',
  instrumental:
    'Instrumentelle Methoden mit Datenverarbeitung werden weiterentwickelt: Analyse der Absorptionsspektren im Sichtbaren, Wahl von Facettenlagen zur optimalen Farbwirkung, Auswertung der Farbe in Farbräumen. Da Fancy-Farben einzigartig sind und riesige Farbspannen haben, gibt es keine kompakte Referenzsteinsammlung. Stattdessen dient Munsells Farbatlas als Standard — Plastikfolien mit Farbfeldern. Jedes Feld hat Koordinaten für Farbton, Helligkeit und Sättigung (z. B. 5Y7/4). Per Vergleich wählt man die nächstliegende Farbfeldfolie. GIA hat Munsell an die Diamantbewertung angepasst — etwa 27 Farbtonnamen und rund 9 Helligkeits-/Sättigungsgruppen.',
  gradation:
    'Die Farbabstufung von Labor­diamanten nach Helligkeit und Sättigung («Fancy-Grad») folgt typischerweise: farblos (D–Z), dann zunehmend getönt — Faint, Very Light, Light, dann Fancy (Light, Intense, Vivid, Deep, Dark). Anschließend der Farbtonname, z. B. Fancy Light Blue; Zusätzliche Nuancen stehen vor dem Hauptfarbe-Namen (z. B. Fancy Intense Purplish Pink).',
  headingCost: 'Preise von Fancy-Farb-Labordiamanten',
  cost1:
    'Auf dem Markt für Labor­diamanten gibt es nicht die große Preisschere zwischen farbig und farblos wie bei Naturdiamanten. Oft wird ein Aufschlag auf einen farbigen Labordiamanten gegenüber dem gleichen (Gewicht, Form) D-Farben-Stein gelegt (z. B. 3,05 ct Fancy Vivid Blue Kissen +20–30 % gegenüber D). Die Produktionskosten farbloser, gelber und blauer LGD sind ähnlich, daher bleiben die Preise nah beieinander. Pink ist etwas komplexer, weil Bestrahlung und Tempern (~100 $/ct) zum Gelb-Preis addiert werden.',
  cost2:
    'Die teuerste Gruppe ist Fancy — durchgehende, kräftige Fancy-Farbe. Innerhalb Fancy sind Intense und Vivid oft am teuersten (Zuschnitt muss die Farbe betonen). Gefragt sind rosa, gelb, blau; farblose bleiben zeitlos gefragt.',
  cost3:
    'Faint-, Light- und Dark-Präfixe sind für Käufer weniger attraktiv; solche Steine sind oft günstiger als D–F und schwerer zu verkaufen. Sehr schwaches Faint Blue wird mit Abschlag oder wie niedrige Nähe zu farblos bewertet. Naturdiamanten haben eine breitere Farbvariation, weil jeder Stein eine einzigartige «DNA» an Fremdatomen trägt. Bei Labor­diamanten lässt sich die Fremdatomkonzentration steuern.',
  closing1:
    'Für den Schmuckmarkt ist das praktisch — Ketten mit perfekt kalibrierten Fancy-Farb-Labordiamanten lassen sich leichter zusammenstellen.',
  closing2:
    'Die Bewertung von Fancy-Farben bei Labor­diamanten erfordert zusätzliche Geräte und Expertise, doch reproduzierbare Farben vereinfachen die Arbeit oft.',
  closing3:
    'Für eine vollständige Beschreibung müssen Farbton und Fancy-Grad (Helligkeit + Sättigung) stimmen. Die besten farbigen LGD sind teurer als D–F, aber nicht um Größenordnungen. Rosa, Kanariengelb und Blau bleiben gefragt. Die Farbe prägt die Wirkung des Schmucks.',
  fig1Caption: 'Farbtöne von Fancy-Diamanten nach dem GIA-System',
  fig1Source: 'J.M. King, GIA colored diamonds, color reference charts',
  fig2Caption:
    'Abstufung orangy-pinker Diamanten nach Helligkeit und Sättigung — Fancy-Grad (von Faint bis Fancy Deep)',
  fig2Source: 'J.M. King, GIA colored diamonds, color reference charts.',
  authorLabel: 'Autor:',
  author: 'Gemmologie-Abteilung LGDeal',
}

const fr: ColorGradingArticleLocale = {
  sourceLabel: 'Source',
  intro:
    'Après les mécanismes de formation des couleurs fancy des diamants de laboratoire, voyons comment décrire correctement la couleur : c’est le principal facteur de valeur. Pour les diamants synthétiques comme pour les naturels, les mécanismes de couleur sont comparables. La notation suit surtout les systèmes GIA développés pour les pierres naturelles — pas besoin de réinventer des tables. La couleur est subjective, perçue dans le spectre visible ; elle dépend de la longueur d’onde. On décrit la teinte, la luminosité et la saturation. « Fancy » désigne une couleur rare ou intense, combinant effet de teinte et de saturation.',
  headingAssess: 'Comment évaluer correctement la couleur d’un diamant ?',
  colorlessTitle: 'Évaluation des diamants incolores',
  colorlessBody:
    'en pratique gemmologique sous lampe D65 (6500 K), sur plateau blanc et avec des pierres étalon. Le diamant est posé pointe vers le haut sous environ 45° (parfois table vers le haut pour les LGD) ; à gauche et à droite, les deux étalons les plus proches. Un colorimètre peut aussi mesurer la couleur (D–L) via absorption et transmission dans le visible.',
  fancyTitle: 'Couleurs fancy des diamants',
  fancyBody:
    'sont évaluées dans les mêmes conditions que les incolores, mais table vers le haut. Pour une évaluation stricte, un caisson de vision (~0,5 m³) avec éclairage spécial et parois neutres est utilisé.',
  instrumental:
    'Des méthodes instrumentales avec traitement informatique se développent : spectres d’absorption, choix de facettes pour maximiser la couleur, coordonnées dans l’espace colorimétrique. Les fancy couvrent trop de nuances pour une série compacte d’étalons ; on utilise l’atlas Munsell — feuilles de pastilles. Chaque pastille a des coordonnées de teinte, luminosité et saturation (ex. 5Y7/4). On compare à la pastille la plus proche. GIA a adapté Munsell à la notation diamant — environ 27 noms de teinte et 9 groupes luminosité/saturation.',
  gradation:
    'La gradation des diamants de laboratoire en luminosité/saturation (« degré fancy ») suit en général : incolore (D–Z), puis Faint, Very Light, Light, puis Fancy (Light, Intense, Vivid, Deep, Dark), puis le nom de teinte, ex. Fancy Light Blue ; une nuance supplémentaire peut précéder le nom (ex. Fancy Intense Purplish Pink).',
  headingCost: 'Coût des diamants fancy de laboratoire',
  cost1:
    'Sur le marché du laboratoire, l’écart de prix entre coloré et incolore n’est pas celui du naturel. Un diamant coloré de laboratoire peut porter une prime par rapport au même poids/forme en D (ex. coussin 3,05 ct Fancy Vivid Blue +20–30 % vs D). Produire incolore, jaune ou bleu coûte peu différent ; le rose ajoute irradiation et recuit (~100 $/ct) au jaune.',
  cost2:
    'Le segment le plus cher est Fancy — couleur fancy claire dans toute la pierre. Intense et Vivid sont souvent les plus valorisés (taille doit souligner la couleur). Tendances : rose, jaune, bleu ; l’incolore reste classique.',
  cost3:
    'Les préfixes Faint, Light et Dark attirent moins ; les prix sont souvent sous D–F et la vente est plus dure. Un très léger Faint Blue peut être fortement discouté ou classé comme bas de gamme incolore. Les nuances naturelles sont plus variées car chaque pierre a un « ADN » d’impuretés unique ; en laboratoire on contrôle la concentration.',
  closing1:
    'C’est pratique pour la joaillerie — on peut assortir un collier de diamants fancy parfaitement calibrés.',
  closing2:
    'Évaluer le fancy demande équipement et expertise, mais des couleurs reproductibles simplifient souvent le travail.',
  closing3:
    'Pour une description complète, il faut teinte et degré fancy (luminosité + saturation). Les meilleurs LGD colorés dépassent D–F, mais sans écarts énormes. Rose, jaune canari et bleu restent demandés. La couleur impacte fortement l’aspect du bijou.',
  fig1Caption: 'Nuances de couleur des diamants fancy selon le système GIA',
  fig1Source: 'J.M. King, GIA colored diamonds, color reference charts',
  fig2Caption:
    'Graduation des diamants orangé-rose selon luminosité et saturation — degré fancy (de Faint à Fancy Deep)',
  fig2Source: 'J.M. King, GIA colored diamonds, color reference charts.',
  authorLabel: 'Auteur :',
  author: 'Département de gemmologie LGDeal',
}

const zh: ColorGradingArticleLocale = {
  sourceLabel: '来源',
  intro:
    '在了解培育钻石彩色的主要成因后，我们接着讨论如何正确描述其颜色——颜色是最强价值驱动因素。合成钻石的颜色评估与天然石共享同一套逻辑，分级主要依据为天然石建立的 GIA 体系。无需另起炉灶，只需针对培育钻石的特点稍作调整。颜色是主观视觉特征，位于可见光谱范围；具体颜色由波长决定。描述维度包括色调、明度与饱和度。「Fancy」指稀有或强烈吸引人的颜色，是色调与饱和度综合呈现的效果。',
  headingAssess: '如何正确评估钻石颜色？',
  colorlessTitle: '无色钻石的评估',
  colorlessBody:
    '在宝石学实践中通常使用色温 6500 K 的 D65 光源、白纸托盘与比色石。钻石以尖端朝上约 45° 观察（培育钻有时也可从台面观察）；左右放置最接近的参考石。宝石学家亦使用色度计，通过可见光吸收与透射测量判定 D–L 色级。',
  fancyTitle: '彩钻（Fancy）颜色',
  fancyBody:
    '与无色钻条件相同，但台面朝上。为严格评估，实验室通常使用观察箱——约 0.5 m³ 的密闭空间，配中性墙面与标准照明。',
  instrumental:
    '仪器方法也在发展：可见光吸收光谱、为突出颜色而选择的切割角度、色度空间坐标分析等。由于 Fancy 颜色独特且范围极广，难以用少量比色石覆盖，因此使用 Munsell 色标册——塑料片页上的色块。每块有色调、明度、饱和度坐标（例如 5Y7/4）。通过比对选取最接近的色块。GIA 将 Munsell 适配到钻石分级，形成约 27 种色调名与约 9 组明度/饱和度。',
  gradation:
    '培育钻石按明度与饱和度（即「彩度」程度）的分级一般依次为：无色段（D–Z），再渐强为 Faint、Very Light、Light，接着 Fancy（Light、Intense、Vivid、Deep、Dark），再冠以色调名，如 Fancy Light Blue；若需描述副色，可放在主色之前，如 Fancy Intense Purplish Pink。',
  headingCost: '培育彩钻的价格',
  cost1:
    '在培育市场，彩色与无色之间的价差通常不像天然石那样悬殊。彩色培育钻相对同尺寸同琢型的 D 色常有一定溢价（例如 3.05 ct Fancy Vivid Blue 枕形可能比同 D 色高 20–30%）。无色、黄、蓝培育钻的生产成本接近，因此价差不大。粉色更复杂，因辐照与退火费用（约每克拉 100 美元）会叠加在黄钻之上。',
  cost2:
    '最贵的类别是 Fancy——整颗石体呈现清晰彩钻色。Fancy 中 Intense、Vivid 往往溢价最高（需生长彩色晶体并正确切磨以突出颜色）。市场热门颜色为粉、黄、蓝；无色钻始终是经典。',
  cost3:
    '带 Faint、Light、Dark 前缀的颜色对买家吸引力较低，价格常低于 D–F，也更难销售。例如极弱的 Faint Blue 可能大幅折扣或按接近无色低段定价。天然钻石的色调变化更宽，因为每颗石的杂质组合像 DNA 一样独特；而培育钻可控制杂质浓度。',
  closing1:
    '这对珠宝市场更友好——更容易配齐颜色高度一致的 Fancy 彩钻项链。',
  closing2:
    '因此，评估培育钻石的 Fancy 颜色需要额外设备与鉴定师经验，但可重复出现的颜色往往让工作更简单。',
  closing3:
    '完整描述颜色需正确判定色调与彩度（明度 + 饱和度）。顶级彩色 LGD 价格高于 D–F，但不会出现数量级差距。粉、金丝雀黄与蓝仍是市场最抢手颜色。颜色深刻影响珠宝观感与美学。',
  fig1Caption: 'GIA 体系中的彩钻色调',
  fig1Source: 'J.M. King, GIA colored diamonds, color reference charts',
  fig2Caption: '橙粉钻按明度与饱和度分级——从 Faint 到 Fancy Deep 的彩度变化',
  fig2Source: 'J.M. King, GIA colored diamonds, color reference charts.',
  authorLabel: '作者：',
  author: 'LGDeal 宝石学部门',
}

const ja: ColorGradingArticleLocale = {
  sourceLabel: '出典',
  intro:
    'ラボグロウンのファンシーカラーが形成される主なメカニズムを踏まえ、次に色の記述方法を整理します。色は価値を最も左右する要素です。合成ダイヤも天然石と同様の発色メカニズムを持ち、グレーディングは主に天然石向けに開発された GIA 系の基準に沿います。新しい分類表を作る必要はなく、ラボグロウンの特性に合わせて調整すれば十分です。色は可視領域で肉眼観察される主観的な特性であり、波長で表されます。色相・明度・彩度の三要素で記述します。「ファンシー」は希少で魅力的な強い色を指し、色相と彩度の総合的な効果を表します。',
  headingAssess: 'ダイヤモンドの色を正しく評価するには？',
  colorlessTitle: '無色ダイヤの評価',
  colorlessBody:
    '宝石学では D65 ランプ（6500 K）、白紙トレイ、マスターストーンを用います。ダイヤはポイントアップで約 45°（LGD ではテーブル方向も見る場合あり）に置き、左右に最も近い色の基準石を配置します。色度計で可視光の吸収・透過を測り D–L を判定することもあります。',
  fancyTitle: 'ファンシーカラーダイヤ',
  fancyBody:
    'は無色と同様の条件で評価しますが、テーブルアップです。厳密な評価では、約 0.5 m³ の観察ボックス（特別照明・中性壁）を用います。',
  instrumental:
    '機器による評価も進展しています。可視領域の吸収スペクトル、色を最大限に引き出すためのファセット選択、色空間座標による解析など。ファンシーカラーは多様なため、少数の基準石セットでは足りず、マンセルのアトラスを色標として使用します。各チップは色相・明度・彩度の座標を持ちます（例：5Y7/4）。比較対象に最も近いチップを選びます。GIA はマンセルをダイヤ向けに適用し、約 27 の色相名と約 9 グループの明度・彩度に整理しました。',
  gradation:
    'ラボグロウンの明度・彩度（ファンシー度）の段階は、まず無色（D–Z）、次に Faint、Very Light、Light、そして Fancy（Light、Intense、Vivid、Deep、Dark）へと進みます。その後に色相名が付きます（例：Fancy Light Blue）。補助的な色相は主色の前に置かれます（例：Fancy Intense Purplish Pink）。',
  headingCost: 'ラボグロウン・ファンシーカラーの価格',
  cost1:
    'ラボグロウン市場では、天然石のような無色と有色の巨大な価格差は通常ありません。同じ重量・形状の D 色と比較してプレミアムが乗る（例：3.05 ct Fancy Vivid Blue クッションが D より 20–30% 高いなど）こともあります。無色・黄・青の生産コストはほぼ同等で、価格は近いです。ピンクは照射・アニール（約 100$/ct）が黄系に上乗せされやや複雑です。',
  cost2:
    '最も高価なのは Fancy で、全体にファンシーカラーがはっきりした石です。Intense や Vivid は特に高く、色を育てるだけでなくカットで色を強調する必要があります。人気はピンク・イエロー・ブルー、無色は不変の定番です。',
  cost3:
    'Faint、Light、Dark などの接頭辞は買い手に響きにくく、D–F より安く売りにくいこともあります。ごく弱い Faint Blue は大きく値引きされるか、無色低グレード相当の価格になります。天然石は不純物の組み合わせが「DNA」のようにユニークで色幅が広い一方、ラボグロウンでは不純物濃度を制御できます。',
  closing1:
    'ジュエリー市場では、色揃えされたファンシーカラーのネックレスを組みやすいという利点があります。',
  closing2:
    'ファンシーカラーの評価には専用機器と宝石学の資格が必要ですが、再現性の高い色は作業を簡素化します。',
  closing3:
    '完整な説明には色相とファンシー度（明度＋彩度）の正確な把握が必要です。最高級の有色 LGD は D–F より高いが桁違いではありません。ピンク、カナリーイエロー、ブルーは引き続き需要が高く、色は宝飾の視覚的印象と美学に大きく影響します。',
  fig1Caption: 'GIA システムにおけるファンシーダイヤの色調',
  fig1Source: 'J.M. King, GIA colored diamonds, color reference charts',
  fig2Caption:
    'オレンジピンク系の明度・彩度によるグラデーション（Faint から Fancy Deep までのファンシー度）',
  fig2Source: 'J.M. King, GIA colored diamonds, color reference charts.',
  authorLabel: '著者：',
  author: 'LGDeal 宝石学部門',
}

const hi: ColorGradingArticleLocale = {
  sourceLabel: 'स्रोत',
  intro:
    'लैब-ग्रोन फैंसी रंगों के मुख्य तंत्र के बाद, अब हम रंग का सही वर्णन करते हैं — रंग मूल्य को सबसे अधिक प्रभावित करता है। सिंथेटिक डायमंड के लिए भी प्राकृतिक पत्थरों जैसे ही मूल सिद्धांत लागू होते हैं; ग्रेडिंग मुख्यतः GIA प्रणालियों पर आधारित है। नया वर्गीकरण बनाने की जरूरत नहीं — बस लैब-ग्रोन की विशेषताओं के अनुकूलन की जरूरत है। रंग दृश्य स्पेक्ट्रम में सब्जेक्टिव है; तरंगदैर्घ्य से परिभाषित। विवरण में ह्यू, टोन और सैचुरेशन शामिल हैं। «Fancy» दुर्लभ या तीव्र आकर्षक रंग को दर्शाता है।',
  headingAssess: 'डायमंड का रंग सही तरीके से कैसे आंकें?',
  colorlessTitle: 'कलरलेस डायमंड का मूल्यांकन',
  colorlessBody:
    'जेमोलॉजिकल अभ्यास में D65 लैंप (6500 K), सफेद ट्रे और मास्टर स्टोन का उपयोग होता है। डायमंड नोक ऊपर ~45° पर रखा जाता है (LGD में कभी-कभी टेबल से भी); दोनों ओर निकटतम रेफरेंस स्टोन। कलरिमीटर से D–L रंग स्तर निर्धारित किया जा सकता है।',
  fancyTitle: 'फैंसी रंगों वाले डायमंड',
  fancyBody:
    'को वही शर्तों में आंका जाता है, लेकिन टेबल ऊपर की ओर। सख्त मूल्यांकन के लिए ~0.5 m³ का देखने वाला बॉक्स — विशेष प्रकाश और तटस्थ दीवारें — उपयोग होता है।',
  instrumental:
    'कंप्यूटर प्रोसेसिंग के साथ इंस्ट्रूमेंटल विधियां विकसित हो रही हैं: दृश्य अवशोषण स्पेक्ट्रा, कटिंग कोणों का चयन, रंग स्थान निर्देशांक। फैंसी रंग इतने विविध हैं कि कॉम्पैक्ट रेफरेंस सेट संभव नहीं; इसलिए मन्सेल एटलास — प्लास्टिक शीटों पर रंग स्वैच। प्रत्येक चिप में ह्यू, टोन, सैचुरेशन निर्देशांक होते हैं (उदा. 5Y7/4)। GIA ने मन्सेल को डायमंड ग्रेडिंग के लिए अनुकूलित किया — लगभग 27 ह्यू नाम और ~9 लाइटनेस/सैचुरेशन समूह।',
  gradation:
    'लैब-ग्रोन डायमंड की लाइटनेस/सैचुरेशन ग्रेडिंग आमतौर पर: कलरलेस (D–Z), फिर Faint, Very Light, Light, फिर Fancy (Light, Intense, Vivid, Deep, Dark), फिर रंग नाम जैसे Fancy Light Blue; अतिरिक्त शेड मुख्य रंग से पहले (जैसे Fancy Intense Purplish Pink)।',
  headingCost: 'लैब-ग्रोन फैंसी रंगों की कीमत',
  cost1:
    'लैब-ग्रोन बाजार में प्राकृतिक जैसी रंगीन vs कलरलेस कीमत की बड़ी खाई नहीं होती। अक्सर D रंग के समान वजन/आकार की तुलना में प्रीमियम (उदा. 3.05 ct Fancy Vivid Blue कुशन D से 20–30% ऊपर)। कलरलेस, पीला, नीला उत्पादन लगभग समान लागत; गुलाबी में विकिरण/ऐनिलिंग (~$100/ct) पीले पर जुड़ता है।',
  cost2:
    'सबसे महंगा समूह Fancy — पूरे पत्थर में स्पष्ट फैंसी रंग। Intense/Vivid में अधिक प्रीमियम। रुझान: गुलाबी, पीला, नीला; कलरलेस क्लासिक।',
  cost3:
    'Faint, Light, Dark उपसर्ग कम आकर्षक; कीमतें अक्सर D–F से नीची। बहुत कमजोर Faint Blue पर भारी छूट या निम्न कलरलेस रेंज। प्राकृतिक डायमंड में रंग विविधता अधिक क्योंकि प्रत्येक पत्थर का अद्वितीय अशुद्धि सेट। लैब-ग्रोन में सांद्रता नियंत्रित।',
  closing1:
    'यह आभूषण बाजार के लिए सुविधाजनक है — कैलिब्रेटेड फैंसी हारे आसानी से मिल सकते हैं।',
  closing2:
    'फैंसी रंगों का आकलन अतिरिक्त उपकरण और विशेषज्ञता चाहता है, लेकिन दोहराने योग्य रंग काम आसान बनाते हैं।',
  closing3:
    'पूर्ण विवरण के लिए टोन और फैंसी डिग्री (लाइटनेस + सैचुरेशन) सही होनी चाहिए। सर्वश्रेष्ठ रंगीन LGD D–F से महंगे, लेकिन क्रम नहीं। गुलाबी, कैनरी पीला और नीला मांग में। रंग आभूषण की दृश्यता को प्रभावित करता है।',
  fig1Caption: 'GIA सिस्टम के अनुसार fancy डायमंड के कलर टोन',
  fig1Source: 'J.M. King, GIA colored diamonds, color reference charts',
  fig2Caption:
    'orangy pink डायमंड का लाइटनेस/सैचुरेशन ग्रेडेशन — Faint से Fancy Deep तक',
  fig2Source: 'J.M. King, GIA colored diamonds, color reference charts.',
  authorLabel: 'लेखक:',
  author: 'LGDeal जेमोलॉजी विभाग',
}

export const colorGradingArticleLocales: Record<Locale, ColorGradingArticleLocale> = {
  en,
  de,
  fr,
  zh,
  ja,
  hi,
}
