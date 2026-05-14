import React, {
  ChangeEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TranslationKey, useTranslation } from '../../i18n'
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import styles from "./CatalogPage.module.css";
import { analytics } from "../../utils/analytics";
import CatalogDiamondCard from "../../components/DiamondCard/CatalogDiamondCard";
import { useNavigate } from "../../routes";
import { Product } from "../../types";
import Modal from "../../components/common/Modal/Modal";
import Button from "../../components/common/Button/Button";
import Input from "../../components/common/Input/Input";
import Select from "../../components/common/Select/Select";
import Tabs, { TabItem } from "../../components/common/Tabs";
import SEO from "../../components/common/SEO/SEO";
import PageHeader from "../../components/common/PageHeader/PageHeader";
import PageContainer from "../../components/common/PageContainer/PageContainer";
import PageSection from "../../components/common/PageSection/PageSection";
import { useAuth } from "../../context/AuthContext";

// Shape icons - PNG for both themes (same active-state behavior: dark icon on brand button)
import roundIconDark from "../../assets/images/1.png";
import princessIconDark from "../../assets/images/2.png";
import pearIconDark from "../../assets/images/3.png";
import marquiseIconDark from "../../assets/images/4.png";
import radiantIconDark from "../../assets/images/5.png";
import emeraldIconDark from "../../assets/images/6.png";
import ovalIconDark from "../../assets/images/7.png";
import heartIconDark from "../../assets/images/8.png";
import cushionIconDark from "../../assets/images/9.png";
import asscherIconDark from "../../assets/images/10.png";
import baguetteIconDark from "../../assets/images/11.png";
import trillionIconDark from "../../assets/images/trillion.png";
import api from "../../api";

const SHAPE_OPTIONS = [
  "Round",
  "Oval",
  "Pear",
  "Cushion",
  "Radiant",
  "Asscher",
  "Princess",
  "Emerald",
  "Baguette",
  "Marquise",
  "Heart",
  "Trillion",
  "Other",
] as const;

/** Trillion is grouped under Other in the filter UI to save space; API still accepts both */
const SHAPE_OPTIONS_DISPLAY = SHAPE_OPTIONS.filter(
  (s) => s !== "Trillion",
) as Exclude<(typeof SHAPE_OPTIONS)[number], "Trillion">[];

type ShapeOption = (typeof SHAPE_OPTIONS)[number];

const SHAPE_ICONS: Record<ShapeOption, string> = {
  Round: roundIconDark,
  Princess: princessIconDark,
  Pear: pearIconDark,
  Marquise: marquiseIconDark,
  Radiant: radiantIconDark,
  Emerald: emeraldIconDark,
  Oval: ovalIconDark,
  Heart: heartIconDark,
  Cushion: cushionIconDark,
  Asscher: asscherIconDark,
  Baguette: baguetteIconDark,
  Trillion: trillionIconDark,
  Other: radiantIconDark, // fallback icon for Other / fancy shapes
};

const getShapeIcons = (): Record<ShapeOption, string> => {
  return SHAPE_ICONS;
};

// Non-linear weight scale: 0-5 carats get 70% of slider, 5-50 carats get 30%
// This makes it easier to select popular small weights (0-5 carats)
const WEIGHT_BREAKPOINT_CARAT = 5; // Breakpoint in carats
const WEIGHT_BREAKPOINT_SLIDER = 35; // Breakpoint in slider value (70% of 0.1-50 range)
const WEIGHT_MIN = 0.1;
const WEIGHT_MAX = 50;

// Convert slider value to carat value (non-linear)
const sliderToCarat = (sliderValue: number): number => {
  if (sliderValue <= WEIGHT_BREAKPOINT_SLIDER) {
    // 0.1-35 slider → 0.1-5 carats (70% of slider for first 5 carats)
    const ratio =
      (sliderValue - WEIGHT_MIN) / (WEIGHT_BREAKPOINT_SLIDER - WEIGHT_MIN);
    return WEIGHT_MIN + ratio * (WEIGHT_BREAKPOINT_CARAT - WEIGHT_MIN);
  } else {
    // 35-50 slider → 5-50 carats (30% of slider for 5-50 carats)
    const ratio =
      (sliderValue - WEIGHT_BREAKPOINT_SLIDER) /
      (WEIGHT_MAX - WEIGHT_BREAKPOINT_SLIDER);
    return (
      WEIGHT_BREAKPOINT_CARAT + ratio * (WEIGHT_MAX - WEIGHT_BREAKPOINT_CARAT)
    );
  }
};

// Convert carat value to slider value (non-linear inverse)
const caratToSlider = (caratValue: number): number => {
  if (caratValue <= WEIGHT_BREAKPOINT_CARAT) {
    // 0.1-5 carats → 0.1-35 slider
    const ratio =
      (caratValue - WEIGHT_MIN) / (WEIGHT_BREAKPOINT_CARAT - WEIGHT_MIN);
    return WEIGHT_MIN + ratio * (WEIGHT_BREAKPOINT_SLIDER - WEIGHT_MIN);
  } else {
    // 5-50 carats → 35-50 slider
    const ratio =
      (caratValue - WEIGHT_BREAKPOINT_CARAT) /
      (WEIGHT_MAX - WEIGHT_BREAKPOINT_CARAT);
    return (
      WEIGHT_BREAKPOINT_SLIDER + ratio * (WEIGHT_MAX - WEIGHT_BREAKPOINT_SLIDER)
    );
  }
};

// White (colorless) grades in catalog
const COLOR_OPTIONS = ["G", "F", "E", "D"] as const;
type ColorOption = (typeof COLOR_OPTIONS)[number];

// Fancy (colored) options – shown when Fancy catalog toggle is on (LGDEAL supervisors only)
const FANCY_COLOR_OPTIONS = [
  "Yellow",
  "Pink",
  "Blue",
  "Green",
  "Red",
  "Purple",
  "Orange",
  "Violet",
  "Gray",
  "Black",
  "Brown",
  "Champagne",
  "Cognac",
  "Chameleon",
  "Other",
] as const;
const FANCY_INTENSITY_OPTIONS = [
  "Faint",
  "Very light",
  "Light",
  "Fancy light",
  "Fancy",
  "Fancy dark",
  "Fancy intense",
  "Fancy vivid",
  "Fancy deep",
  "Other",
] as const;

const FANCY_OVERTONE_OPTIONS = [
  "Red",
  "Orangey Red",
  "Reddish Orange",
  "Pink",
  "Pinkish Orange",
  "Orange",
  "Yellowish Orange",
  "Yellow Orange",
  "Orangey Yellow",
  "Yellow",
  "Yellow Brown",
  "Greenish Yellow",
  "Green Yellow",
  "Yellow Green",
  "Yellowish Green",
  "Brown Greenish Yellow",
  "Gray Greenish Yellow",
  "Gray Yellowish Green",
  "Gray Green",
  "Green",
  "Bluish Green",
  "Blue Green",
  "Green Blue",
  "Greenish Blue",
  "Blue",
  "Violetish Blue",
  "Bluish Violet",
  "Other",
] as const;

// Show from worst → best (include FL = Flawless as the best grade)
const CLARITY_OPTIONS = ["VS2", "VS1", "VVS2", "VVS1", "IF", "FL"] as const;
type ClarityOption = (typeof CLARITY_OPTIONS)[number];

// Cut / Polish / Symmetry grades (FR removed)
const GRADE_OPTIONS = ["GD", "VG", "EX", "ID"] as const;
type GradeOption = (typeof GRADE_OPTIONS)[number];

// Certification labs shown in catalog filter (restricted list)
const LAB_OPTIONS = ["IGI", "GIA", "AGS", "GCAL"] as const;
type LabOption = (typeof LAB_OPTIONS)[number];

const GIRDLE_OPTIONS = [
  "Very Thin",
  "Thin",
  "Thin to Medium",
  "Medium",
  "Medium to Slightly Thick",
  "Slightly Thick",
  "Thick",
  "Very Thick",
  "Extremely Thick",
] as const;
type GirdleOption = (typeof GIRDLE_OPTIONS)[number];

