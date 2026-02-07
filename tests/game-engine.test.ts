import { describe, it, expect } from 'bun:test';
import { GameEngine } from '../src/engine/game-engine';
import { GameState, TurnPhase } from '../src/engine/types';
import { COLOR_GROUP_MEMBERS } from '../src/engine/board-data';
import { cloneState } from '../src/engine/bank';
import {
  createTestState, createTestEngine, testRng,
  giveProperty, setPosition, setBalance, putInJail,
  getPlayer, giveColorGroup,
} from './helpers';

// ── Helpers ──

function setPhase(state: GameState, phase: TurnPhase): void {
  state.turnPhase = phase;
}

// ── Tests ──

describe('GameEngine', () => {

  // ────────────────────────────
  //  ROLLING DICE
  // ────────────────────────────

  describe('roll_dice', () => {
    it('moves the player and transitions to post_roll_land', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPhase(state, 'pre_roll');

      const result = engine.applyAction(state, { action: 'roll_dice' });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.position).toBeGreaterThan(0);
      expect(result.newState.lastDiceRoll).not.toBeNull();

      const rollEvent = result.events.find(e => e.type === 'roll_dice');
      expect(rollEvent).toBeDefined();
    });

    it('sends player to jail after three consecutive doubles', () => {
      const engine = createTestEngine();
      const state = createTestState();
      const player = getPlayer(state, 'player_0');
      player.doublesCount = 2; // Already rolled 2 doubles

      // Force doubles by using a rigged RNG
      let callCount = 0;
      const riggedEngine = new GameEngine(() => {
        callCount++;
        // Both dice return same value (produces doubles)
        return 0.1; // floor(0.1 * 6) + 1 = 1 for both dice
      });

      setPhase(state, 'pre_roll');
      const result = riggedEngine.applyAction(state, { action: 'roll_dice' });
      expect(result.success).toBe(true);

      const updatedPlayer = getPlayer(result.newState, 'player_0');
      expect(updatedPlayer.inJail).toBe(true);
      expect(updatedPlayer.position).toBe(10);

      const jailEvent = result.events.find(e => e.type === 'go_to_jail');
      expect(jailEvent).toBeDefined();
    });

    it('in jail: rolling doubles gets you out', () => {
      // Rig dice for doubles
      const engine = new GameEngine(() => 0.1);
      const state = createTestState();
      putInJail(state, 'player_0');
      setPhase(state, 'awaiting_roll');

      const result = engine.applyAction(state, { action: 'roll_dice' });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.inJail).toBe(false);

      const escapeEvent = result.events.find(e => e.type === 'get_out_of_jail');
      expect(escapeEvent).toBeDefined();
    });

    it('in jail: failing to roll doubles increments jailTurns', () => {
      // Rig dice for non-doubles
      let call = 0;
      const engine = new GameEngine(() => {
        call++;
        return call % 2 === 1 ? 0.1 : 0.5; // die1=1, die2=3
      });
      const state = createTestState();
      putInJail(state, 'player_0', 0);
      setPhase(state, 'awaiting_roll');

      const result = engine.applyAction(state, { action: 'roll_dice' });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.inJail).toBe(true);
      expect(player.jailTurns).toBe(1);
    });

    it('in jail: forced out on 3rd failed attempt, pays $50', () => {
      let call = 0;
      const engine = new GameEngine(() => {
        call++;
        return call % 2 === 1 ? 0.1 : 0.5;
      });
      const state = createTestState();
      putInJail(state, 'player_0', 2); // 3rd attempt
      setPhase(state, 'awaiting_roll');

      const result = engine.applyAction(state, { action: 'roll_dice' });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.inJail).toBe(false);
      expect(player.balance).toBe(1450); // 1500 - 50
    });

    it('passing Go collects $200', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 35); // Near end of board
      setPhase(state, 'pre_roll');

      // Need to roll enough to pass Go
      // Using a rigged engine that rolls high
      const riggedEngine = new GameEngine(() => 0.9); // die = floor(0.9*6)+1 = 6
      const result = riggedEngine.applyAction(state, { action: 'roll_dice' });
      expect(result.success).toBe(true);

      // Rolled [6,6] = 12, from position 35, goes to (35+12)%40 = 7
      const player = getPlayer(result.newState, 'player_0');
      expect(player.position).toBe(7);
      expect(player.balance).toBe(1700); // 1500 + 200

      const goEvent = result.events.find(e => e.type === 'pass_go');
      expect(goEvent).toBeDefined();
    });
  });

  // ────────────────────────────
  //  BUYING PROPERTY
  // ────────────────────────────

  describe('buy_property', () => {
    it('deducts price and gives property to player', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 1); // Mediterranean: $60
      setPhase(state, 'purchase_decision');

      const result = engine.applyAction(state, { action: 'buy_property' });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.balance).toBe(1440); // 1500 - 60
      expect(player.properties.has(1)).toBe(true);
      expect(result.newState.turnPhase).toBe('post_action');
    });

    it('fails when insufficient funds', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 39); // Boardwalk: $400
      setBalance(state, 'player_0', 100);
      setPhase(state, 'purchase_decision');

      const result = engine.applyAction(state, { action: 'buy_property' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient');
    });

    it('fails when property already owned', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 1);
      giveProperty(state, 'player_1', 1);
      setPhase(state, 'purchase_decision');

      const result = engine.applyAction(state, { action: 'buy_property' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('already owned');
    });
  });

  // ────────────────────────────
  //  AUCTION
  // ────────────────────────────

  describe('auction', () => {
    it('auction_property transitions to auction phase', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 1);
      setPhase(state, 'purchase_decision');

      const result = engine.applyAction(state, { action: 'auction_property' });
      expect(result.success).toBe(true);
      expect(result.newState.turnPhase).toBe('auction');
    });

    it('resolveAuction gives property to highest bidder', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPhase(state, 'auction');

      const bids = new Map<string, number>();
      bids.set('player_0', 100);
      bids.set('player_1', 150);

      const result = engine.resolveAuction(state, bids, 1); // Mediterranean
      expect(result.success).toBe(true);

      const winner = getPlayer(result.newState, 'player_1');
      expect(winner.properties.has(1)).toBe(true);
      expect(winner.balance).toBe(1350); // 1500 - 150
    });

    it('resolveAuction with no bids leaves property unowned', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPhase(state, 'auction');

      const bids = new Map<string, number>();
      bids.set('player_0', 0);
      bids.set('player_1', 0);

      const result = engine.resolveAuction(state, bids, 1);
      expect(result.success).toBe(true);

      // No one owns it
      for (const p of result.newState.players) {
        expect(p.properties.has(1)).toBe(false);
      }

      const noBidsEvent = result.events.find(e => e.type === 'auction_no_bids');
      expect(noBidsEvent).toBeDefined();
    });
  });

  // ────────────────────────────
  //  BUILDING HOUSES
  // ────────────────────────────

  describe('build_house', () => {
    it('builds a house on a monopoly property', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown); // [1, 3]
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_house', propertyPosition: 1 });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.properties.get(1)!.houses).toBe(1);
      expect(player.balance).toBe(1450); // 1500 - 50 (brown house cost)
      expect(result.newState.bankHouses).toBe(31);
    });

    it('fails without owning full color group', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1); // only Mediterranean, not Baltic
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_house', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('color group');
    });

    it('enforces even building rule', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 1; // Med has 1
      // Baltic has 0 — must build there first
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_house', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('evenly');
    });

    it('fails when bank has no houses', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      state.bankHouses = 0;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_house', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No houses');
    });

    it('fails when property is mortgaged', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.mortgaged = true;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_house', propertyPosition: 1 });
      expect(result.success).toBe(false);
    });

    it('fails at 4 houses (must use build_hotel)', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 4;
      getPlayer(state, 'player_0').properties.get(3)!.houses = 4;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_house', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('4 houses');
    });
  });

  // ────────────────────────────
  //  BUILDING HOTELS
  // ────────────────────────────

  describe('build_hotel', () => {
    it('upgrades 4 houses to a hotel', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 4;
      getPlayer(state, 'player_0').properties.get(3)!.houses = 4;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_hotel', propertyPosition: 1 });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.properties.get(1)!.houses).toBe(5); // 5 = hotel
      expect(result.newState.bankHouses).toBe(36); // 32 + 4 returned
      expect(result.newState.bankHotels).toBe(11); // 12 - 1
    });

    it('fails without exactly 4 houses', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 3;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_hotel', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('4 houses');
    });

    it('fails when no hotels in bank', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 4;
      getPlayer(state, 'player_0').properties.get(3)!.houses = 4;
      state.bankHotels = 0;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'build_hotel', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No hotels');
    });
  });

  // ────────────────────────────
  //  SELLING HOUSES
  // ────────────────────────────

  describe('sell_house', () => {
    it('sells a house and refunds half the cost', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 1;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'sell_house', propertyPosition: 1 });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.properties.get(1)!.houses).toBe(0);
      expect(player.balance).toBe(1525); // 1500 + 25 (half of $50 house cost)
      expect(result.newState.bankHouses).toBe(33);
    });

    it('fails when no houses to sell', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'sell_house', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No houses');
    });
  });

  // ────────────────────────────
  //  MORTGAGE / UNMORTGAGE
  // ────────────────────────────

  describe('mortgage_property', () => {
    it('mortgages a property and receives mortgage value', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1); // Mediterranean: mortgage $30
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'mortgage_property', propertyPosition: 1 });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.properties.get(1)!.mortgaged).toBe(true);
      expect(player.balance).toBe(1530); // 1500 + 30
    });

    it('fails if already mortgaged', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1, 0, true);
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'mortgage_property', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('already mortgaged');
    });

    it('fails if color group has houses', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 1;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'mortgage_property', propertyPosition: 3 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('sell all houses');
    });
  });

  describe('unmortgage_property', () => {
    it('unmortgages with 10% interest', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1, 0, true); // mortgaged Mediterranean
      setPhase(state, 'post_action');

      // Unmortgage cost: $30 * 1.1 = $33
      const result = engine.applyAction(state, { action: 'unmortgage_property', propertyPosition: 1 });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.properties.get(1)!.mortgaged).toBe(false);
      expect(player.balance).toBe(1467); // 1500 - 33
    });

    it('fails if not mortgaged', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'unmortgage_property', propertyPosition: 1 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not mortgaged');
    });
  });

  // ────────────────────────────
  //  TRADING
  // ────────────────────────────

  describe('trading', () => {
    it('trade_offer creates an active trade', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      giveProperty(state, 'player_1', 3);
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, {
        action: 'trade_offer',
        offer: {
          fromPlayerId: 'player_0',
          toPlayerId: 'player_1',
          offeredProperties: [1],
          offeredMoney: 50,
          requestedProperties: [3],
          requestedMoney: 0,
        },
      });
      expect(result.success).toBe(true);
      expect(result.newState.activeTrade).not.toBeNull();
      expect(result.newState.turnPhase).toBe('trading');
    });

    it('accept_trade transfers properties and money', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      giveProperty(state, 'player_1', 3);
      state.activeTrade = {
        fromPlayerId: 'player_0',
        toPlayerId: 'player_1',
        offeredProperties: [1],
        offeredMoney: 50,
        requestedProperties: [3],
        requestedMoney: 0,
      };
      setPhase(state, 'trading');

      const result = engine.applyAction(state, { action: 'accept_trade' });
      expect(result.success).toBe(true);

      const p0 = getPlayer(result.newState, 'player_0');
      const p1 = getPlayer(result.newState, 'player_1');

      // player_0: gave prop 1 + $50, received prop 3
      expect(p0.properties.has(1)).toBe(false);
      expect(p0.properties.has(3)).toBe(true);
      expect(p0.balance).toBe(1450); // 1500 - 50

      // player_1: gave prop 3, received prop 1 + $50
      expect(p1.properties.has(3)).toBe(false);
      expect(p1.properties.has(1)).toBe(true);
      expect(p1.balance).toBe(1550); // 1500 + 50
    });

    it('reject_trade clears the trade', () => {
      const engine = createTestEngine();
      const state = createTestState();
      state.activeTrade = {
        fromPlayerId: 'player_0',
        toPlayerId: 'player_1',
        offeredProperties: [],
        offeredMoney: 100,
        requestedProperties: [],
        requestedMoney: 0,
      };
      setPhase(state, 'trading');

      const result = engine.applyAction(state, { action: 'reject_trade' });
      expect(result.success).toBe(true);
      expect(result.newState.activeTrade).toBeNull();
      expect(result.newState.turnPhase).toBe('post_action');
    });

    it('fails to trade property with houses', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 1;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, {
        action: 'trade_offer',
        offer: {
          fromPlayerId: 'player_0',
          toPlayerId: 'player_1',
          offeredProperties: [1],
          offeredMoney: 0,
          requestedProperties: [],
          requestedMoney: 100,
        },
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('houses');
    });
  });

  // ────────────────────────────
  //  END TURN
  // ────────────────────────────

  describe('end_turn', () => {
    it('sets phase to turn_complete', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'end_turn' });
      expect(result.success).toBe(true);
      expect(result.newState.turnPhase).toBe('turn_complete');
    });

    it('with doubles, returns to pre_roll for another turn', () => {
      const engine = createTestEngine();
      const state = createTestState();
      state.lastDiceRoll = [3, 3];
      getPlayer(state, 'player_0').doublesCount = 1;
      setPhase(state, 'post_action');

      const result = engine.applyAction(state, { action: 'end_turn' });
      expect(result.success).toBe(true);
      expect(result.newState.turnPhase).toBe('pre_roll'); // Another turn!
    });
  });

  // ────────────────────────────
  //  JAIL ESCAPE
  // ────────────────────────────

  describe('jail escape', () => {
    it('use_get_out_of_jail_card works', () => {
      const engine = createTestEngine();
      const state = createTestState();
      putInJail(state, 'player_0');
      getPlayer(state, 'player_0').getOutOfJailCards = 1;
      setPhase(state, 'awaiting_roll');

      const result = engine.applyAction(state, { action: 'use_get_out_of_jail_card' });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.inJail).toBe(false);
      expect(player.getOutOfJailCards).toBe(0);
      expect(result.newState.turnPhase).toBe('awaiting_roll');
    });

    it('use_get_out_of_jail_card fails without card', () => {
      const engine = createTestEngine();
      const state = createTestState();
      putInJail(state, 'player_0');
      setPhase(state, 'awaiting_roll');

      const result = engine.applyAction(state, { action: 'use_get_out_of_jail_card' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('No Get Out of Jail');
    });

    it('pay_jail_fine costs $50', () => {
      const engine = createTestEngine();
      const state = createTestState();
      putInJail(state, 'player_0');
      setPhase(state, 'awaiting_roll');

      const result = engine.applyAction(state, { action: 'pay_jail_fine' });
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.inJail).toBe(false);
      expect(player.balance).toBe(1450);
      expect(result.newState.turnPhase).toBe('awaiting_roll');
    });

    it('pay_jail_fine fails with insufficient funds', () => {
      const engine = createTestEngine();
      const state = createTestState();
      putInJail(state, 'player_0');
      setBalance(state, 'player_0', 30);
      setPhase(state, 'awaiting_roll');

      const result = engine.applyAction(state, { action: 'pay_jail_fine' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient');
    });
  });

  // ────────────────────────────
  //  BANKRUPTCY
  // ────────────────────────────

  describe('bankruptcy', () => {
    it('transfers assets to creditor player', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      giveProperty(state, 'player_0', 5);
      setBalance(state, 'player_0', -100);
      state.pendingDebt = { creditor: 'player_1', amount: 100, reason: 'rent' };
      setPhase(state, 'paying_debt');

      const result = engine.applyAction(state, { action: 'declare_bankruptcy' });
      expect(result.success).toBe(true);

      const bankrupt = getPlayer(result.newState, 'player_0');
      expect(bankrupt.isBankrupt).toBe(true);
      expect(bankrupt.properties.size).toBe(0);

      const creditor = getPlayer(result.newState, 'player_1');
      expect(creditor.properties.has(1)).toBe(true);
      expect(creditor.properties.has(5)).toBe(true);
    });

    it('returns houses to bank when bankrupt to bank', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      getPlayer(state, 'player_0').properties.get(1)!.houses = 3;
      getPlayer(state, 'player_0').properties.get(3)!.houses = 2;
      setBalance(state, 'player_0', -100);
      state.pendingDebt = { creditor: 'bank', amount: 100, reason: 'tax' };
      setPhase(state, 'paying_debt');

      const result = engine.applyAction(state, { action: 'declare_bankruptcy' });
      expect(result.success).toBe(true);
      expect(result.newState.bankHouses).toBe(37); // 32 + 5 returned
    });

    it('triggers game over when only 1 player remains', () => {
      const engine = createTestEngine();
      const state = createTestState(); // 2 players
      setBalance(state, 'player_0', -100);
      state.pendingDebt = { creditor: 'bank', amount: 100, reason: 'tax' };
      setPhase(state, 'paying_debt');

      const result = engine.applyAction(state, { action: 'declare_bankruptcy' });
      expect(result.success).toBe(true);
      expect(result.newState.winner).toBe('player_1');

      const gameOverEvent = result.events.find(e => e.type === 'game_over');
      expect(gameOverEvent).toBeDefined();
    });
  });

  // ────────────────────────────
  //  AUTO-RESOLVE LANDING
  // ────────────────────────────

  describe('autoResolveLanding', () => {
    it('resolves Go To Jail', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 30); // Go To Jail
      setPhase(state, 'post_roll_land');

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.inJail).toBe(true);
      expect(player.position).toBe(10);
    });

    it('resolves tax payment', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 4); // Income Tax: $200
      setPhase(state, 'post_roll_land');

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.balance).toBe(1300); // 1500 - 200
    });

    it('resolves landing on unowned property → purchase_decision', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 1); // Mediterranean (unowned)
      setPhase(state, 'post_roll_land');
      state.lastDiceRoll = [3, 4];

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);
      expect(result.newState.turnPhase).toBe('purchase_decision');
    });

    it('resolves rent payment on owned property', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_1', 1); // player_1 owns Mediterranean
      setPosition(state, 'player_0', 1);
      setPhase(state, 'post_roll_land');
      state.lastDiceRoll = [3, 4];

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);

      const lander = getPlayer(result.newState, 'player_0');
      const owner = getPlayer(result.newState, 'player_1');
      expect(lander.balance).toBe(1498); // 1500 - 2 (base rent)
      expect(owner.balance).toBe(1502); // 1500 + 2
    });

    it('creates debt when rent exceeds balance', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveColorGroup(state, 'player_1', COLOR_GROUP_MEMBERS.dark_blue);
      getPlayer(state, 'player_1').properties.get(39)!.houses = 5; // Boardwalk hotel: $2000
      setPosition(state, 'player_0', 39);
      setPhase(state, 'post_roll_land');
      state.lastDiceRoll = [3, 4];

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);

      expect(result.newState.turnPhase).toBe('paying_debt');
      expect(result.newState.pendingDebt).not.toBeNull();
      expect(result.newState.pendingDebt!.creditor).toBe('player_1');
    });

    it('does nothing on Free Parking', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 20);
      setPhase(state, 'post_roll_land');

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.balance).toBe(1500);
      expect(result.newState.turnPhase).toBe('post_action');
    });

    it('does not charge rent on mortgaged property', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_1', 1, 0, true); // mortgaged
      setPosition(state, 'player_0', 1);
      setPhase(state, 'post_roll_land');
      state.lastDiceRoll = [3, 4];

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);

      const lander = getPlayer(result.newState, 'player_0');
      expect(lander.balance).toBe(1500); // No rent paid
    });

    it('does not charge rent on own property', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1);
      setPosition(state, 'player_0', 1);
      setPhase(state, 'post_roll_land');
      state.lastDiceRoll = [3, 4];

      const result = engine.autoResolveLanding(state);
      expect(result.success).toBe(true);

      const player = getPlayer(result.newState, 'player_0');
      expect(player.balance).toBe(1500);
    });
  });

  // ────────────────────────────
  //  AVAILABLE ACTIONS
  // ────────────────────────────

  describe('getAvailableActions', () => {
    it('pre_roll phase includes roll_dice', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPhase(state, 'pre_roll');

      const actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'roll_dice')).toBe(true);
    });

    it('purchase_decision includes buy_property and auction_property', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 1);
      setPhase(state, 'purchase_decision');

      const actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'buy_property')).toBe(true);
      expect(actions.some(a => a.action === 'auction_property')).toBe(true);
    });

    it('purchase_decision hides buy when cannot afford', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPosition(state, 'player_0', 39); // Boardwalk $400
      setBalance(state, 'player_0', 100);
      setPhase(state, 'purchase_decision');

      const actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'buy_property')).toBe(false);
      expect(actions.some(a => a.action === 'auction_property')).toBe(true);
    });

    it('post_action includes end_turn', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPhase(state, 'post_action');

      const actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'end_turn')).toBe(true);
    });

    it('jail phase includes jail-specific options', () => {
      const engine = createTestEngine();
      const state = createTestState();
      putInJail(state, 'player_0');
      getPlayer(state, 'player_0').getOutOfJailCards = 1;
      setPhase(state, 'awaiting_roll');

      const actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'roll_dice')).toBe(true);
      expect(actions.some(a => a.action === 'use_get_out_of_jail_card')).toBe(true);
      expect(actions.some(a => a.action === 'pay_jail_fine')).toBe(true);
    });

    it('paying_debt includes declare_bankruptcy', () => {
      const engine = createTestEngine();
      const state = createTestState();
      state.pendingDebt = { creditor: 'bank', amount: 100, reason: 'tax' };
      setPhase(state, 'paying_debt');

      const actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'declare_bankruptcy')).toBe(true);
    });

    it('trading phase includes accept_trade and reject_trade', () => {
      const engine = createTestEngine();
      const state = createTestState();
      setPhase(state, 'trading');

      const actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'accept_trade')).toBe(true);
      expect(actions.some(a => a.action === 'reject_trade')).toBe(true);
    });

    it('shows build_house only when monopoly is complete', () => {
      const engine = createTestEngine();
      const state = createTestState();
      giveProperty(state, 'player_0', 1); // only one of brown
      setPhase(state, 'post_action');

      let actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'build_house')).toBe(false);

      // Now give the full group
      giveColorGroup(state, 'player_0', COLOR_GROUP_MEMBERS.brown);
      actions = engine.getAvailableActions(state);
      expect(actions.some(a => a.action === 'build_house')).toBe(true);
    });

    it('returns empty for bankrupt player', () => {
      const engine = createTestEngine();
      const state = createTestState();
      getPlayer(state, 'player_0').isBankrupt = true;

      const actions = engine.getAvailableActions(state);
      expect(actions).toHaveLength(0);
    });
  });
});
