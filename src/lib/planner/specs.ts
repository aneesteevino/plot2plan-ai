import type { RoomKind } from "../schema";

/**
 * Planning heuristics (feet / square feet). These are typical preliminary-planning
 * dimensions used to size spaces — NOT building regulations or minimum legal sizes.
 */
export interface RoomSpec {
  label: string;
  target: number;
  minArea: number;
  minSide: number;
  /** Rooms are not enlarged beyond target × maxFactor unless nothing else can absorb space. */
  maxFactor: number;
  habitable: boolean;
  wet?: boolean;
}

export const SPECS: Record<RoomKind, RoomSpec> = {
  porch: { label: "Car Porch", target: 190, minArea: 170, minSide: 10, maxFactor: 1.2, habitable: false },
  foyer: { label: "Entrance Foyer", target: 45, minArea: 30, minSide: 5, maxFactor: 1.6, habitable: false },
  drawing: { label: "Drawing Room", target: 180, minArea: 120, minSide: 10, maxFactor: 1.5, habitable: true },
  living: { label: "Living / TV Lounge", target: 240, minArea: 150, minSide: 11, maxFactor: 99, habitable: true },
  lounge: { label: "Family Lounge", target: 180, minArea: 110, minSide: 10, maxFactor: 99, habitable: true },
  dining: { label: "Dining", target: 120, minArea: 80, minSide: 8, maxFactor: 1.5, habitable: true },
  kitchen: { label: "Kitchen", target: 110, minArea: 70, minSide: 7, maxFactor: 1.5, habitable: true, wet: true },
  master: { label: "Master Bedroom", target: 190, minArea: 150, minSide: 11, maxFactor: 1.5, habitable: true },
  bedroom: { label: "Bedroom", target: 150, minArea: 100, minSide: 9.5, maxFactor: 1.5, habitable: true },
  guest: { label: "Guest Room", target: 140, minArea: 100, minSide: 9.5, maxFactor: 1.5, habitable: true },
  bath: { label: "Bathroom", target: 45, minArea: 32, minSide: 5, maxFactor: 1.8, habitable: false, wet: true },
  dress: { label: "Dress / Wardrobe", target: 25, minArea: 12, minSide: 3, maxFactor: 3, habitable: false },
  study: { label: "Study", target: 100, minArea: 70, minSide: 8, maxFactor: 1.5, habitable: true },
  office: { label: "Home Office", target: 110, minArea: 70, minSide: 8, maxFactor: 1.5, habitable: true },
  prayer: { label: "Prayer Room", target: 60, minArea: 40, minSide: 6, maxFactor: 1.6, habitable: true },
  laundry: { label: "Laundry", target: 40, minArea: 24, minSide: 5, maxFactor: 2, habitable: false, wet: true },
  store: { label: "Store", target: 35, minArea: 16, minSide: 4, maxFactor: 2, habitable: false },
  stair: { label: "Staircase", target: 96, minArea: 96, minSide: 8, maxFactor: 1.3, habitable: false },
  lift: { label: "Lift & Lobby", target: 36, minArea: 30, minSide: 5.5, maxFactor: 1.4, habitable: false },
  corridor: { label: "Corridor", target: 0, minArea: 0, minSide: 4, maxFactor: 99, habitable: false },
  lawn: { label: "Lawn / Open Space", target: 0, minArea: 0, minSide: 5, maxFactor: 99, habitable: false },
  courtyard: { label: "Courtyard (open to sky)", target: 80, minArea: 50, minSide: 7, maxFactor: 99, habitable: false },
  shaft: { label: "Duct / Light Shaft", target: 0, minArea: 0, minSide: 3, maxFactor: 99, habitable: false },
  balcony: { label: "Balcony", target: 0, minArea: 0, minSide: 4, maxFactor: 99, habitable: false },
  terrace: { label: "Terrace", target: 0, minArea: 0, minSide: 4, maxFactor: 99, habitable: false },
  open: { label: "Open to Sky", target: 0, minArea: 0, minSide: 0, maxFactor: 99, habitable: false },
};

/** Fixed planning dimensions. */
export const DIM = {
  stairW: 8, // dog-leg stair, along the band width
  stairD: 12, // dog-leg stair run, along the band depth
  liftW: 6,
  corridor: 4,
  corridorAccessible: 5,
  porchDepth: 18,
  porchWidthFor: (cars: number) => (cars <= 1 ? 10.5 : cars * 9.5 + 1),
  balconyDepth: 4.5,
  bathDepth: { min: 7, max: 9 },
  mainDoor: 4,
  door: 3,
  doorAccessible: 3.25,
  bathDoor: 2.5,
  minWindowSetback: 3,
} as const;

export const OPEN_KINDS: RoomKind[] = ["lawn", "courtyard", "shaft", "balcony", "terrace", "open"];
export const CIRCULATION: RoomKind[] = ["foyer", "corridor", "living", "lounge", "dining", "stair"];