type BooleanRecord<T extends string | number | symbol> = Record<T, boolean>;

interface SupplierOption {
  _id: string;
  name: string;
  description?: string;
}

interface FiltersState {
  selectedShape: ShapeOption | null;
  weightRange: [number, number];
  colors: BooleanRecord<ColorOption>;
  /** Fancy catalog: single color or empty = all */
  selectedFancyColor: string;
  selectedIntensity: string; // Fancy intensity – used when Fancy catalog toggle is on
  selectedOvertone: string; // Fancy overtone – used when Fancy catalog toggle is on
  clarities: BooleanRecord<ClarityOption>;
  cuts: BooleanRecord<GradeOption>;
  polishes: BooleanRecord<GradeOption>;
  symmetries: BooleanRecord<GradeOption>;
  labs: BooleanRecord<LabOption>;
  selectedGirdle: GirdleOption | null;
  ratioRange: [number, number];
  lengthRange: [number, number];
  widthRange: [number, number];
  heightRange: [number, number];
  totalDepthRange: [number, number];
  tableSizeRange: [number, number];
  searchQuery: string;
  selectedLocation: string;
  selectedSupplierId: string;
  technologies: BooleanRecord<string>;
}

const TECHNOLOGY_OPTIONS = ["CVD", "HPHT"] as const;

// Popular diamond source countries (for location filter dropdown)
const LOCATION_OPTIONS = [
  "Australia",
  "Belgium",
  "Canada",
  "China",
  "Germany",
  "Hong Kong",
  "India",
  "Israel",
  "Italy",
  "Japan",
  "Netherlands",
  "Spain",
  "Thailand",
  "UK",
  "UAE",
  "USA",
] as const;

const INITIAL_FILTERS_STATE: FiltersState = {
  selectedShape: null,
  weightRange: [0.3, 50],
  colors: COLOR_OPTIONS.reduce(
    (acc, color) => ({ ...acc, [color]: false }),
    {} as BooleanRecord<ColorOption>,
  ),
  selectedFancyColor: "",
  selectedIntensity: "",
  selectedOvertone: "",
  clarities: CLARITY_OPTIONS.reduce(
    (acc, clarity) => ({ ...acc, [clarity]: false }),
    {} as BooleanRecord<ClarityOption>,
  ),
  cuts: GRADE_OPTIONS.reduce(
    (acc, grade) => ({ ...acc, [grade]: false }),
    {} as BooleanRecord<GradeOption>,
  ),
  polishes: GRADE_OPTIONS.reduce(
    (acc, grade) => ({ ...acc, [grade]: false }),
    {} as BooleanRecord<GradeOption>,
  ),
  symmetries: GRADE_OPTIONS.reduce(
    (acc, grade) => ({ ...acc, [grade]: false }),
    {} as BooleanRecord<GradeOption>,
  ),
  labs: LAB_OPTIONS.reduce(
    (acc, lab) => ({ ...acc, [lab]: false }),
    {} as BooleanRecord<LabOption>,
  ),
  selectedGirdle: null,
  ratioRange: [1, 3],
  lengthRange: [0, 30],
  widthRange: [0, 30],
  heightRange: [0, 30],
  totalDepthRange: [0, 100],
  tableSizeRange: [0, 100],
  searchQuery: "",
  selectedLocation: "",
  selectedSupplierId: "",
  technologies: TECHNOLOGY_OPTIONS.reduce(
    (acc, tech) => ({ ...acc, [tech]: false }),
    {} as BooleanRecord<string>,
  ),
};

interface ParsedSearchQuery {
  error?: string;
  search?: string;
  carat?: number;
  shape?: ShapeOption;
  color?: ColorOption;
  clarity?: ClarityOption;
}

/** Translation helper for parseQuickSearchQuery (must stay sync; called from handlers only). */
type CatalogSearchTranslate = (
  key: TranslationKey,
  opts?: Record<string, string | number>,
) => string;

function looksLikeCertificateNumber(trimmed: string): boolean {
  if (trimmed.length < 4) return false;
  // Long numeric reports / cert-style ids
  if (/^\d{6,}$/.test(trimmed)) return true;
  // Alphanumeric with at least one letter (GIA…, LG…, etc.)
  if (
    /^[a-zA-Z0-9][a-zA-Z0-9\-_]*$/i.test(trimmed) &&
    /[a-zA-Z]/i.test(trimmed)
  )
    return true;
  return false;
}

/**
 * Quick search: carat (optional "ct") + any order of shape / white color D–G / clarity.
 * Examples: "2 ct", "3 ct Oval", "3 ct Oval VVS1", "3 ct Oval D VVS1", "1.5ct Round E"
 * Certificate-style strings are returned as { search }.
 */
const parseQuickSearchQuery = (
  query: string,
  t: CatalogSearchTranslate,
): ParsedSearchQuery => {
  const trimmed = query.trim();
  if (!trimmed) {
    return { error: t("catalog.invalidSearchFormat") };
  }

  if (looksLikeCertificateNumber(trimmed)) {
    return { search: trimmed };
  }

  const caratMatch = trimmed.match(/^(\d+[.,]?\d*)\s*(?:ct)?\s*(.*)$/i);
  if (!caratMatch) {
    return { error: t("catalog.invalidSearchFormat") };
  }

  const caratStr = caratMatch[1].replace(",", ".");
  const caratValue = parseFloat(caratStr);
  if (isNaN(caratValue) || caratValue <= 0) {
    return { error: t("catalog.quickSearchInvalidCarat") };
  }

  const rest = (caratMatch[2] || "").trim();
  const tokens = rest ? rest.split(/\s+/).filter(Boolean) : [];

  const shapeByLower = new Map(SHAPE_OPTIONS.map((s) => [s.toLowerCase(), s]));
  const colorByLower = new Map(COLOR_OPTIONS.map((c) => [c.toLowerCase(), c]));
  const clarityByLower = new Map(
    CLARITY_OPTIONS.map((c) => [c.toLowerCase(), c]),
  );

  let shape: ShapeOption | undefined;
  let color: ColorOption | undefined;
  let clarity: ClarityOption | undefined;

  for (const raw of tokens) {
    const tok = raw.toLowerCase();
    if (clarityByLower.has(tok)) {
      if (clarity) return { error: t("catalog.quickSearchDuplicateClarity") };
      clarity = clarityByLower.get(tok);
      continue;
    }
    if (colorByLower.has(tok)) {
      if (color) return { error: t("catalog.quickSearchDuplicateColor") };
      color = colorByLower.get(tok);
      continue;
    }
    if (shapeByLower.has(tok)) {
      if (shape) return { error: t("catalog.quickSearchDuplicateShape") };
      shape = shapeByLower.get(tok);
      continue;
    }
    return { error: t("catalog.quickSearchUnknownTerm", { term: raw }) };
  }

  return {
    carat: caratValue,
    shape,
    color,
    clarity,
  };
};

interface CartItem {
  product: Product;
  quantity: number;
}

interface ProductResponse {
  success: boolean;
  message?: string;
  diamonds?: Product[];
  products?: Product[];
}

interface NotificationState {
  isOpen: boolean;
  title: string;
  message: string;
}

