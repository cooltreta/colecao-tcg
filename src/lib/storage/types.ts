export type TcgSlug = "onepiece";

export type CardVariant = "normal" | "alt" | "parallel";
export type CardCondition = "NM" | "LP" | "MP" | "HP";
export type CardLanguage = "EN" | "JP" | "PT" | "ES" | "FR" | "DE" | "IT" | "OTHER";

export type Collection = {
  id: string;
  name: string;
  tcg: TcgSlug;
  createdAt: string;
  updatedAt: string;
};

export type CollectionItem = {
  id: string;
  collectionId: string;
  cardCode: string; // OP05-119
  qty: number;
  variant: CardVariant;
  condition: CardCondition;
  language: CardLanguage;
  note?: string;
  createdAt: string;
  updatedAt: string;
  traits?: string[];
};

export type AppState = {
  version: 1;
  activeCollectionId?: string;
};

export type PriceEntry = {
  cardCode: string;      // "OP01-001"
  trendEur: number | null;
  avg30Eur: number | null;
  updatedAt: string;     // ISO
  url?: string | null;
};
