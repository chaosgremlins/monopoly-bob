// ── Space Types ──

export type SpaceType =
  | 'property'
  | 'railroad'
  | 'utility'
  | 'chance'
  | 'community_chest'
  | 'tax'
  | 'go'
  | 'jail'
  | 'free_parking'
  | 'go_to_jail';

export type ColorGroup =
  | 'brown'
  | 'light_blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark_blue';

export interface PropertySpace {
  position: number;
  name: string;
  type: 'property';
  colorGroup: ColorGroup;
  price: number;
  mortgageValue: number;
  houseCost: number;
  rent: [number, number, number, number, number, number]; // [base, 1h, 2h, 3h, 4h, hotel]
}

export interface RailroadSpace {
  position: number;
  name: string;
  type: 'railroad';
  price: number;
  mortgageValue: number;
}

export interface UtilitySpace {
  position: number;
  name: string;
  type: 'utility';
  price: number;
  mortgageValue: number;
}

export interface TaxSpace {
  position: number;
  name: string;
  type: 'tax';
  amount: number;
}

export interface SimpleSpace {
  position: number;
  name: string;
  type: 'chance' | 'community_chest' | 'go' | 'jail' | 'free_parking' | 'go_to_jail';
}

export type Space = PropertySpace | RailroadSpace | UtilitySpace | TaxSpace | SimpleSpace;

export type OwnableSpace = PropertySpace | RailroadSpace | UtilitySpace;

// ── Scenario Seeding ──

export interface ScenarioPlayerConfig {
  name?: string;
  balance?: number;
  position?: number;
  properties?: {
    position: number;
    houses?: number;
    mortgaged?: boolean;
  }[];
  getOutOfJailCards?: number;
  inJail?: boolean;
}

export interface ScenarioConfig {
  players: ScenarioPlayerConfig[];
}

// ── Card Effects ──

export type CardEffect =
  | { type: 'move_to'; position: number; collectGo: boolean }
  | { type: 'move_back'; spaces: number }
  | { type: 'move_to_nearest'; spaceType: 'railroad' | 'utility'; payMultiplier?: number }
  | { type: 'collect'; amount: number }
  | { type: 'pay'; amount: number }
  | { type: 'pay_per_house'; houseAmount: number; hotelAmount: number }
  | { type: 'collect_from_each_player'; amount: number }
  | { type: 'pay_each_player'; amount: number }
  | { type: 'get_out_of_jail_free' }
  | { type: 'go_to_jail' };

export interface Card {
  id: number;
  deck: 'chance' | 'community_chest';
  text: string;
  effect: CardEffect;
}

// ── Player State ──

export interface PropertyState {
  houses: number; // 0-4 = houses, 5 = hotel
  mortgaged: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  position: number;
  balance: number;
  properties: Map<number, PropertyState>; // position → state
  inJail: boolean;
  jailTurns: number;
  getOutOfJailCards: number;
  isBankrupt: boolean;
  doublesCount: number;
}

// ── Turn Phases ──

export type TurnPhase =
  | 'pre_roll'
  | 'awaiting_roll'
  | 'post_roll_land'
  | 'purchase_decision'
  | 'auction'
  | 'paying_debt'
  | 'trading'
  | 'post_action'
  | 'turn_complete';

// ── Trade ──

export interface TradeOffer {
  fromPlayerId: string;
  toPlayerId: string;
  offeredProperties: number[];
  offeredMoney: number;
  requestedProperties: number[];
  requestedMoney: number;
}

// ── Debt ──

export interface PendingDebt {
  creditor: string | 'bank';
  amount: number;
  reason: string;
}

// ── Game State ──

export interface GameState {
  players: PlayerState[];
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  turnNumber: number;
  lastDiceRoll: [number, number] | null;
  chanceDeck: number[];
  communityChestDeck: number[];
  chanceDiscardPile: number[];
  communityChestDiscardPile: number[];
  bankHouses: number;
  bankHotels: number;
  activeTrade: TradeOffer | null;
  pendingDebt: PendingDebt | null;
  gameLog: GameEvent[];
  winner: string | null;
}

// ── Game Actions ──

export type GameAction =
  | { action: 'roll_dice' }
  | { action: 'buy_property' }
  | { action: 'auction_property' }
  | { action: 'build_house'; propertyPosition: number }
  | { action: 'build_hotel'; propertyPosition: number }
  | { action: 'sell_house'; propertyPosition: number }
  | { action: 'mortgage_property'; propertyPosition: number }
  | { action: 'unmortgage_property'; propertyPosition: number }
  | { action: 'trade_offer'; offer: TradeOffer }
  | { action: 'accept_trade' }
  | { action: 'reject_trade' }
  | { action: 'end_turn' }
  | { action: 'declare_bankruptcy' }
  | { action: 'use_get_out_of_jail_card' }
  | { action: 'pay_jail_fine' }
  | { action: 'submit_bid'; amount: number };

export interface ActionResult {
  success: boolean;
  newState: GameState;
  events: GameEvent[];
  error?: string;
}

export interface AvailableAction {
  action: string;
  description: string;
  parameters?: Record<string, ParameterSchema>;
  required?: string[];
}

export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: (string | number)[];
  properties?: Record<string, ParameterSchema>;
  items?: ParameterSchema;
  required?: string[];
}

// ── Game Events ──

export type GameEvent =
  | { type: 'roll_dice'; playerId: string; dice: [number, number]; doubles: boolean }
  | { type: 'move'; playerId: string; from: number; to: number; passedGo: boolean }
  | { type: 'land'; playerId: string; spaceName: string; position: number }
  | { type: 'pay_rent'; payerId: string; ownerId: string; amount: number; property: string }
  | { type: 'buy_property'; playerId: string; property: string; price: number; position: number }
  | { type: 'auction_start'; property: string; position: number }
  | { type: 'auction_bid'; playerId: string; amount: number }
  | { type: 'auction_won'; playerId: string; property: string; price: number }
  | { type: 'auction_no_bids'; property: string }
  | { type: 'build_house'; playerId: string; property: string; position: number; houses: number }
  | { type: 'build_hotel'; playerId: string; property: string; position: number }
  | { type: 'sell_house'; playerId: string; property: string; position: number; houses: number }
  | { type: 'draw_card'; playerId: string; deck: 'chance' | 'community_chest'; cardText: string }
  | { type: 'pay_tax'; playerId: string; amount: number; taxName: string }
  | { type: 'go_to_jail'; playerId: string; reason: string }
  | { type: 'get_out_of_jail'; playerId: string; method: string }
  | { type: 'mortgage'; playerId: string; property: string; position: number; received: number }
  | { type: 'unmortgage'; playerId: string; property: string; position: number; cost: number }
  | { type: 'trade_completed'; fromPlayer: string; toPlayer: string; description: string }
  | { type: 'trade_rejected'; fromPlayer: string; toPlayer: string }
  | { type: 'bankruptcy'; playerId: string; creditor: string | 'bank' }
  | { type: 'game_over'; winnerId: string; reason: string }
  | { type: 'pass_go'; playerId: string; collected: number }
  | { type: 'collect'; playerId: string; amount: number; reason: string }
  | { type: 'pay'; playerId: string; amount: number; reason: string }
  | { type: 'transfer'; fromPlayerId: string; toPlayerId: string; amount: number; reason: string };