const CatalogPage: React.FC = () => {
  const { t, formatCurrency } = useTranslation();
  const { user, isAuthenticated, isLgdealSupervisor } = useAuth();
  const [activeTab, setActiveTab] = useState<
    "main" | "advanced" | "perfectDiamond" | "perfectPair"
  >("main");
  const [filters, setFilters] = useState<FiltersState>(INITIAL_FILTERS_STATE);
  const [localWeightMin, setLocalWeightMin] = useState<string | number>(
    INITIAL_FILTERS_STATE.weightRange[0],
  );
  const [localWeightMax, setLocalWeightMax] = useState<string | number>(
    INITIAL_FILTERS_STATE.weightRange[1],
  );

  const [localRatioMin, setLocalRatioMin] = useState<string | number>(
    INITIAL_FILTERS_STATE.ratioRange[0],
  );
  const [localRatioMax, setLocalRatioMax] = useState<string | number>(
    INITIAL_FILTERS_STATE.ratioRange[1],
  );
  const [localLengthMin, setLocalLengthMin] = useState<string | number>(
    INITIAL_FILTERS_STATE.lengthRange[0],
  );
  const [localLengthMax, setLocalLengthMax] = useState<string | number>(
    INITIAL_FILTERS_STATE.lengthRange[1],
  );
  const [localWidthMin, setLocalWidthMin] = useState<string | number>(
    INITIAL_FILTERS_STATE.widthRange[0],
  );
  const [localWidthMax, setLocalWidthMax] = useState<string | number>(
    INITIAL_FILTERS_STATE.widthRange[1],
  );
  const [localHeightMin, setLocalHeightMin] = useState<string | number>(
    INITIAL_FILTERS_STATE.heightRange[0],
  );
  const [localHeightMax, setLocalHeightMax] = useState<string | number>(
    INITIAL_FILTERS_STATE.heightRange[1],
  );
  const [localTotalDepthMin, setLocalTotalDepthMin] = useState<string | number>(
    INITIAL_FILTERS_STATE.totalDepthRange[0],
  );
  const [localTotalDepthMax, setLocalTotalDepthMax] = useState<string | number>(
    INITIAL_FILTERS_STATE.totalDepthRange[1],
  );
  const [localTableSizeMin, setLocalTableSizeMin] = useState<string | number>(
    INITIAL_FILTERS_STATE.tableSizeRange[0],
  );
  const [localTableSizeMax, setLocalTableSizeMax] = useState<string | number>(
    INITIAL_FILTERS_STATE.tableSizeRange[1],
  );

  const [mainDiamond, setMainDiamond] = useState<Product | null>(null);
  const [alternativeDiamonds, setAlternativeDiamonds] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [showPerfectDiamondTab, setShowPerfectDiamondTab] =
    useState<boolean>(false);

  const [diamondForPairSearch, setDiamondForPairSearch] =
    useState<Product | null>(null);
  const [foundPairProduct, setFoundPairProduct] = useState<Product | null>(
    null,
  );
  const [isPairSearching, setIsPairSearching] = useState<boolean>(false);
  const [pairSearchError, setPairSearchError] = useState<string | null>(null);
  const [newTabCreated, setNewTabCreated] = useState<string | null>(null); // For tab entrance animation
  const [perfectPairOverlayPhase, setPerfectPairOverlayPhase] = useState<
    "visible" | "hiding" | null
  >(null); // null = not shown
  const [showPerfectPairTab, setShowPerfectPairTab] = useState<boolean>(false);
  const tabsAnchorRef = useRef<HTMLDivElement>(null);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [showCartNotification, setShowCartNotification] =
    useState<boolean>(false);
  const navigate = useNavigate();

  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: "",
    message: "",
  });

  const [currentProductIndex, setCurrentProductIndex] = useState<number>(0);

  /** Fancy (colored) catalog mode – only visible and used for LGDEAL supervisors */
  const [fancyCatalogMode, setFancyCatalogMode] = useState<boolean>(false);

  const allProducts = useMemo(
    () => [mainDiamond, ...alternativeDiamonds].filter(Boolean) as Product[],
    [mainDiamond, alternativeDiamonds],
  );
  const currentProduct = useMemo(
    () => allProducts[currentProductIndex] || null,
    [allProducts, currentProductIndex],
  );
  const isPerfectMatch = currentProductIndex === 0;

  useEffect(() => {
    setCurrentProductIndex(0);
    // Removed hasInitialLoad logic as it's no longer needed
  }, [mainDiamond, alternativeDiamonds]);

  useEffect(() => {
    setLocalWeightMin(filters.weightRange[0]);
    setLocalWeightMax(filters.weightRange[1]);

    setLocalRatioMin(filters.ratioRange[0]);
    setLocalRatioMax(filters.ratioRange[1]);
    setLocalLengthMin(filters.lengthRange[0]);
    setLocalLengthMax(filters.lengthRange[1]);
    setLocalWidthMin(filters.widthRange[0]);
    setLocalWidthMax(filters.widthRange[1]);
    setLocalHeightMin(filters.heightRange[0]);
    setLocalHeightMax(filters.heightRange[1]);
    setLocalTotalDepthMin(filters.totalDepthRange[0]);
    setLocalTotalDepthMax(filters.totalDepthRange[1]);
    setLocalTableSizeMin(filters.tableSizeRange[0]);
    setLocalTableSizeMax(filters.tableSizeRange[1]);
  }, [filters]);

  const handleSearchQueryChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      searchQuery: e.target.value,
    }));
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      const parsed = parseQuickSearchQuery(filters.searchQuery, t);
      if (parsed.error) {
        setNotification({
          isOpen: true,
          title: t("catalog.invalidSearch"),
          message: parsed.error,
        });
      } else {
        // Track search event
        analytics.trackSearch(filters.searchQuery, allProducts.length);
        handleFindPerfectDiamond(parsed);
      }
    }
  };

  const handleWeightInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { name, value } = e.target;
    let numericValue = parseFloat(value);

    if (name === "weightMinInput") {
      setLocalWeightMin(value);
      if (value === "" || isNaN(numericValue)) return;
      numericValue = Math.min(
        numericValue,
        parseFloat(String(localWeightMax)) ||
          INITIAL_FILTERS_STATE.weightRange[1],
      );
      setFilters((prev) => ({
        ...prev,
        weightRange: [numericValue, prev.weightRange[1]],
      }));
    } else if (name === "weightMaxInput") {
      setLocalWeightMax(value);
      if (value === "" || isNaN(numericValue)) return;
      numericValue = Math.max(
        numericValue,
        parseFloat(String(localWeightMin)) ||
          INITIAL_FILTERS_STATE.weightRange[0],
      );
      setFilters((prev) => ({
        ...prev,
        weightRange: [prev.weightRange[0], numericValue],
      }));
    }
  };

  const handleSliderChange = (value: [number, number]): void => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      weightRange: value,
    }));
  };

  const handleCheckboxGroupChange = (
    groupName: keyof FiltersState,
    itemName: string,
  ): void => {
    setFilters((prevFilters) => {
      const updatedGroup = {
        ...(prevFilters[groupName as keyof typeof prevFilters] as Record<
          string,
          boolean
        >),
        [itemName]: !(
          prevFilters[groupName as keyof typeof prevFilters] as Record<
            string,
            boolean
          >
        )[itemName],
      };

      return {
        ...prevFilters,
        [groupName]: updatedGroup,
      };
    });
  };

  const handleShapeSelect = (shapeName: ShapeOption): void => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      selectedShape: prevFilters.selectedShape === shapeName ? null : shapeName,
    }));
  };

  const handleGirdleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value;
    setFilters((prevFilters) => ({
      ...prevFilters,
      selectedGirdle: value === "" ? null : (value as GirdleOption),
    }));
  };

  const handleResetFilters = (): void => {
    setFilters(INITIAL_FILTERS_STATE);
  };

  // Quick Preset: 3EX (Triple Excellent) - Toggle on/off
  // Sets EX and ID for Cut, Polish, and Symmetry
  const handle3EXPreset = (): void => {
    setFilters((prevFilters) => {
      // Check if all three are already set to both EX and ID
      const isActive =
        prevFilters.cuts["EX"] &&
        prevFilters.cuts["ID"] &&
        prevFilters.polishes["EX"] &&
        prevFilters.polishes["ID"] &&
        prevFilters.symmetries["EX"] &&
        prevFilters.symmetries["ID"];

      // Toggle: if active, turn off; if not active, turn on
      return {
        ...prevFilters,
        cuts: { ...prevFilters.cuts, EX: !isActive, ID: !isActive },
        polishes: { ...prevFilters.polishes, EX: !isActive, ID: !isActive },
        symmetries: { ...prevFilters.symmetries, EX: !isActive, ID: !isActive },
      };
    });
  };

  const handleAdvancedRangeInputChange = (
    e: ChangeEvent<HTMLInputElement>,
  ): void => {
    const { name, value } = e.target;
    let numericValue = parseFloat(value);

    switch (name) {
      case "ratioMinInput":
        setLocalRatioMin(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.min(
          numericValue,
          parseFloat(String(localRatioMax)) ||
            INITIAL_FILTERS_STATE.ratioRange[1],
        );
        setFilters((prev) => ({
          ...prev,
          ratioRange: [numericValue, prev.ratioRange[1]],
        }));
        break;
      case "ratioMaxInput":
        setLocalRatioMax(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.max(
          numericValue,
          parseFloat(String(localRatioMin)) ||
            INITIAL_FILTERS_STATE.ratioRange[0],
        );
        setFilters((prev) => ({
          ...prev,
          ratioRange: [prev.ratioRange[0], numericValue],
        }));
        break;
      case "lengthMinInput":
        setLocalLengthMin(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.min(
          numericValue,
          parseFloat(String(localLengthMax)) ||
            INITIAL_FILTERS_STATE.lengthRange[1],
        );
        setFilters((prev) => ({
          ...prev,
          lengthRange: [numericValue, prev.lengthRange[1]],
        }));
        break;
      case "lengthMaxInput":
        setLocalLengthMax(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.max(
          numericValue,
          parseFloat(String(localLengthMin)) ||
            INITIAL_FILTERS_STATE.lengthRange[0],
        );
        setFilters((prev) => ({
          ...prev,
          lengthRange: [prev.lengthRange[0], numericValue],
        }));
        break;
      case "widthMinInput":
        setLocalWidthMin(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.min(
          numericValue,
          parseFloat(String(localWidthMax)) ||
            INITIAL_FILTERS_STATE.widthRange[1],
        );
        setFilters((prev) => ({
          ...prev,
          widthRange: [numericValue, prev.widthRange[1]],
        }));
        break;
      case "widthMaxInput":
        setLocalWidthMax(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.max(
          numericValue,
          parseFloat(String(localWidthMin)) ||
            INITIAL_FILTERS_STATE.widthRange[0],
        );
        setFilters((prev) => ({
          ...prev,
          widthRange: [prev.widthRange[0], numericValue],
        }));
        break;
      case "heightMinInput":
        setLocalHeightMin(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.min(
          numericValue,
          parseFloat(String(localHeightMax)) ||
            INITIAL_FILTERS_STATE.heightRange[1],
        );
        setFilters((prev) => ({
          ...prev,
          heightRange: [numericValue, prev.heightRange[1]],
        }));
        break;
      case "heightMaxInput":
        setLocalHeightMax(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.max(
          numericValue,
          parseFloat(String(localHeightMin)) ||
            INITIAL_FILTERS_STATE.heightRange[0],
        );
        setFilters((prev) => ({
          ...prev,
          heightRange: [prev.heightRange[0], numericValue],
        }));
        break;
      case "totalDepthMinInput":
        setLocalTotalDepthMin(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.min(
          numericValue,
          parseFloat(String(localTotalDepthMax)) ||
            INITIAL_FILTERS_STATE.totalDepthRange[1],
        );
        setFilters((prev) => ({
          ...prev,
          totalDepthRange: [numericValue, prev.totalDepthRange[1]],
        }));
        break;
      case "totalDepthMaxInput":
        setLocalTotalDepthMax(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.max(
          numericValue,
          parseFloat(String(localTotalDepthMin)) ||
            INITIAL_FILTERS_STATE.totalDepthRange[0],
        );
        setFilters((prev) => ({
          ...prev,
          totalDepthRange: [prev.totalDepthRange[0], numericValue],
        }));
        break;
      case "tableSizeMinInput":
        setLocalTableSizeMin(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.min(
          numericValue,
          parseFloat(String(localTableSizeMax)) ||
            INITIAL_FILTERS_STATE.tableSizeRange[1],
        );
        setFilters((prev) => ({
          ...prev,
          tableSizeRange: [numericValue, prev.tableSizeRange[1]],
        }));
        break;
      case "tableSizeMaxInput":
        setLocalTableSizeMax(value);
        if (value === "" || isNaN(numericValue)) return;
        numericValue = Math.max(
          numericValue,
          parseFloat(String(localTableSizeMin)) ||
            INITIAL_FILTERS_STATE.tableSizeRange[0],
        );
        setFilters((prev) => ({
          ...prev,
          tableSizeRange: [prev.tableSizeRange[0], numericValue],
        }));
        break;
      default:
        break;
    }
  };

  const handleAdvancedSliderChange = (
    name: string,
    value: [number, number],
  ): void => {
    setFilters((prevFilters) => ({
      ...prevFilters,
      [name]: value,
    }));
  };

  const handleFindPerfectDiamond = async (
    parsed?: ParsedSearchQuery,
  ): Promise<void> => {
    setIsSearching(true);
    setSearchError(null);
    setMainDiamond(null);
    setAlternativeDiamonds([]);

    try {
      const queryParams: Record<string, string> = {};

      if (parsed) {
        if (parsed.search) {
          // For certificate number search, only use search parameter and catalog mode (so colored stones don't appear in White catalog)
          queryParams.search = parsed.search;
          queryParams.fancyOnly = fancyCatalogMode ? "true" : "false";
        } else {
          if (parsed.carat) {
            // For specific carat searches, add 2% tolerance
            const minCarat = parsed.carat;
            const maxCarat = parsed.carat * 1.02;
            queryParams.weight = `${minCarat},${maxCarat}`;
          }
          if (parsed.shape) queryParams.shape = parsed.shape;
          if (parsed.color) queryParams.color = parsed.color;
          if (parsed.clarity) queryParams.clarity = parsed.clarity;
        }
      }

      // Only apply filters if we're not doing a certificate number search
      if (!queryParams.search) {
        const quick = parsed && !parsed.search ? parsed : null;

        // Always send catalog mode so server can exclude fancy stones in White catalog
        queryParams.fancyOnly = fancyCatalogMode ? "true" : "false";
        if (filters.selectedShape && !queryParams.shape) {
          // Other includes Trillion on the client (Trillion is not shown as separate button)
          queryParams.shape =
            filters.selectedShape === "Other" ||
            filters.selectedShape === "Trillion"
              ? "Other,Trillion"
              : filters.selectedShape;
        }

        if (
          !quick &&
          (filters.weightRange[0] !== INITIAL_FILTERS_STATE.weightRange[0] ||
            filters.weightRange[1] !== INITIAL_FILTERS_STATE.weightRange[1])
        ) {
          queryParams.weight = `${filters.weightRange[0]},${filters.weightRange[1]}`;
        }

        if (fancyCatalogMode) {
          queryParams.fancyOnly = "true";
          if (!quick?.color && filters.selectedFancyColor.trim()) {
            queryParams.color = filters.selectedFancyColor.trim();
          }
          if (filters.selectedIntensity && filters.selectedIntensity.trim()) {
            queryParams.intensity = filters.selectedIntensity.trim();
          }
          if (filters.selectedOvertone && filters.selectedOvertone.trim()) {
            queryParams.overtone = filters.selectedOvertone.trim();
          }
        } else if (!quick?.color) {
          const selectedColors = COLOR_OPTIONS.filter((c) => filters.colors[c]);
          if (selectedColors.length > 0) {
            queryParams.color = selectedColors.join(",");
          }
        }

        if (!quick?.clarity) {
          const selectedClarities = CLARITY_OPTIONS.filter(
            (c) => filters.clarities[c],
          );
          if (selectedClarities.length > 0) {
            queryParams.clarity = selectedClarities.join(",");
          }
        }

        const selectedCuts = GRADE_OPTIONS.filter((g) => filters.cuts[g]);
        if (selectedCuts.length > 0) {
          queryParams.cut = selectedCuts.join(",");
        }

        const selectedPolishes = GRADE_OPTIONS.filter(
          (g) => filters.polishes[g],
        );
        if (selectedPolishes.length > 0) {
          queryParams.polish = selectedPolishes.join(",");
        }

        const selectedSymmetries = GRADE_OPTIONS.filter(
          (g) => filters.symmetries[g],
        );
        if (selectedSymmetries.length > 0) {
          queryParams.symmetry = selectedSymmetries.join(",");
        }

        const selectedLabs = LAB_OPTIONS.filter((l) => filters.labs[l]);
        if (selectedLabs.length > 0) {
          queryParams.lab = selectedLabs.join(",");
        }

        if (filters.selectedGirdle) {
          queryParams.girdle = filters.selectedGirdle;
        }

        // Location filter
        if (filters.selectedLocation && filters.selectedLocation.trim()) {
          queryParams.location = filters.selectedLocation.trim();
        }

        // Supplier filter (LGDEAL supervisors only – sent only when supervisor)
        if (filters.selectedSupplierId && filters.selectedSupplierId.trim()) {
          queryParams.companyId = filters.selectedSupplierId.trim();
        }

        // Technology filter - get selected technologies
        const selectedTechnologies = Object.keys(filters.technologies).filter(
          (tech) => filters.technologies[tech],
        );
        if (selectedTechnologies.length > 0) {
          queryParams.technology = selectedTechnologies.join(",");
        }

        if (
          filters.ratioRange[0] !== INITIAL_FILTERS_STATE.ratioRange[0] ||
          filters.ratioRange[1] !== INITIAL_FILTERS_STATE.ratioRange[1]
        ) {
          queryParams.ratio = `${filters.ratioRange[0]},${filters.ratioRange[1]}`;
        }
        if (
          filters.lengthRange[0] !== INITIAL_FILTERS_STATE.lengthRange[0] ||
          filters.lengthRange[1] !== INITIAL_FILTERS_STATE.lengthRange[1]
        ) {
          queryParams.length = `${filters.lengthRange[0]},${filters.lengthRange[1]}`;
        }
        if (
          filters.widthRange[0] !== INITIAL_FILTERS_STATE.widthRange[0] ||
          filters.widthRange[1] !== INITIAL_FILTERS_STATE.widthRange[1]
        ) {
          queryParams.width = `${filters.widthRange[0]},${filters.widthRange[1]}`;
        }
        if (
          filters.heightRange[0] !== INITIAL_FILTERS_STATE.heightRange[0] ||
          filters.heightRange[1] !== INITIAL_FILTERS_STATE.heightRange[1]
        ) {
          queryParams.height = `${filters.heightRange[0]},${filters.heightRange[1]}`;
        }
        if (
          filters.totalDepthRange[0] !==
            INITIAL_FILTERS_STATE.totalDepthRange[0] ||
          filters.totalDepthRange[1] !==
            INITIAL_FILTERS_STATE.totalDepthRange[1]
        ) {
          queryParams.depth = `${filters.totalDepthRange[0]},${filters.totalDepthRange[1]}`;
        }
        if (
          filters.tableSizeRange[0] !==
            INITIAL_FILTERS_STATE.tableSizeRange[0] ||
          filters.tableSizeRange[1] !== INITIAL_FILTERS_STATE.tableSizeRange[1]
        ) {
          queryParams.table = `${filters.tableSizeRange[0]},${filters.tableSizeRange[1]}`;
        }
      }

      const response = await api.get<ProductResponse>("/marketplace/search", {
        params: queryParams,
      });
      const data = response.data;

      if (data.success) {
        if (data.products && data.products.length > 0) {
          setMainDiamond(data.products[0]);

          if (data.products.length > 1) {
            const alternatives = data.products.slice(1, 6);
            setAlternativeDiamonds(alternatives);
          } else {
            setAlternativeDiamonds([]);
          }

          setShowPerfectDiamondTab(true);
          setActiveTab("perfectDiamond");
        } else {
          setSearchError(t("catalog.noDiamondsFound"));
        }
      } else {
        setSearchError(data.message || t("catalog.errorSearching"));
      }
    } catch (error) {
      setSearchError(t("catalog.failedToSearch"));
    } finally {
      setIsSearching(false);
    }
  };

  const handleViewMedia = (videoLink: string): void => {
    window.open(videoLink, "_blank");
  };

  const handleFindPerfectPair = async (
    referenceProduct: Product,
  ): Promise<void> => {
    // 1. Open the tab and show dim overlay so user notices the context change
    setShowPerfectPairTab(true);
    setActiveTab("perfectPair");
    setNewTabCreated("perfectPair");
    setPerfectPairOverlayPhase("visible");
    setIsPairSearching(true);
    setPairSearchError(null);
    setDiamondForPairSearch(referenceProduct);
    setFoundPairProduct(null);

    // 2. After DOM updates, scroll so the tab bar is at the top of the viewport
    requestAnimationFrame(() => {
      setTimeout(() => {
        tabsAnchorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
    });

    // 3. Start fading out overlay after a short moment so focus goes to the new tab
    const overlayVisibleMs = 500;
    setTimeout(() => {
      setPerfectPairOverlayPhase("hiding");
    }, overlayVisibleMs);

    // 4. Unmount overlay after fade-out transition
    const overlayFadeMs = 450;
    setTimeout(() => {
      setPerfectPairOverlayPhase(null);
    }, overlayVisibleMs + overlayFadeMs);

    // 5. Remove "new tab" animation state after the entrance animation finishes
    setTimeout(() => {
      setNewTabCreated(null);
    }, 2800);

    try {
      const queryParams = {
        referenceId: referenceProduct._id,
        shape: referenceProduct.shape,
        carat: referenceProduct.carat,
        ...(referenceProduct.color && { color: referenceProduct.color }),
        ...(referenceProduct.clarity && { clarity: referenceProduct.clarity }),
      };

      const response = await api.get<ProductResponse>(
        "/marketplace/find-pair",
        { params: queryParams },
      );
      const data = response.data;

      if (data.success) {
        if (data.diamonds && data.diamonds.length > 0) {
          setFoundPairProduct(data.diamonds[0]);
        } else {
          setPairSearchError(t("catalog.noPairFoundError"));
        }
      } else {
        setPairSearchError(data.message || t("catalog.errorSearchingPair"));
      }
    } catch (error) {
      setPairSearchError(t("catalog.failedToSearchPair"));
    } finally {
      setIsPairSearching(false);
    }
  };

  const handleCloseTab = (
    tabToClose: "perfectDiamond" | "perfectPair",
  ): void => {
    if (tabToClose === "perfectDiamond") {
      setShowPerfectDiamondTab(false);
      setMainDiamond(null);
      setAlternativeDiamonds([]);
      setCurrentProductIndex(0);
      setSearchError("");
      if (activeTab === "perfectDiamond") {
        setActiveTab("main");
      }
    } else if (tabToClose === "perfectPair") {
      setShowPerfectPairTab(false);
      setFoundPairProduct(null);
      setDiamondForPairSearch(null);
      setPairSearchError("");
      if (activeTab === "perfectPair") {
        setActiveTab("main");
      }
    }
  };

  const handleAddToCart = async (product: Product): Promise<void> => {
    try {
      interface CartResponse {
        success: boolean;
        message?: string;
        items?: CartItem[];
        totalItems?: number;
        totalAmount?: number;
      }

      const response = await api.post<CartResponse>("/cart/add", {
        productId: product._id,
      });
      const data = response.data;

      if (data.success) {
        if (data.items) {
          setCartItems(data.items);
        } else {
          setCartItems((prev) => [...prev, { product, quantity: 1 }]);
        }

        setShowCartNotification(true);
        setTimeout(() => setShowCartNotification(false), 3000);

        window.dispatchEvent(new CustomEvent("cart-updated"));
      } else {
        setNotification({
          isOpen: true,
          title: t("catalog.addToCartFailed"),
          message: t("catalog.failedToAddToCart", {
            message: data.message || t("common.error"),
          }),
        });
      }
    } catch (error) {
      setNotification({
        isOpen: true,
        title: t("common.error"),
        message: t("cart.loadCartError"),
      });
    }
  };

  const handleGoToCart = (): void => {
    navigate("/cart");
  };

  const isProductInCart = (productId: string): boolean => {
    return cartItems.some(
      (item) => item && item.product && item.product._id === productId,
    );
  };

  // Обработчики переключения между продуктами
  const handlePreviousProduct = () => {
    setCurrentProductIndex((i) => (i > 0 ? i - 1 : allProducts.length - 1));
  };

  const handleNextProduct = () => {
    setCurrentProductIndex((i) => (i < allProducts.length - 1 ? i + 1 : 0));
  };

  const renderShapeFilter = () => {
    const SHAPE_ICONS = getShapeIcons();
    return (
      <div className={styles.filterGroup}>
        <div className={styles["shape-filter-label"]}>{t("catalog.shape")}</div>
        <div className={styles["shape-icons-container"]}>
          {SHAPE_OPTIONS_DISPLAY.map((shape) => {
            const isActive =
              filters.selectedShape === shape ||
              (shape === "Other" && filters.selectedShape === "Trillion");
            return (
              <div
                key={shape}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                aria-label={t(`catalog.shapes.${shape}`)}
                className={`${styles["shape-icon-button"]} ${isActive ? styles.active : ""}`}
                onClick={() => handleShapeSelect(shape)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleShapeSelect(shape);
                  }
                }}
              >
                <img
                  src={SHAPE_ICONS[shape]}
                  alt=""
                  className={styles["shape-icon-image"]}
                />
                <span className={styles["shape-name"]}>
                  {t(`catalog.shapes.${shape}`)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeightFilter = () => (
    <div className={`${styles.filterGroup} ${styles.primaryWeight}`}>
      <label className={styles.filterLabel}>{t("catalog.weight")}</label>
      <div className={styles["weight-inputs-container"]}>
        <div className={styles["input-group"]}>
          <input
            type="number"
            name="weightMinInput"
            value={localWeightMin}
            onChange={handleWeightInputChange}
            min="0.1"
            max={filters.weightRange[1]}
            step="0.1"
            className={`${styles["filter-input"]} ${styles["filter-input-range"]} ${styles["weight-input"]}`}
          />
        </div>
        <div className={styles["input-group"]}>
          <input
            type="number"
            name="weightMaxInput"
            value={localWeightMax}
            onChange={handleWeightInputChange}
            min={filters.weightRange[0]}
            max="50"
            step="0.1"
            className={`${styles["filter-input"]} ${styles["filter-input-range"]} ${styles["weight-input"]}`}
          />
        </div>
      </div>
      <div className={styles["slider-container"]}>
        <Slider
          range
          min={0.1}
          max={50}
          step={0.1}
          value={[
            caratToSlider(filters.weightRange[0]),
            caratToSlider(filters.weightRange[1]),
          ]}
          onChange={(value: number | number[]) => {
            if (Array.isArray(value) && value.length === 2) {
              // Convert slider values to carat values using non-linear scale
              const caratMin = sliderToCarat(value[0]);
              const caratMax = sliderToCarat(value[1]);
              handleSliderChange([
                Math.round(caratMin * 10) / 10, // Round to 1 decimal
                Math.round(caratMax * 10) / 10,
              ]);
            }
          }}
          railStyle={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
          trackStyle={[{ backgroundColor: "var(--color-brand-primary)" }]}
          handleStyle={[
            {
              backgroundColor: "var(--color-text-on-dark)",
              borderColor: "var(--color-brand-primary)",
            },
            {
              backgroundColor: "var(--color-text-on-dark)",
              borderColor: "var(--color-brand-primary)",
            },
          ]}
        />
      </div>
    </div>
  );

  const renderCheckboxGroupFilter = (
    label: string,
    groupName: keyof FiltersState,
    options: readonly string[],
    extraClassName?: string,
    groupClassName?: string,
  ) => (
    <div className={`${styles.filterGroup} ${groupClassName || ""}`}>
      <label className={styles.filterLabel}>{label}</label>
      <div className={`${styles.checkboxButtonGroup} ${extraClassName || ""}`}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.filterButton} ${(filters[groupName] as Record<string, boolean>)[option] ? styles.active : ""}`}
            onClick={() => handleCheckboxGroupChange(groupName, option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );

  const renderAdvancedRangeFilter = (
    label: string,
    minName: string,
    maxName: string,
    rangeName: keyof FiltersState,
    localMin: string | number,
    localMax: string | number,
    min: number,
    max: number,
    unit = "",
  ) => (
    <div className={styles.filterGroup}>
      <label className={styles.filterLabel}>{label}</label>
      <div className={styles["weight-inputs-container"]}>
        <input
          type="number"
          name={`${minName}Input`}
          value={localMin}
          onChange={handleAdvancedRangeInputChange}
          placeholder={t("catalog.min")}
          className={`${styles["filter-input"]} ${styles["filter-input-range"]}`}
          min={min}
          step={label === "Ratio" ? 0.1 : 0.5}
        />
        {unit && <span className={styles["range-unit"]}>{unit}</span>}
        <input
          type="number"
          name={`${maxName}Input`}
          value={localMax}
          onChange={handleAdvancedRangeInputChange}
          placeholder={t("catalog.max")}
          className={`${styles["filter-input"]} ${styles["filter-input-range"]}`}
          max={max}
          step={label === "Ratio" ? 0.1 : 0.5}
        />
      </div>
      <div className={styles["slider-container"]}>
        <Slider
          range
          min={min}
          max={max}
          step={label === "Ratio" ? 0.1 : 0.5}
          value={filters[rangeName] as [number, number]}
          onChange={(value: number | number[]) => {
            if (Array.isArray(value) && value.length === 2) {
              handleAdvancedSliderChange(rangeName as string, [
                value[0],
                value[1],
              ]);
            }
          }}
          className={styles["range-slider"]}
          railStyle={{ backgroundColor: "rgba(255, 255, 255, 0.1)" }}
          trackStyle={[{ backgroundColor: "var(--color-brand-primary)" }]}
          handleStyle={[
            {
              backgroundColor: "var(--color-text-on-dark)",
              borderColor: "var(--color-brand-primary)",
            },
            {
              backgroundColor: "var(--color-text-on-dark)",
              borderColor: "var(--color-brand-primary)",
            },
          ]}
        />
      </div>
    </div>
  );

  const renderPerfectDiamondFinder = () => (
    <div className={styles.perfectDiamondFinder}>
      <h3>{t("catalog.findPerfectDiamond")}</h3>
      <div className={styles.searchInputGroup}>
        <Input
          type="text"
          value={filters.searchQuery}
          onChange={handleSearchQueryChange}
          onKeyDown={handleSearchKeyDown}
          placeholder={t("catalog.searchPlaceholder")}
          containerClassName={styles.searchInputContainer}
          inputSize="lg"
          leftIcon={<i className={`fas fa-search ${styles["searchIcon"]}`} />}
          rightAddon={
            <span className={styles.searchHint}>{t("catalog.pressEnter")}</span>
          }
          helperText={t("catalog.searchFormatHint")}
          aria-label={t("catalog.searchPlaceholder")}
        />
      </div>
      {searchError && <p className={styles.searchError}>{searchError}</p>}
    </div>
  );

  const tabs = useMemo<TabItem[]>(
    () => [
      {
        key: "main",
        label: t("catalog.mainFilters"),
        icon: "fas fa-filter",
      },
      {
        key: "advanced",
        label: t("catalog.advancedFilters"),
        icon: "fas fa-cogs",
      },
      ...(showPerfectDiamondTab
        ? [
            {
              key: "perfectDiamond",
              label: t("catalog.findPerfectDiamond"),
              icon: "fas fa-gem",
              closable: true,
            },
          ]
        : []),
      ...(showPerfectPairTab
        ? [
            {
              key: "perfectPair",
              label: t("catalog.foundPerfectPair"),
              icon: "fas fa-link",
              closable: true,
            },
          ]
        : []),
    ],
    [t, showPerfectDiamondTab, showPerfectPairTab],
  );

  const isCompanyActive = !!(
    user?.company &&
    typeof user.company === "object" &&
    user.company.status === "active"
  );

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  useEffect(() => {
    if (!isLgdealSupervisor) return;
    api
      .get<SupplierOption[]>("/marketplace/suppliers")
      .then((res) => setSuppliers(res.data || []))
      .catch(() => setSuppliers([]));
  }, [isLgdealSupervisor]);

  return (
    <PageContainer>
      <SEO
        title={t("catalog.title")}
        description="Filter and discover certified lab-grown diamonds by shape, carat, color, clarity, and more. Transparent pricing and professional tools."
        keywords={[
          "diamond catalog",
          "lab-grown diamonds",
          "B2B Lab-Grown Diamond Exchange",
          "diamond filters",
          "certified diamonds",
        ]}
        type="website"
      />

      <PageHeader title={t("catalog.title")} subtitle={t("catalog.subtitle")} />

      <PageSection>
        {/* Overlay when Perfect Pair tab opens: dims page, then fades out so tabs are obvious */}
        {perfectPairOverlayPhase !== null && (
          <div
            className={`${styles["perfect-pair-overlay"]} ${perfectPairOverlayPhase === "hiding" ? styles["perfect-pair-overlay--hiding"] : ""}`}
            aria-hidden
          />
        )}

        <div className={styles["filter-container"]} ref={tabsAnchorRef}>
          <div className={styles["catalog-toolbar"]}>
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={(tabKey) => setActiveTab(tabKey as typeof activeTab)}
              onTabClose={(tabKey) =>
                handleCloseTab(tabKey as "perfectDiamond" | "perfectPair")
              }
              showContent={false}
              newTabKey={newTabCreated}
            />
          </div>

          {(activeTab === "main" || activeTab === "advanced") && (
            <div className={styles["search-container"]}>
              {renderPerfectDiamondFinder()}
            </div>
          )}

          <div className={styles["filter-area"]}>
            {activeTab === "main" && (
              <div className={styles["filters-main"]}>
                {renderShapeFilter()}
                <div className={styles["filters-primary-section"]}>
                  {/* Catalog mode: White / Fancy – only for LGDEAL supervisors */}
                  {isLgdealSupervisor && (
                    <div className={styles["catalog-mode-row"]}>
                      <span className={styles["catalog-mode-label"]}>
                        {t("catalog.catalogMode")}
                      </span>
                      <div
                        className={styles["catalog-mode-segments"]}
                        role="tablist"
                        aria-label={t("catalog.catalogMode")}
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={!fancyCatalogMode}
                          className={`${styles["catalog-mode-segment"]} ${!fancyCatalogMode ? styles["catalog-mode-segment--active"] : ""}`}
                          onClick={() => setFancyCatalogMode(false)}
                        >
                          {t("catalog.whiteCatalog")}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={fancyCatalogMode}
                          className={`${styles["catalog-mode-segment"]} ${fancyCatalogMode ? styles["catalog-mode-segment--active"] : ""}`}
                          onClick={() => setFancyCatalogMode(true)}
                        >
                          {t("catalog.fancyCatalog")}
                        </button>
                      </div>
                    </div>
                  )}

                  {fancyCatalogMode && isLgdealSupervisor ? (
                    <>
                      <div className={styles.primaryRow}>
                        {renderWeightFilter()}
                        <div
                          className={`${styles.filterGroup} ${styles.primaryColor} ${styles.primaryFancyColor}`}
                        >
                          <Select
                            label={t("catalog.color")}
                            containerClassName={styles.fancySelectFullWidth}
                            options={[
                              { value: "", label: t("catalog.allFancyColor") },
                              ...FANCY_COLOR_OPTIONS.map((opt) => ({
                                value: opt,
                                label: opt,
                              })),
                            ]}
                            value={filters.selectedFancyColor}
                            onChange={(e) =>
                              setFilters((prev) => ({
                                ...prev,
                                selectedFancyColor: e.target.value,
                              }))
                            }
                          />
                        </div>
                        {renderCheckboxGroupFilter(
                          t("catalog.clarity"),
                          "clarities",
                          CLARITY_OPTIONS,
                          styles.clarityCheckboxGroup,
                          styles.primaryClarity,
                        )}
                      </div>
                      <div className={styles.fancyDetailRow}>
                        <div
                          className={`${styles.filterGroup} ${styles.primaryFancyDetail}`}
                        >
                          <Select
                            label={t("catalog.intensity")}
                            containerClassName={styles.fancySelectFullWidth}
                            options={[
                              { value: "", label: t("catalog.allIntensity") },
                              ...FANCY_INTENSITY_OPTIONS.map((opt) => ({
                                value: opt,
                                label: opt,
                              })),
                            ]}
                            value={filters.selectedIntensity}
                            onChange={(e) =>
                              setFilters((prev) => ({
                                ...prev,
                                selectedIntensity: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div
                          className={`${styles.filterGroup} ${styles.primaryFancyDetail}`}
                        >
                          <Select
                            label={t("catalog.overtone")}
                            containerClassName={styles.fancySelectFullWidth}
                            options={[
                              { value: "", label: t("catalog.allOvertone") },
                              ...FANCY_OVERTONE_OPTIONS.map((opt) => ({
                                value: opt,
                                label: opt,
                              })),
                            ]}
                            value={filters.selectedOvertone}
                            onChange={(e) =>
                              setFilters((prev) => ({
                                ...prev,
                                selectedOvertone: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className={styles.primaryRow}>
                      {renderWeightFilter()}
                      {renderCheckboxGroupFilter(
                        t("catalog.color"),
                        "colors",
                        COLOR_OPTIONS,
                        undefined,
                        styles.primaryColor,
                      )}
                      {renderCheckboxGroupFilter(
                        t("catalog.clarity"),
                        "clarities",
                        CLARITY_OPTIONS,
                        styles.clarityCheckboxGroup,
                        styles.primaryClarity,
                      )}
                    </div>
                  )}
                </div>

                <div className={styles["filters-secondary-section"]}>
                  <div className={styles["secondary-filters-grid"]}>
                    {renderCheckboxGroupFilter(
                      t("catalog.cut"),
                      "cuts",
                      GRADE_OPTIONS,
                      undefined,
                      `${styles.secondaryQuality} ${styles.secondaryCut}`,
                    )}
                    {renderCheckboxGroupFilter(
                      t("catalog.polish"),
                      "polishes",
                      GRADE_OPTIONS,
                      undefined,
                      `${styles.secondaryQuality} ${styles.secondaryPolish}`,
                    )}
                    {renderCheckboxGroupFilter(
                      t("catalog.symmetry"),
                      "symmetries",
                      GRADE_OPTIONS,
                      undefined,
                      `${styles.secondaryQuality} ${styles.secondarySymmetry}`,
                    )}

                    {/* 3EX Quick Preset Button */}
                    {renderCheckboxGroupFilter(
                      t("catalog.lab"),
                      "labs",
                      LAB_OPTIONS,
                      undefined,
                      styles.secondaryLab,
                    )}

                    <div
                      className={`${styles.exPresetContainer} ${styles.secondaryPreset}`}
                    >
                      <button
                        type="button"
                        className={`${styles["ex-preset-button"]} ${filters.cuts["EX"] && filters.cuts["ID"] && filters.polishes["EX"] && filters.polishes["ID"] && filters.symmetries["EX"] && filters.symmetries["ID"] ? styles.active : ""}`}
                        onClick={handle3EXPreset}
                        title="Triple Excellent: Cut, Polish, Symmetry = Excellent"
                      >
                        <i className="fas fa-star"></i>
                        3EX
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "advanced" && (
              <div className={styles["filters-advanced"]}>
                <div className={styles["advanced-filters-grid"]}>
                  {renderAdvancedRangeFilter(
                    t("catalog.ratio"),
                    "ratioMin",
                    "ratioMax",
                    "ratioRange",
                    localRatioMin,
                    localRatioMax,
                    1,
                    3,
                  )}
                  {renderAdvancedRangeFilter(
                    t("catalog.length"),
                    "lengthMin",
                    "lengthMax",
                    "lengthRange",
                    localLengthMin,
                    localLengthMax,
                    0,
                    30,
                    "mm",
                  )}
                  {renderAdvancedRangeFilter(
                    t("catalog.width"),
                    "widthMin",
                    "widthMax",
                    "widthRange",
                    localWidthMin,
                    localWidthMax,
                    0,
                    30,
                    "mm",
                  )}
                  {renderAdvancedRangeFilter(
                    t("catalog.height"),
                    "heightMin",
                    "heightMax",
                    "heightRange",
                    localHeightMin,
                    localHeightMax,
                    0,
                    30,
                    "mm",
                  )}
                  {renderAdvancedRangeFilter(
                    t("catalog.totalDepth"),
                    "totalDepthMin",
                    "totalDepthMax",
                    "totalDepthRange",
                    localTotalDepthMin,
                    localTotalDepthMax,
                    0,
                    100,
                    "%",
                  )}
                  {renderAdvancedRangeFilter(
                    t("catalog.tableSize"),
                    "tableSizeMin",
                    "tableSizeMax",
                    "tableSizeRange",
                    localTableSizeMin,
                    localTableSizeMax,
                    0,
                    100,
                    "%",
                  )}

                  {/* Girdle dropdown */}
                  <div className={styles.filterGroup}>
                    <Select
                      label={t("catalog.girdle")}
                      options={[
                        { value: "", label: "" },
                        ...GIRDLE_OPTIONS.map((girdle) => ({
                          value: girdle,
                          label: girdle,
                        })),
                      ]}
                      value={filters.selectedGirdle || ""}
                      onChange={handleGirdleChange}
                    />
                  </div>

                  {/* Location dropdown */}
                  <div className={styles.filterGroup}>
                    <Select
                      label={t("catalog.location")}
                      options={[
                        { value: "", label: t("catalog.allLocations") },
                        ...LOCATION_OPTIONS.map((loc) => ({
                          value: loc,
                          label: loc,
                        })),
                      ]}
                      value={filters.selectedLocation || ""}
                      onChange={(e) => {
                        setFilters((prev) => ({
                          ...prev,
                          selectedLocation: e.target.value,
                        }));
                      }}
                    />
                  </div>

                  {/* Supplier dropdown – only for LGDEAL supervisors */}
                  {isLgdealSupervisor && (
                    <div className={styles.filterGroup}>
                      <Select
                        label={t("catalog.supplier")}
                        options={[
                          { value: "", label: t("catalog.allSuppliers") },
                          ...suppliers.map((s) => ({
                            value: s._id,
                            label: s.name,
                          })),
                        ]}
                        value={filters.selectedSupplierId || ""}
                        onChange={(e) => {
                          setFilters((prev) => ({
                            ...prev,
                            selectedSupplierId: e.target.value,
                          }));
                        }}
                      />
                    </div>
                  )}

                  {/* Technology filter */}
                  {renderCheckboxGroupFilter(
                    t("catalog.technology"),
                    "technologies",
                    TECHNOLOGY_OPTIONS,
                  )}
                </div>
              </div>
            )}

            {activeTab === "perfectDiamond" && showPerfectDiamondTab && (
              <div
                className={`${styles["search-result-area"]} ${currentProduct ? styles["has-results"] : ""}`}
              >
                {isSearching && (
                  <p className={styles["loading-message"]}>
                    {t("catalog.searchingForDiamonds")}
                  </p>
                )}
                {!isSearching && searchError && (
                  <p className={styles["error-message"]}>
                    {t("common.error")}: {searchError}
                  </p>
                )}
                {!isSearching && !currentProduct && (
                  <p className={styles["info-message"]}>
                    {t("catalog.noDiamondFound")}
                  </p>
                )}
                {!isSearching && currentProduct && (
                  <div className={styles["main-product-slider-container"]}>
                    <CatalogDiamondCard
                      product={currentProduct}
                      onViewMedia={handleViewMedia}
                      onFindPair={handleFindPerfectPair}
                      onAddToCart={handleAddToCart}
                      isProductInCart={isProductInCart(currentProduct._id)}
                      onGoToCart={handleGoToCart}
                      customTitle={
                        isPerfectMatch
                          ? t("catalog.perfectMatch")
                          : t("catalog.perfectAlternativeProduct")
                      }
                      showActionsBelowImage={true}
                      showSliderArrows={true}
                      onPreviousProduct={handlePreviousProduct}
                      onNextProduct={handleNextProduct}
                      canNavigatePrevious={allProducts.length > 1}
                      canNavigateNext={allProducts.length > 1}
                      isCompanyActive={isCompanyActive}
                      isAuthenticated={isAuthenticated}
                      isLgdealSupervisor={isLgdealSupervisor}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === "perfectPair" && showPerfectPairTab && (
              <div
                className={`${styles["search-result-area"]} ${styles["pair-search-area"]} ${foundPairProduct ? styles["has-results"] : ""}`}
              >
                {/* User-friendly hint about returning to original diamond */}
                <div
                  className={`${styles["pair-tab-hint"]} ${newTabCreated === "perfectPair" ? styles["new-tab-hint"] : ""}`}
                >
                  <i className="fas fa-info-circle"></i>
                  <div className={styles["hint-content"]}>
                    <strong>{t("catalog.newTabCreated")}</strong>
                    <span>{t("catalog.returnToOriginalHint")}</span>
                  </div>
                </div>

                {diamondForPairSearch && (
                  <h4 className={styles["pair-search-reference-title"]}>
                    {t("catalog.pairFor")}:{" "}
                    {`${diamondForPairSearch.shape || ""} ${diamondForPairSearch.carat || ""}ct ${diamondForPairSearch.color || ""} ${diamondForPairSearch.clarity || ""}${diamondForPairSearch.marketPrice != null ? ` ${formatCurrency(diamondForPairSearch.marketPrice)}` : diamondForPairSearch.price != null ? ` ${formatCurrency(diamondForPairSearch.price)}` : ""}`}
                  </h4>
                )}

                {isPairSearching && (
                  <p className={styles["loading-message"]}>
                    {t("catalog.searchingForPair")}
                  </p>
                )}
                {!isPairSearching && pairSearchError && (
                  <p className={styles["error-message"]}>
                    {t("common.error")}: {pairSearchError}
                  </p>
                )}
                {!isPairSearching &&
                  !pairSearchError &&
                  !foundPairProduct &&
                  diamondForPairSearch && (
                    <p className={styles["info-message"]}>
                      {t("catalog.noPairFound")}
                    </p>
                  )}

                {!isPairSearching && foundPairProduct && (
                  <div className={styles["main-product-slider-container"]}>
                    <CatalogDiamondCard
                      product={foundPairProduct}
                      onViewMedia={handleViewMedia}
                      onFindPair={handleFindPerfectPair}
                      onAddToCart={handleAddToCart}
                      isProductInCart={isProductInCart(foundPairProduct._id)}
                      onGoToCart={handleGoToCart}
                      customTitle={t("catalog.foundPerfectPair")}
                      showActionsBelowImage={true}
                      showSliderArrows={false}
                      isCompanyActive={isCompanyActive}
                      isAuthenticated={isAuthenticated}
                      isLgdealSupervisor={isLgdealSupervisor}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {(activeTab === "main" || activeTab === "advanced") && (
            <div className={styles["filter-actions"]}>
              <Button
                variant="secondary"
                onClick={handleResetFilters}
                disabled={isSearching}
              >
                {t("catalog.resetFilters")}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleFindPerfectDiamond()}
                loading={isSearching}
              >
                {t("catalog.findPerfectDiamond")}
              </Button>
            </div>
          )}
        </div>

        {showCartNotification && (
          <div className={styles["cart-notification"]}>
            {t("catalog.diamondAddedToCart")}
          </div>
        )}

        <Modal
          isOpen={notification.isOpen}
          onClose={() => setNotification({ ...notification, isOpen: false })}
          title={notification.title}
          footer={
            <Button
              onClick={() =>
                setNotification({ ...notification, isOpen: false })
              }
            >
              {t("common.close")}
            </Button>
          }
        >
          <p>{notification.message}</p>
        </Modal>
      </PageSection>
    </PageContainer>
  );
};

export default CatalogPage;
