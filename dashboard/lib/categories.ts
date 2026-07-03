export interface CategoryMeta {
  color: string;
  iconKey: IconKey;
  inflow?: boolean;
}

export type IconKey =
  | "food"
  | "cart"
  | "car"
  | "home"
  | "bolt"
  | "plane"
  | "film"
  | "heart"
  | "sparkles"
  | "wrench"
  | "bank"
  | "gift"
  | "scale"
  | "briefcase"
  | "arrowDown"
  | "arrowUp"
  | "tag";

const CATEGORY_META: Record<string, CategoryMeta> = {
  FOOD_AND_DRINK: { color: "#C15B3D", iconKey: "food" },
  GENERAL_MERCHANDISE: { color: "#7E5C7A", iconKey: "cart" },
  TRANSPORTATION: { color: "#3F7E77", iconKey: "car" },
  RENT_AND_UTILITIES: { color: "#2C5C3F", iconKey: "home" },
  HOME_IMPROVEMENT: { color: "#7C8A3F", iconKey: "wrench" },
  TRAVEL: { color: "#5E7E9E", iconKey: "plane" },
  ENTERTAINMENT: { color: "#A76B84", iconKey: "film" },
  MEDICAL: { color: "#A6473B", iconKey: "heart" },
  PERSONAL_CARE: { color: "#B07C8B", iconKey: "sparkles" },
  GENERAL_SERVICES: { color: "#5B6B8A", iconKey: "briefcase" },
  GOVERNMENT_AND_NON_PROFIT: { color: "#5F6B72", iconKey: "scale" },
  LOAN_PAYMENTS: { color: "#C08A3E", iconKey: "bank" },
  BANK_FEES: { color: "#A9744F", iconKey: "bank" },
  TRANSFER_OUT: { color: "#8C857A", iconKey: "arrowUp" },
  INCOME: { color: "#4C8A63", iconKey: "arrowDown", inflow: true },
  TRANSFER_IN: { color: "#6E9E77", iconKey: "arrowDown", inflow: true },
};

const FALLBACK: CategoryMeta = { color: "#8A7B63", iconKey: "tag" };

export function categoryMeta(raw: string | null): CategoryMeta {
  if (!raw) return FALLBACK;
  return CATEGORY_META[raw] ?? FALLBACK;
}

export function isSpendingCategory(raw: string | null): boolean {
  return !categoryMeta(raw).inflow;
}
