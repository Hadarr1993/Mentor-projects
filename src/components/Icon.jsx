import {
  Sunrise, CalendarDays, BookOpen, ShoppingCart, Snowflake, FileDown, Settings2,
  Sun, Moon, Plus, Minus, X, Check, Trash2, Pencil, Copy, Download, Upload,
  Printer, RefreshCw, Loader2, Lock, Users, Wand2, Image as ImageIcon, Type,
  CircleAlert, TriangleAlert, CloudOff, Cloud, CloudUpload, Save, Search,
  Wheat, Refrigerator, Carrot, Croissant, SprayCan, Package, Milk, Soup,
  CookingPot, Beef, Sandwich, EggFried, Salad, Wheat as Noodle, UtensilsCrossed,
  ChefHat, Flame, Droplets, ChevronLeft, ChevronRight, ChevronDown, Shuffle,
  ListChecks, FileText, Scissors, RotateCcw, CircleCheck, Info, GripVertical,
} from 'lucide-react';

/**
 * The only place in the app that imports from lucide-react.
 *
 * Everything else asks for a semantic name, so swapping icon sets later is
 * a change to this map alone. Size and colour inherit from the surrounding
 * text (1em, currentColor) so an icon stays optically matched to the word
 * beside it and scales with the user's text-size setting.
 */
const REGISTRY = {
  // Tabs
  today: Sunrise,
  week: CalendarDays,
  recipes: BookOpen,
  shopping: ShoppingCart,
  ice: Snowflake,
  export: FileDown,
  settings: Settings2,

  // Meals
  lunch: Sun,
  dinner: Moon,

  // Recipe marks
  pasta: Noodle,
  rice: CookingPot,
  soup: Soup,
  grill: Beef,
  bread: Croissant,
  egg: EggFried,
  wrap: Sandwich,
  noodles: UtensilsCrossed,
  salad: Salad,
  stew: CookingPot,
  other: ChefHat,

  // Shopping categories
  'cat-יבשים': Wheat,
  'cat-שימורים': Package,
  'cat-ירקות ופירות': Carrot,
  'cat-קירור': Refrigerator,
  'cat-לחם ומאפים': Croissant,
  'cat-תבלינים ורטבים': SprayCan,
  'cat-אחר': Package,

  // Actions
  add: Plus,
  remove: Minus,
  close: X,
  check: Check,
  done: CircleCheck,
  trash: Trash2,
  edit: Pencil,
  copy: Copy,
  download: Download,
  upload: Upload,
  print: Printer,
  refresh: RefreshCw,
  spinner: Loader2,
  save: Save,
  search: Search,
  shuffle: Shuffle,
  reset: RotateCcw,
  cut: Scissors,
  checklist: ListChecks,
  document: FileText,
  grip: GripVertical,

  // AI & media
  magic: Wand2,
  image: ImageIcon,
  text: Type,

  // Status
  lock: Lock,
  users: Users,
  offline: CloudOff,
  cloud: Cloud,
  cloudUp: CloudUpload,
  error: CircleAlert,
  warn: TriangleAlert,
  info: Info,
  flame: Flame,
  water: Droplets,
  milk: Milk,

  // Navigation
  prev: ChevronRight, // RTL: "previous" points right
  next: ChevronLeft,
  expand: ChevronDown,
};

export function Icon({ name, size = '1.15em', strokeWidth = 2, className = '', ...rest }) {
  const Cmp = REGISTRY[name] || REGISTRY.other;
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}

export const hasIcon = (name) => Object.hasOwn(REGISTRY, name);
export const categoryIcon = (category) => `cat-${category}`;
export default Icon;
