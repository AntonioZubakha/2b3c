# 💎 Микросервис расчета маркетпрайсов

Полное техническое описание микросервиса для расчета и сглаживания рыночных цен на алмазы с использованием современных статистических методов.

## 📋 Содержание

- [Обзор](#-обзор)
- [Архитектура](#-архитектура)
- [Алгоритм расчета](#-алгоритм-расчета)
- [Экономические коэффициенты](#-экономические-коэффициенты)
- [Продвинутое сглаживание](#-продвинутое-сглаживание)
- [GIA-коэффициент](#-gia-коэффициент)
- [API и интерфейсы](#-api-и-интерфейсы)
- [Конфигурация](#-конфигурация)
- [Тестирование](#-тестирование)
- [Мониторинг](#-мониторинг)
- [Развертывание](#-развертывание)
- [Детальный анализ кода](#-детальный-анализ-кода)
- [Производительность и оптимизация](#-производительность-и-оптимизация)

---

## 🎯 Обзор

### Назначение
Микросервис `market-price-calculator-service` отвечает за:
- **Расчет рыночных цен** на алмазы на основе исторических данных
- **Статистическое сглаживание** аномальных цен с сохранением рыночной логики
- **Валидацию иерархий** качества (цвет, чистота, огранка)
- **Учет экономических факторов** (INR/USD, Gold, Oil)
- **GIA-коэффициент** для учета разницы между сертификатами
- **Предоставление API** для интеграции с основным приложением

### Ключевые особенности
- 🔬 **Статистически обоснованный** расчёт baseline `marketPricePerCarat` по категориям (adaptive median + веса динамики)
- ⚡ **Высокая производительность** (~10-20ms для 14 категорий) с интеллектуальным кэшированием
- 🛡️ **Расширенные защитные механизмы** против искажения рыночных данных и граничных случаев
- 📊 **Детальная отчетность** по всем операциям с метриками качества
- 🔄 **Автоматическое планирование** (каждые 3 часа) с health checks
- 💎 **Умный GIA-коэффициент** с адаптивной обработкой различных комбинаций данных
- 🌍 **Экономические корректировки** на основе макроэкономических индикаторов
- 🚀 **Оптимизированные алгоритмы** с пакетной и параллельной обработкой
- 🔍 **Расширенное логирование** и мониторинг в реальном времени
- 🛠️ **Робастная обработка ошибок** с автоматическим восстановлением

---

## 🏗️ Архитектура

### Структура проекта
```
market-price-calculator-service/
├── src/
│   ├── calculator.ts                    # Основной калькулятор
│   ├── advancedPriceSmoother.enhanced.ts # Улучшенный сглаживатель
│   ├── priceSmootherUtils.ts            # Утилиты для сглаживания
│   ├── giaCoefficientCalculator.enhanced.ts # GIA калькулятор
│   ├── errorHandling.enhanced.ts        # Система обработки ошибок
│   ├── performance.optimization.ts      # Оптимизации производительности
│   ├── monitoring.enhanced.ts           # Расширенный мониторинг
│   ├── index.ts                         # Точка входа микросервиса
│   ├── config.ts                        # Конфигурация
│   ├── db/models.ts                     # Модели базы данных
│   ├── shared/                          # Общие компоненты
│   │   ├── logger.ts                    # Система логирования
│   │   └── telegramBot.ts               # Telegram уведомления
│   ├── types/                           # TypeScript типы
│   │   └── index.ts                     # Все типы данных
│   ├── scripts/                         # Скрипты для тестирования и запуска
│   │   ├── run-calculation.ts           # CLI скрипт для ручного запуска
│   │   ├── test-advanced-smoother.ts    # Тест продвинутого сглаживателя
│   │   └── test-real-data-advanced.ts   # Тест на реальных данных
│   ├── utils/                           # Утилиты
│   │   └── gracefulShutdown.ts          # Корректное завершение работы
│   └── __tests__/                       # Unit тесты
│       ├── advancedPriceSmoother.test.ts
│       ├── giaCoefficientCalculator.test.ts
│       ├── edgeCases.test.ts            # Комплексные тесты граничных случаев
│       └── setup.ts
├── logs/                                # Директория логов
├── package.json
├── tsconfig.json
├── jest.config.js
└── Dockerfile
```

### Основные компоненты

#### 1. Calculator (calculator.ts)
**Назначение**: Основной движок расчета маркетпрайсов
```typescript
// Основные функции:
- calculateAndSaveCategoryStats(): Promise<void>
  ├── fetchEconomicIndicators()           // Получение внешних данных
  ├── validateEconomicIndicators()        // Валидация экономических показателей
  ├── generateAllCategoryCombinations()   // Генерация всех комбинаций категорий
  ├── determineShapeCategory()            // Определение категории формы
  ├── determineWeightCategory()           // Определение весовой категории
  ├── determineClarityCategory()          // Определение категории чистоты
  ├── determineColorCategory()            // Определение цветовой категории
  └── updateProductsWithSmoothedPrices()  // Обновление продуктов
```

#### 2. EnhancedAdvancedPriceSmoother (advancedPriceSmoother.enhanced.ts)
**Назначение**: Статистически обоснованное сглаживание цен с робастной обработкой
```typescript
class EnhancedAdvancedPriceSmoother {
  // Основное сглаживание с улучшенной валидацией
  smoothMarketPrices(categoryStats: IEnhancedAdvancedCategoryStats[]): IEnhancedSmoothingTableResult
  
  // Валидация и очистка входных данных
  validateAndCleanInput(categoryStats: IEnhancedAdvancedCategoryStats[]): IEnhancedAdvancedCategoryStats[]
  
  // PAV алгоритм с учетом доверия к данным
  applyPAVWithConfidence(categories: IEnhancedAdvancedCategoryStats[]): number[]
  
  // Расчет метрик качества
  calculateQualityMetrics(stats: IEnhancedAdvancedCategoryStats[], adjustments: Map<string, IEnhancedSmoothingResult>): IQualityMetrics
}
```

#### 3. EnhancedGiaCoefficientCalculator (giaCoefficientCalculator.enhanced.ts)
**Назначение**: Улучшенная версия GIA-коэффициента с робастной обработкой граничных случаев
```typescript
class EnhancedGiaCoefficientCalculator {
  // Умный расчет коэффициента с обработкой всех комбинаций данных
  calculateGiaCoefficient(products: IProduct[], categoryKey: string): IGiaCoefficientCalculation
  
  // Робастная валидация входных данных
  validateInputData(data: any, context: IErrorContext): IValidationResult
  
  // Удаление выбросов на основе IQR
  removeOutliers(products: IProduct[]): IProduct[]
  
  // Статистическая валидация коэффициента
  validateCoefficientStatistically(giaProducts: IProduct[], igiProducts: IProduct[], coefficient: number): IStatisticalValidation
}
```

#### 4. EnhancedErrorHandler (errorHandling.enhanced.ts)
**Назначение**: Централизованная система обработки ошибок и защитных механизмов
```typescript
class EnhancedErrorHandler {
  // Обработка ошибки с контекстом
  handleError(type: ErrorType, severity: ErrorSeverity, message: string, context: IErrorContext, originalError?: Error): IEnhancedError
  
  // Валидация различных типов данных
  validatePrice(price: number, context: IErrorContext, minPrice?: number, maxPrice?: number): IValidationResult
  
  // Попытка восстановления после ошибки
  attemptRecovery<T>(operation: () => Promise<T>, recoveryStrategies: IRecoveryStrategy<T>[], context: IErrorContext): Promise<IRecoveryResult<T>>
  
  // Мониторинг состояния системы
  getSystemHealth(): ISystemHealth
}
```

#### 5. PerformanceOptimizer (performance.optimization.ts)
**Назначение**: Оптимизация производительности и кэширование
```typescript
class PerformanceOptimizer {
  // Измерение производительности операций
  measurePerformance<T>(operationName: string, operation: () => Promise<T>, itemsCount?: number): Promise<T>
  
  // Интеллектуальное кэширование
  cachedOperation<T>(operation: () => Promise<T>, cacheKey: string, ttl?: number): Promise<T>
  
  // Пакетная обработка
  processBatch<T, R>(items: T[], processor: (batch: T[]) => Promise<R[]>, batchSize?: number): Promise<R[]>
  
  // Параллельная обработка
  processParallel<T, R>(groups: T[][], processor: (group: T[]) => Promise<R[]>, maxConcurrency?: number): Promise<R[][]>
}
```

#### 6. EnhancedMonitoring (monitoring.enhanced.ts)
**Назначение**: Расширенный мониторинг и логирование системы
```typescript
class EnhancedMonitoring {
  // Структурированное логирование с контекстом
  logWithContext(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: Record<string, any>): void
  
  // Запись метрик производительности
  recordMetric(name: string, value: number, unit?: string, tags?: Record<string, string>): void
  
  // Создание и управление алертами
  createAlert(level: AlertLevel, message: string, component: string, context?: Record<string, any>): string
  
  // Health checks компонентов
  performHealthCheck(): Promise<IHealthCheckResult>
  
  // Мониторинг бизнес-метрик
  recordBusinessMetrics(metrics: Partial<IBusinessMetrics>): void
}
```

---

## 🧮 Алгоритм расчета

### Этап 1: Сбор базовых статистик
```typescript
interface ICategoryStats {
  shape: string;           // Форма (ROUND, OVAL, PEAR, CUSHION, EMERALD, RADIANT, PRINCESS, MARQUISE, HEART, ASSCHER, FANCY)
  sizeRange: string;       // Диапазон размеров (1-1.39, 1.8-2.19, etc.)
  clarity: string;         // Чистота (IF, VVS1, VVS2, VS1, VS2)
  color: string;           // Цвет (D, E, F, G, H, I, J, K, L, M)
  count: number;           // Количество камней в категории
  marketPricePerCarat: number;  // Средняя цена за карат
  standardDeviation: number;    // Стандартное отклонение
  minPrice: number;        // Минимальная цена
  maxPrice: number;        // Максимальная цена
  medianPrice: number;     // Медианная цена
}
```

### Этап 2: Экономические корректировки
См. раздел [Экономические коэффициенты](#-экономические-коэффициенты)

### Этап 3: Продвинутое сглаживание
```typescript
interface IAdvancedCategoryStats extends ICategoryStats {
  winsorizedPrice: number;     // Цена после winsorizing
  logPrice: number;           // Логарифм цены
  confidence: number;         // Уровень доверия (0-1)
  volatility: number;         // Коэффициент вариации
  isOutlier: boolean;         // Флаг выброса
}
```

### Этап 4: Статистические проверки
```typescript
interface IStatisticalTest {
  zScore: number;            // Z-статистика
  pValue: number;            // P-значение
  isSignificant: boolean;    // Статистическая значимость
  effectSize: number;        // Размер эффекта
  confidenceInterval: [number, number]; // Доверительный интервал
}
```

### Когда маркетпрайс не рассчитывается

- **Цвет (главная причина)**  
  В расчёт попадают только продукты с цветом **D, E, F или G**.  
  `determineColorCategory()` возвращает `null` для H, I, J, K, L, M и фенси-цветов. Такие продукты не привязываются ни к одной категории и **не получают** `marketPricePerCarat`.

- **Форма (шейп)**  
  Все формы учтены: 11 явных категорий (ROUND, OVAL, PEAR, CUSHION, EMERALD, RADIANT, PRINCESS, MARQUISE, HEART, ASSCHER) плюс **FANCY** для остальных (в т.ч. Other, Baguette, Trillion). Продукты с шейпом «Other» считаются в категории FANCY и получают маркетпрайс, если цвет D/E/F/G.

- **Прочие причины**  
  Продукты без валидного `carat` или с неположительным `pricePerCarat` отфильтровываются до категоризации. Продукты в статусе «OnDeal» не участвуют в расчёте.

---

## 🌍 Экономические коэффициенты

### Обзор
Система учитывает влияние макроэкономических индикаторов на цены **lab-grown diamonds**, основное производство которых (80%) сосредоточено в Индии.

### Текущие значения коэффициентов
**Обновлено**: 19 октября 2025

| Коэффициент | Значение | Название | Описание |
|-------------|----------|----------|----------|
| **COEFF_INR** | **0.40** | INR/USD | Основной драйвер затрат (80% производства в Индии) |
| **COEFF_GOLD** | **0.06** | Gold Price | Слабая психологическая корреляция |
| **COEFF_OIL** | **0.07** | Oil Price | Влияет только на логистику (~2-5% цены) |

### Обоснование коэффициентов

#### 1. INR/USD (α = 0.40) - Основной фактор
**Почему это важно:**
- 🇮🇳 **80% мирового производства** lab-grown diamonds сосредоточено в Индии (Surat)
- **80-85% себестоимости** номинировано в INR:
  - Электроэнергия: ~40-45% (самая большая статья затрат)
  - Зарплаты: ~25-30%
  - Аренда помещений: ~5-10%
  - Местные материалы: ~10-15%

**Механизм влияния:**
```
Ослабление INR (USD/INR растет)
├─ Затраты производителя в INR остаются прежними
├─ Но в USD эти затраты становятся НИЖЕ
└─ → Производитель может снизить USD цены, оставаясь прибыльным

Укрепление INR (USD/INR снижается)
├─ Затраты производителя в INR остаются прежними
├─ Но в USD эти затраты становятся ВЫШЕ
└─ → Производитель вынужден повышать USD цены
```

#### 2. Gold Price (β = 0.06) - Слабая корреляция
**Почему влияние минимальное:**
- Lab-grown diamonds **не являются инвестиционным активом** (в отличие от природных)
- Психологическая корреляция: когда золото растет, может расти спрос на драгоценности
- Но для lab-grown diamonds это влияние крайне слабое

#### 3. Oil Price (γ = 0.07) - Только логистика
**Почему влияние минимальное:**
- Влияет только на **транспортировку и логистику** (~2-5% финальной цены)
- Не влияет напрямую на производственные затраты (в отличие от природных алмазов, где добыча энергоемкая)

### Формула расчета

```typescript
// 1. Расчет дельт (изменений в %)
const deltaInr = (todayInr - yesterdayInr) / yesterdayInr;
const deltaGold = (todayGold - yesterdayGold) / yesterdayGold;
const deltaOil = (todayOil - yesterdayOil) / yesterdayOil;

// 2. Применение коэффициентов
const alpha = config.coeffInr;   // 0.40
const beta = config.coeffGold;   // 0.06
const gamma = config.coeffOil;   // 0.07

// 3. Расчет факторов
const inrFactor = 1 + (alpha * deltaInr);
const goldFactor = 1 + (beta * deltaGold);
const oilFactor = 1 + (gamma * deltaOil);

// 4. Общий корректирующий фактор
const adjustmentFactor = inrFactor * goldFactor * oilFactor;

// 5. Применение к маркетпрайсу
const finalMarketPrice = internalMarketPrice * adjustmentFactor;
```

### Пример расчета

**Сценарий**: 
- Вчера: INR = 83.0, Gold = $2000, Oil = $80
- Сегодня: INR = 83.5 (+0.6%), Gold = $2050 (+2.5%), Oil = $82 (+2.5%)

**Расчет:**
```typescript
deltaInr = (83.5 - 83.0) / 83.0 = +0.006 (0.6%)
deltaGold = (2050 - 2000) / 2000 = +0.025 (2.5%)
deltaOil = (82 - 80) / 80 = +0.025 (2.5%)

inrFactor = 1 + (0.40 × 0.006) = 1.0024 (+0.24%)
goldFactor = 1 + (0.06 × 0.025) = 1.0015 (+0.15%)
oilFactor = 1 + (0.07 × 0.025) = 1.00175 (+0.175%)

adjustmentFactor = 1.0024 × 1.0015 × 1.00175 = 1.00565 (+0.565%)

Если internalMarketPrice = $1000:
finalMarketPrice = $1000 × 1.00565 = $1005.65
```

### Логирование

Система логирует вклад каждого фактора для мониторинга:

```typescript
logger.debug(`[economic] Category ${shape}-${weight}-${clarity}-${color}:`);
logger.debug(`[economic]   INR: ${inrContribution}% (Δ${deltaInr}% × ${alpha})`);
logger.debug(`[economic]   Gold: ${goldContribution}% (Δ${deltaGold}% × ${beta})`);
logger.debug(`[economic]   Oil: ${oilContribution}% (Δ${deltaOil}% × ${gamma})`);
logger.debug(`[economic]   Total adjustment: ${totalAdjustment}%`);
```

**Алерты:**
- Корректировки >15% логируются как предупреждение
- Все большие изменения отслеживаются для анализа

### История обновлений

#### Обновление от 19 октября 2025
**Изменения:**
- **COEFF_INR**: 0.10 → **0.40** (↑ 4x) - основной драйвер затрат
- **COEFF_GOLD**: 0.10 → **0.06** (↓ 40%) - нет прямого влияния на затраты
- **COEFF_OIL**: 0.10 → **0.07** (↓ 30%) - только логистика

**Обоснование:** Проведен глубокий анализ корреляции для lab-grown diamonds (см. `info/27_Economic_Coefficients_Analysis.md`)

### Получение экономических индикаторов

Система автоматически получает данные из внешних API:

```typescript
// 1. Oil Price API
https://api.oilpriceapi.com/v1/prices/latest

// 2. Frankfurter API (INR/USD)
https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR

// 3. Gold API
https://api.gold-api.com/price/XAU
```

**Особенности:**
- Retry логика с экспоненциальным backoff (3 попытки)
- Валидация диапазонов значений:
  - Золото: $1000-$5000 за унцию
  - Нефть: $20-$200 за баррель
  - INR/USD: 40-200 рупий за доллар
- Graceful degradation при недоступности API

---

## 🔬 Продвинутое сглаживание

### Принцип работы
Сглаживание основано на **статистически обоснованных методах** с минимальным искажением рыночных данных.

### Пайплайн сглаживания
```
1. WINSORIZING (устранение выбросов)
   ↓
2. LOG-TRANSFORM (работа в лог-пространстве)
   ↓
3. ISOTONIC REGRESSION (восстановление монотонности)
   ↓
4. STATISTICAL TESTS (проверка значимости)
   ↓
5. BOUNDED ADJUSTMENTS (ограниченные корректировки)
   ↓
6. POST-CHECK (проверка на "слипание" групп)
```

### 1. Winsorizing (устранение выбросов)
```typescript
// Использует 5-й и 95-й процентили по всей группе
const lowerPercentile = calculatePercentile(allPrices, 5);
const upperPercentile = calculatePercentile(allPrices, 95);

const winsorizedPrice = Math.max(
  lowerPercentile,
  Math.min(upperPercentile, originalPrice)
);
```

**Преимущества:**
- Устойчивость к малым выборкам
- Глобальные процентили вместо локальных σ
- Сохранение структуры данных

### 2. Log-трансформация
```typescript
// Все расчеты в логарифмическом пространстве
const logPrice = Math.log(price);
const logAdjustment = logPriceNew - logPriceOld;
const percentChange = Math.exp(logAdjustment) - 1;
```

**Преимущества:**
- Корректная работа с процентами
- Симметричность положительных и отрицательных изменений
- Статистическая стабильность

### 3. Isotonic Regression (PAV алгоритм)
```typescript
// Pool-Adjacent-Violators для восстановления монотонности
// Направление: убывающая монотонность (D ≥ E ≥ F ≥ G)
if (currentPrice > previousPrice) {
  // Нарушение монотонности - требуется корректировка
}
```

**Особенности:**
- **Взвешивание по количеству камней**: `weight = Math.max(count, 1)`
- **Ограничение корректировок**: максимум 10% для isotonic regression
- **Post-check механизм**: предотвращает "слипание" групп

### 4. Статистические тесты
```typescript
// Z-тест с локальной регрессией
const zScore = (logPrice1 - logPrice2) / sqrt(se1² + se2²);

// Поправка Бонферрони для множественных сравнений
const adjustedThreshold = Z_THRESHOLD / numberOfComparisons;

if (Math.abs(zScore) > adjustedThreshold) {
  // Нарушение статистически значимо
}
```

**Улучшения:**
- **Локальная регрессия**: сравнение с несколькими соседями
- **Поправка Бонферрони**: учет множественных сравнений
- **Динамические пороги**: адаптация к размеру выборки

### 5. Адаптивные коэффициенты
```typescript
// Экспоненциальная функция вместо ступенчатой таблицы
const smoothingFactor = MIN_COEFF + (MAX_COEFF - MIN_COEFF) * (1 - Math.exp(-count / SCALE_PARAM));

// Динамические ограничения на основе волатильности
const maxAdjustment = calculateDynamicMaxAdjustment(stat);
```

**Параметры:**
- `MIN_COEFF = 0.05` (5% для малых выборок)
- `MAX_COEFF = 0.80` (80% для больших выборок)
- `SCALE_PARAM = 30` (параметр масштабирования)

### 6. Post-check механизм
```typescript
// Обнаружение "слипшихся" групп после isotonic regression
const groupedByPrice = new Map<number, number[]>();

// Если несколько категорий имеют одинаковую цену после сглаживания
if (groupedByPrice.size > 1) {
  // Применить ограничение 10% к каждой категории в группе
  const limitedAdjustment = Math.sign(adjustment) * maxAdjustment;
}
```

---

## 💎 GIA-коэффициент

### Принцип работы
GIA-коэффициент учитывает разницу в ценах между алмазами с сертификатами GIA и IGI. GIA камни традиционно стоят дороже IGI в 1.5-3.5 раз в зависимости от категории.

### Алгоритм расчета
```
1. АНАЛИЗ КАТЕГОРИИ
   ↓
2. РАЗДЕЛЕНИЕ ПО СЕРТИФИКАТАМ (GIA vs IGI)
   ↓
3. РАСЧЕТ СРЕДНИХ ЦЕН
   ↓
4. ВЫЧИСЛЕНИЕ КОЭФФИЦИЕНТА (avgGiaPrice / avgIgiPrice)
   ↓
5. ОГРАНИЧЕНИЕ ДИАПАЗОНОМ (1.5 - 3.5)
   ↓
6. ПРИМЕНЕНИЕ К МАРКЕТПРАЙСУ
```

### Параметры расчета
```typescript
interface IGiaCoefficient {
  categoryKey: string;           // Ключ категории (shape-weight-clarity-color)
  giaCoefficient: number;        // Коэффициент GIA (1.5-3.5)
  avgGiaPrice: number;           // Средняя цена GIA камней
  avgIgiPrice: number;           // Средняя цена IGI камней
  giaCount: number;              // Количество GIA камней
  igiCount: number;              // Количество IGI камней
  calculatedAt: Date;            // Время расчета
}
```

### Применение коэффициента
```typescript
// Для GIA камней: price = basePrice * coefficient
// Для IGI камней: price = basePrice (без изменений)
// Для других: price = basePrice * (coefficient + 1) / 2

const adjustedPrice = giaCoefficientCalculator.applyGiaCoefficient(
  baseMarketPrice,
  giaCoefficient,
  product.certificateInstitute
);
```

### Защитные механизмы
- **Минимальный размер выборки**: минимум 2 образца каждого типа
- **Ограничение диапазона**: коэффициент ограничен 1.5-3.5
- **Fallback значения**: при недостатке данных используется минимальный коэффициент
- **Кэширование**: коэффициенты кэшируются для избежания пересчета
- **Удаление выбросов**: использование IQR для очистки данных

---

## 🔧 API и интерфейсы

### Основные типы данных

#### ICategoryStats
```typescript
interface ICategoryStats {
  shape: string;
  sizeRange: string;
  clarity: string;
  color: string;
  count: number;
  marketPricePerCarat: number;
  standardDeviation: number;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
}
```

#### IAdvancedCategoryStats
```typescript
interface IAdvancedCategoryStats extends ICategoryStats {
  winsorizedPrice: number;
  logPrice: number;
  confidence: number;
  volatility: number;
  isOutlier: boolean;
}
```

#### IEconomicIndicators
```typescript
interface IEconomicIndicators {
  goldPrice?: number;      // Цена золота за унцию ($)
  oilPrice?: number;       // Цена нефти за баррель ($)
  inrUsdRate?: number;     // Курс INR/USD
}
```

#### IGiaCoefficient
```typescript
interface IGiaCoefficient {
  categoryKey: string;           // Ключ категории (shape-weight-clarity-color)
  giaCoefficient: number;        // Коэффициент GIA (1.5-3.5)
  avgGiaPrice: number;           // Средняя цена GIA камней
  avgIgiPrice: number;           // Средняя цена IGI камней
  giaCount: number;              // Количество GIA камней
  igiCount: number;              // Количество IGI камней
  calculatedAt: Date;            // Время расчета
}
```

---

## ⚙️ Конфигурация

### Параметры сглаживания
```typescript
class EnhancedAdvancedPriceSmoother {
  private readonly Z_THRESHOLD = 1.96;                    // 95% доверительный интервал
  private readonly MIN_SAMPLE_SIZE = 3;                   // Минимальный размер выборки
  private readonly MAX_ADJUSTMENT_PERCENT = 0.15;         // Максимум 15% корректировки
  private readonly MAX_ISOTONIC_ADJUSTMENT_PERCENT = 0.10; // 10% для isotonic regression
  private readonly MIN_COEFF = 0.05;                      // Минимальный коэффициент
  private readonly MAX_COEFF = 0.80;                      // Максимальный коэффициент
  private readonly SCALE_PARAM = 30;                      // Параметр масштабирования
  private readonly WINSORIZE_PERCENTILES = [5, 95];       // Процентили для winsorizing
}
```

### Зависимости проекта

#### Основные зависимости
```json
{
  "mongoose": "^7.5.0",           // MongoDB ODM
  "node-schedule": "^2.1.1",      // Планировщик задач
  "axios": "^1.5.0",              // HTTP клиент для внешних API
  "dotenv": "^16.3.1",            // Загрузка переменных окружения
  "winston": "^3.10.0",           // Система логирования
  "express": "^4.19.2",           // HTTP сервер для health checks
  "telegraf": "^4.15.0"           // Telegram уведомления
}
```

#### Dev зависимости
```json
{
  "@types/node": "^20.5.0",       // TypeScript типы для Node.js
  "typescript": "^5.1.6",         // TypeScript компилятор
  "ts-node": "^10.9.1",           // TypeScript для Node.js
  "jest": "^29.6.2",              // Тестовый фреймворк
  "ts-jest": "^29.4.0"            // TypeScript поддержка для Jest
}
```

### Переменные окружения
```bash
# Логирование
LOG_LEVEL=info                    # Уровень логирования
LOG_FORMAT=json                   # Формат логов

# База данных
MONGODB_URI=mongodb://localhost:27017/lgdx
MONGODB_DATABASE=lgdx

# API
PORT=9100                        # Порт микросервиса (health + cache endpoint)
API_PREFIX=/api/v1

# Сглаживание
ENABLE_PRICE_SMOOTHING=true      # Включить сглаживание
SMOOTHING_MODE=advanced          # Режим сглаживания

# Экономические коэффициенты (оптимизированы для Lab-Grown Diamonds)
# См. info/27_Economic_Coefficients_Analysis.md для обоснования
OIL_PRICE_API_FILE=/run/secrets/oil_price_api   # Secret для API нефти
COEFF_INR=0.40                   # ↑ Коэффициент влияния INR/USD (основной драйвер, 80% затрат)
COEFF_GOLD=0.06                  # ↓ Коэффициент влияния золота (слабая корреляция)
COEFF_OIL=0.07                   # ↓ Коэффициент влияния нефти (только логистика)

# Планировщик
CALCULATION_INTERVAL=0 */3 * * * # Каждые 3 часа
MAX_PROCESSING_TIME=1800000      # 30 минут
DB_CONNECTION_TIMEOUT=60000      # 60 секунд (prod)
DB_SOCKET_TIMEOUT=90000          # 90 секунд (prod)
MARKET_PRICE_CACHE_REDIS_URL_FILE=/run/secrets/redis_url
MARKET_PRICE_CACHE_ENDPOINT=http://market-price-calculator:9100/market-price-cache
MARKET_PRICE_CACHE_TTL_SECONDS=86400
SERVICE_COORDINATOR_ENABLED=true

# Уведомления
STOCK_TELEGRAM_BOT_TOKEN_FILE=/run/secrets/stock_telegram_bot_token
STOCK_TELEGRAM_CHAT_ID_FILE=/run/secrets/stock_telegram_chat_id
```

### Поддержка Docker Secrets
```typescript
const getSecretFromFile = (envVar: string): string | undefined => {
  const filePath = process.env[`${envVar}_FILE`];
  if (filePath) {
    return fs.readFileSync(filePath, 'utf8').trim();
  }
  return process.env[envVar];
};
```

---

## 🧪 Тестирование

### Структура тестов
```
__tests__/
├── advancedPriceSmoother.test.ts    # Unit тесты сглаживателя
├── giaCoefficientCalculator.test.ts # Тесты GIA-коэффициента
├── edgeCases.test.ts                # Комплексные тесты граничных случаев
└── setup.ts                         # Настройка тестовой среды

scripts/
├── test-advanced-smoother.ts        # Тест продвинутого сглаживателя
└── test-real-data-advanced.ts       # Тестирование на реальных данных
```

### Команды тестирования
```bash
# Unit тесты
npm run test:advanced

# Тестирование на реальных данных
npm run test:real-data

# Все тесты
npm test

# Тесты с покрытием
npm run test:coverage

# Интеграционные тесты
npm run test:integration
```

### CLI скрипты
```bash
# Ручной запуск расчета (development)
npm run calculate

# Ручной запуск расчета (production)
npm run calculate:prod

# Тест продвинутого сглаживателя
npm run test:advanced-smoother

# Тест на реальных данных
npm run test:real-data
```

### Покрытие тестами
- ✅ **Статистические тесты** (z-score, p-value, доверительные интервалы)
- ✅ **Isotonic regression** (PAV алгоритм, взвешивание, ограничения)
- ✅ **Winsorizing** (процентили, обработка выбросов)
- ✅ **Адаптивные коэффициенты** (экспоненциальная функция)
- ✅ **Post-check механизм** (предотвращение "слипания" групп)
- ✅ **Граничные случаи** (пустые категории, нулевые цены)
- ✅ **Интеграционные тесты** (полный пайплайн)
- ✅ **GIA-коэффициент** (расчет, применение, ограничения, fallback)
- ✅ **Экономические корректировки** (валидация, граничные случаи)

---

## 📊 Мониторинг

### Метрики производительности
```typescript
interface IPerformanceMetrics {
  processingTime: number;           // Время обработки (мс)
  categoriesProcessed: number;      // Количество обработанных категорий
  adjustmentsApplied: number;       // Количество примененных корректировок
  maxAdjustmentPercent: number;     // Максимальный процент корректировки
  avgAdjustmentPercent: number;     // Средний процент корректировки
  monotonicityImprovement: number;  // Улучшение монотонности (%)
}
```

### Логирование
```typescript
// Структурированные логи в JSON формате
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Advanced price smoothing completed",
  "service": "market-price-calculator",
  "metrics": {
    "totalCategories": 14,
    "adjustedCategories": 3,
    "maxAdjustment": 0.1457,
    "avgAdjustment": 0.1163,
    "monotonicityImprovement": 0.474
  }
}
```

### Health Check
```dockerfile
# Docker Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1
```

**HTTP Health Check:**
- **Endpoint**: `http://localhost:9100/health`
- **Метод**: GET
- **Ответ**: `200 OK` (JSON `{ ok: true }`)

Также доступны:
- `GET /metrics` — Prometheus метрики
- `GET /market-price-cache` — актуальный snapshot категорий (используется как HTTP fallback другими сервисами)
- `GET /market-price-cache/diff` — diff к предыдущей версии (если доступен)
- `POST /calculate` — on-demand запуск расчёта (асинхронно, возвращает 202)

### Алерты и уведомления
- **Большие корректировки** (>15%): предупреждение в логах и Telegram
- **Нарушения монотонности** (>10): критическое предупреждение
- **Ошибки обработки**: немедленное уведомление в Telegram
- **Производительность**: медленная обработка (>100ms)
- **Health Check**: автоматическая проверка каждые 30 секунд
- **Экономические корректировки** (>15%): предупреждение с детализацией

---

## 🚀 Развертывание

### Docker контейнер
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

EXPOSE 9100
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  market-price-calculator:
    build: ./market-price-calculator-service
    ports:
      - "9100:9100"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/lgdx
      - LOG_LEVEL=info
      - COEFF_INR=0.40
      - COEFF_GOLD=0.06
      - COEFF_OIL=0.07
    depends_on:
      - mongo
    restart: unless-stopped
```

### Процесс развертывания
```bash
# 1. Коммит изменений
git add .
git commit -m "feat: update market price calculator"
git push origin main

# 2. На сервере
ssh root@your-server
cd /opt/lgdx
git pull origin main

# 3. Пересборка сервиса
docker build -t lgdx-market-price-calculator:latest ./market-price-calculator-service

# 4. Обновление сервиса (без downtime)
docker service update --force lgdx_market-price-calculator
```

---

## 🔍 Детальный анализ кода

### Основные компоненты системы

#### 1. Главный файл (index.ts)
**Назначение**: Точка входа микросервиса, управление жизненным циклом
```typescript
// Ключевые функции:
- connectToDatabase(): Promise<void>     // Подключение к MongoDB
- scheduleMarketPriceCalculation(): void // Планировщик задач (каждые 3 часа)
- triggerCalculation(): Promise<void>    // Ручной запуск расчета
- gracefulShutdown(signal: string): void // Корректное завершение работы
```

**Особенности реализации:**
- Использует `node-schedule` для cron-задач (`0 */3 * * *` - каждые 3 часа)
- HTTP сервер на порту 9100 для внешних триггеров
- Graceful shutdown с обработкой SIGTERM/SIGINT
- Обработка uncaught exceptions и unhandled rejections
- Поддержка CLI режима с флагом `--calculate`
- Telegram уведомления о начале, завершении и ошибках

#### 2. Калькулятор (calculator.ts)
**Назначение**: Основной движок расчета маркетпрайсов

**Алгоритм расчета маркетпрайса:**
1. **Сбор данных**: Загрузка всех доступных продуктов (исключая сделки)
2. **Категоризация**: Группировка по 4 параметрам (форма, вес, чистота, цвет)
   - **Форма**: ROUND, OVAL, PEAR, CUSHION, EMERALD, RADIANT, PRINCESS, MARQUISE, HEART, ASSCHER, FANCY
   - **Вес**: Диапазоны в каратах (0.3-0.59, 0.6-0.99, 1.0-1.39, 1.4-1.79, 1.8-2.19, 2.2-2.59, ...)
   - **Чистота**: IF, VVS1, VVS2, VS1, VS2
   - **Цвет**: D, E, F, G, H, I, J, K, L, M
3. **Статистический анализ**: Расчет средних, медиан, стандартных отклонений
4. **Адаптивная медиана**: Исключение выбросов на основе размера выборки
5. **Внутренний маркетпрайс**: Взвешенная формула с коэффициентами
6. **Экономическая корректировка**: Учет золота, нефти, курса INR/USD
7. **Продвинутое сглаживание**: Статистическая коррекция аномалий
8. **GIA-коэффициент**: Применение коэффициента для разных сертификатов
9. **Обновление продуктов**: Сохранение рассчитанных цен в БД

#### 3. Продвинутый сглаживатель (advancedPriceSmoother.enhanced.ts)
**Назначение**: Статистически обоснованное сглаживание цен

**Пайплайн сглаживания:**
```typescript
smoothMarketPrices(categoryStats: IEnhancedAdvancedCategoryStats[]): IEnhancedSmoothingTableResult
├── validateAndCleanInput()              // 1. Валидация и очистка данных
├── preprocessData()                    // 2. Winsorizing (устранение выбросов)
├── groupByColorHierarchy()            // 3. Группировка по цветовой иерархии
├── groupByClarityHierarchy()          // 4. Группировка по иерархии чистоты
├── applyPAVWithConfidence()          // 5. Isotonic regression (PAV алгоритм)
├── performStatisticalTest()           // 6. Статистические тесты (z-score)
├── createStatisticalAdjustment()      // 7. Создание корректировок
└── calculateQualityMetrics()          // 8. Расчет метрик качества
```

**Статистические методы:**
- **Winsorizing**: Ограничение выбросов 5-м и 95-м процентилями
- **Log-трансформация**: Работа в логарифмическом пространстве
- **Isotonic Regression**: Pool-Adjacent-Violators алгоритм
- **Z-тесты**: Локальная регрессия с поправкой Бонферрони
- **Адаптивные коэффициенты**: Экспоненциальная функция сглаживания

#### 4. Система логирования (shared/logger.ts)
**Назначение**: Централизованное логирование

**Winston Logger:**
```typescript
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'market-price-calculator' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});
```

---

## ⚡ Производительность и оптимизация

### 1. Оптимизации базы данных

**Индексы MongoDB:**
```typescript
// Составной индекс для быстрого поиска по категориям
productCategoryStatsSchema.index({ 
  date: 1, 
  shape: 1, 
  weight: 1, 
  clarity: 1, 
  color: 1 
}, { unique: true });

// Индекс для поиска доступных продуктов
Product.find({ 
  status: 'available',
  onDeal: { $ne: true }
}).select('_id shape carat clarity pricePerCarat color certificateNumber status onDeal company')
```

**Оптимизация запросов:**
- Использование `.lean()` для быстрого чтения
- Селективный выбор полей с `.select()`
- Индивидуальные обновления вместо bulkWrite
- Кэширование результатов статистических тестов
- Кэширование GIA-коэффициентов

### 2. Алгоритмические оптимизации

**Сложность алгоритмов:**
- **Isotonic Regression**: O(n log n) для PAV алгоритма
- **Статистические тесты**: O(n) для каждой категории
- **Winsorizing**: O(n log n) для сортировки процентилей
- **Общая сложность**: O(n log n) где n - количество категорий

**Оптимизации памяти:**
```typescript
// Очистка массивов для переиспользования
pricesPerCaratInCategory.length = 0;
productDetailsForCategory.length = 0;

// Использование Map для быстрого поиска
const priceMap = new Map<string, IAdvancedCategoryStats>();
const smoothedPricesMap = new Map<string, number>();
const giaCoefficientsCache = new Map<string, { giaCoefficient: number }>();
```

### 3. Мониторинг производительности

**Бенчмарки:**
- **14 категорий**: ~10-20ms
- **100 категорий**: ~50-100ms  
- **1000 категорий**: ~500-1000ms
- **Память**: <50MB для 1000 категорий
- **GIA-коэффициент**: +2-5ms на категорию (расчет + применение)

### 4. Обработка ошибок и восстановление

**Graceful degradation:**
```typescript
// При недоступности внешних API
if (oilResponse?.data?.data?.price) {
  indicators.oilPrice = parseFloat(oilResponse.data.data.price);
} else {
  logger.warn('[OilPriceAPI] Failed to fetch oil price, will use fallback or skip');
}

// При ошибках обновления продуктов
try {
  const updateResult = await Product.updateOne(/* ... */);
  if (updateResult.modifiedCount > 0) {
    updatedCount++;
  }
} catch (error) {
  logger.error(`Error updating product ${product._id}:`, error);
}
```

**Retry логика:**
```typescript
const fetchWithRetry = async (url: string, options: any, apiName: string): Promise<any> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url, options);
      return response;
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      
      if (isLastAttempt) {
        logger.error(`[${apiName}] All ${maxRetries} attempts failed. Using fallback values.`);
        return null;
      }
      
      await sleep(delay);
    }
  }
};
```

---

## 📦 Информация о пакете

### Версия и метаданные
```json
{
  "name": "market-price-calculator-service",
  "version": "1.0.0",
  "description": "Background service for calculating and updating market prices for diamond products",
  "main": "dist/index.js",
  "keywords": [
    "diamond",
    "market-price", 
    "calculator",
    "background-job",
    "scheduler"
  ],
  "author": "LGDX Team",
  "license": "MIT"
}
```

---

## 📚 Дополнительные ресурсы

### Связанная документация
- [27_Economic_Coefficients_Analysis.md](./27_Economic_Coefficients_Analysis.md) - Детальный анализ экономических коэффициентов
- [02_Architecture.md](./02_Architecture.md) - Общая архитектура системы
- [27_Testing_Guide.md](./27_Testing_Guide.md) - Руководство по тестированию
- [04_Environment_Variables.md](./04_Environment_Variables.md) - Переменные окружения
- [13_Database_Schema.md](./13_Database_Schema.md) - Схема базы данных

### Внешние ресурсы
- [Isotonic Regression](https://en.wikipedia.org/wiki/Isotonic_regression) - Wikipedia
- [Pool-Adjacent-Violators Algorithm](https://en.wikipedia.org/wiki/Pool_adjacent_violators_algorithm) - Wikipedia
- [Winsorizing](https://en.wikipedia.org/wiki/Winsorizing) - Wikipedia
- [Bonferroni Correction](https://en.wikipedia.org/wiki/Bonferroni_correction) - Wikipedia

---

## 🔮 Будущие улучшения

### Краткосрочные (1-3 месяца)
- **A/B тестирование**: сравнение методов сглаживания
- **Метрики качества**: автоматическая оценка результатов
- **Настройка параметров**: автоматическая оптимизация коэффициентов

### Среднесрочные (3-6 месяцев)
- **Байесовские методы**: учет неопределенности в данных
- **Модели с факторами**: учет взаимодействий между параметрами
- **Временные ряды**: учет трендов и сезонности

### Долгосрочные (6+ месяцев)
- **Машинное обучение**: автоматическая настройка алгоритмов
- **Реальное время**: потоковая обработка данных
- **Мультивалютность**: поддержка разных валют

---

*Документация актуальна на: 2026-03 (сверено с `market-price-calculator-service/src/index.ts` и `src/config.ts`)*  
*Версия микросервиса: 1.0.0*  
*Автор: LGDX Development Team*
