import {
  GameState, GameAction, ActionResult, GameEvent, AvailableAction,
  TurnPhase, PlayerState, PropertySpace, TradeOffer, PendingDebt,
  OwnableSpace, CardEffect,
} from './types';
import {
  BOARD_SPACES, COLOR_GROUP_MEMBERS, RAILROAD_POSITIONS, UTILITY_POSITIONS,
  getSpace, isOwnableSpace,
} from './board-data';
import {
  cloneState, getPlayerById, getPropertyOwner, isPropertyOwned,
  transferPropertyToPlayer, removePropertyFromPlayer, adjustBalance,
  transferMoney, countPlayerRailroads, countPlayerUtilities,
  playerOwnsColorGroup, countHousesAndHotels, getActivePlayers,
} from './bank';
import { calculateRent } from './rent-calculator';
import { rollDice, DiceRoll } from './dice';
import { CHANCE_CARDS, COMMUNITY_CHEST_CARDS, drawCard } from './cards';

export class GameEngine {
  private rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  getAvailableActions(state: GameState): AvailableAction[] {
    const player = state.players[state.currentPlayerIndex];
    if (player.isBankrupt) return [];

    switch (state.turnPhase) {
      case 'pre_roll':
        return this.getPreRollActions(state, player);
      case 'awaiting_roll':
        return this.getAwaitingRollActions(state, player);
      case 'purchase_decision':
        return this.getPurchaseDecisionActions(state, player);
      case 'auction':
        return this.getAuctionActions(state, player);
      case 'paying_debt':
        return this.getPayingDebtActions(state, player);
      case 'trading':
        return this.getTradingActions(state);
      case 'post_action':
        return this.getPostActionActions(state, player);
      default:
        return [];
    }
  }

  applyAction(state: GameState, action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    let newState = cloneState(state);

    try {
      switch (action.action) {
        case 'roll_dice':
          return this.handleRollDice(newState, events);
        case 'buy_property':
          return this.handleBuyProperty(newState, events);
        case 'auction_property':
          return this.handleAuctionProperty(newState, events);
        case 'build_house':
          return this.handleBuildHouse(newState, action.propertyPosition, events);
        case 'build_hotel':
          return this.handleBuildHotel(newState, action.propertyPosition, events);
        case 'sell_house':
          return this.handleSellHouse(newState, action.propertyPosition, events);
        case 'mortgage_property':
          return this.handleMortgage(newState, action.propertyPosition, events);
        case 'unmortgage_property':
          return this.handleUnmortgage(newState, action.propertyPosition, events);
        case 'trade_offer':
          return this.handleTradeOffer(newState, action.offer, events);
        case 'accept_trade':
          return this.handleAcceptTrade(newState, events);
        case 'reject_trade':
          return this.handleRejectTrade(newState, events);
        case 'end_turn':
          return this.handleEndTurn(newState, events);
        case 'declare_bankruptcy':
          return this.handleBankruptcy(newState, events);
        case 'use_get_out_of_jail_card':
          return this.handleUseJailCard(newState, events);
        case 'pay_jail_fine':
          return this.handlePayJailFine(newState, events);
        case 'submit_bid':
          return this.handleSubmitBid(newState, action.amount, events);
        default:
          return { success: false, newState: state, events: [], error: 'Unknown action' };
      }
    } catch (e) {
      return {
        success: false,
        newState: state,
        events: [],
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }

  // Automatically resolve landing effects (rent, tax, cards, go-to-jail)
  autoResolveLanding(state: GameState): ActionResult {
    let newState = cloneState(state);
    const events: GameEvent[] = [];
    const player = newState.players[newState.currentPlayerIndex];
    const space = getSpace(player.position);

    events.push({
      type: 'land',
      playerId: player.id,
      spaceName: space.name,
      position: player.position,
    });

    switch (space.type) {
      case 'go':
      case 'jail':
      case 'free_parking':
        // Nothing happens
        newState.turnPhase = 'post_action';
        break;

      case 'go_to_jail':
        this.sendToJail(newState, player, events, 'Landed on Go To Jail');
        newState.turnPhase = 'post_action';
        break;

      case 'tax':
        player.balance -= space.amount;
        events.push({ type: 'pay_tax', playerId: player.id, amount: space.amount, taxName: space.name });
        if (player.balance < 0) {
          newState.pendingDebt = { creditor: 'bank', amount: -player.balance, reason: space.name };
          newState.turnPhase = 'paying_debt';
        } else {
          newState.turnPhase = 'post_action';
        }
        break;

      case 'chance':
      case 'community_chest':
        return this.resolveCardDraw(newState, player, space.type, events);

      case 'property':
      case 'railroad':
      case 'utility':
        if (!isPropertyOwned(newState, player.position)) {
          newState.turnPhase = 'purchase_decision';
        } else {
          const owner = getPropertyOwner(newState, player.position)!;
          if (owner.id !== player.id && !owner.properties.get(player.position)!.mortgaged) {
            const rent = calculateRent(newState, player.position, newState.lastDiceRoll!);
            if (rent > 0) {
              player.balance -= rent;
              owner.balance += rent;
              events.push({
                type: 'pay_rent',
                payerId: player.id,
                ownerId: owner.id,
                amount: rent,
                property: space.name,
              });
              if (player.balance < 0) {
                newState.pendingDebt = {
                  creditor: owner.id,
                  amount: -player.balance,
                  reason: `Rent on ${space.name}`,
                };
                newState.turnPhase = 'paying_debt';
              } else {
                newState.turnPhase = 'post_action';
              }
            } else {
              newState.turnPhase = 'post_action';
            }
          } else {
            newState.turnPhase = 'post_action';
          }
        }
        break;

      default:
        newState.turnPhase = 'post_action';
    }

    newState.gameLog.push(...events);
    return { success: true, newState, events };
  }

  // ── Action Handlers ──

  private handleRollDice(state: GameState, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];

    if (player.inJail) {
      // In jail: roll for doubles
      const roll = rollDice(this.rng);
      state.lastDiceRoll = roll.dice;
      events.push({
        type: 'roll_dice',
        playerId: player.id,
        dice: roll.dice,
        doubles: roll.isDoubles,
      });

      if (roll.isDoubles) {
        player.inJail = false;
        player.jailTurns = 0;
        events.push({ type: 'get_out_of_jail', playerId: player.id, method: 'rolled doubles' });
        this.movePlayer(state, player, roll.sum, events);
        state.turnPhase = 'post_roll_land';
      } else {
        player.jailTurns++;
        if (player.jailTurns >= 3) {
          // Must pay fine and move
          player.balance -= 50;
          player.inJail = false;
          player.jailTurns = 0;
          events.push({ type: 'get_out_of_jail', playerId: player.id, method: 'paid $50 (3rd turn)' });
          events.push({ type: 'pay', playerId: player.id, amount: 50, reason: 'Jail fine (3rd turn)' });
          this.movePlayer(state, player, roll.sum, events);
          state.turnPhase = 'post_roll_land';
          if (player.balance < 0) {
            state.pendingDebt = { creditor: 'bank', amount: -player.balance, reason: 'Jail fine' };
            state.turnPhase = 'paying_debt';
          }
        } else {
          state.turnPhase = 'post_action';
        }
      }
    } else {
      // Normal roll
      const roll = rollDice(this.rng);
      state.lastDiceRoll = roll.dice;
      events.push({
        type: 'roll_dice',
        playerId: player.id,
        dice: roll.dice,
        doubles: roll.isDoubles,
      });

      if (roll.isDoubles) {
        player.doublesCount++;
        if (player.doublesCount >= 3) {
          // Three doubles = go to jail
          this.sendToJail(state, player, events, 'Rolled three consecutive doubles');
          state.turnPhase = 'post_action';
          state.gameLog.push(...events);
          return { success: true, newState: state, events };
        }
      }

      this.movePlayer(state, player, roll.sum, events);
      state.turnPhase = 'post_roll_land';
    }

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleBuyProperty(state: GameState, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const space = getSpace(player.position);

    if (!isOwnableSpace(space)) {
      return { success: false, newState: state, events: [], error: 'Not a purchasable space' };
    }
    if (isPropertyOwned(state, player.position)) {
      return { success: false, newState: state, events: [], error: 'Property already owned' };
    }
    if (player.balance < space.price) {
      return { success: false, newState: state, events: [], error: `Insufficient funds. Need $${space.price}, have $${player.balance}` };
    }

    player.balance -= space.price;
    player.properties.set(player.position, { houses: 0, mortgaged: false });
    events.push({
      type: 'buy_property',
      playerId: player.id,
      property: space.name,
      price: space.price,
      position: player.position,
    });

    state.turnPhase = 'post_action';
    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleAuctionProperty(state: GameState, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const space = getSpace(player.position);

    if (!isOwnableSpace(space)) {
      return { success: false, newState: state, events: [], error: 'Not a purchasable space' };
    }

    events.push({ type: 'auction_start', property: space.name, position: player.position });
    state.turnPhase = 'auction';
    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleSubmitBid(state: GameState, amount: number, events: GameEvent[]): ActionResult {
    // This is called during the auction phase.
    // The game loop handles collecting bids from all players.
    // For simplicity, the engine just records the bid.
    const player = state.players[state.currentPlayerIndex];

    if (amount < 0) {
      return { success: false, newState: state, events: [], error: 'Bid must be non-negative' };
    }
    if (amount > player.balance) {
      return { success: false, newState: state, events: [], error: 'Bid exceeds balance' };
    }

    events.push({ type: 'auction_bid', playerId: player.id, amount });
    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  // Called by game loop after all bids are collected
  resolveAuction(
    state: GameState,
    bids: Map<string, number>,
    position: number,
  ): ActionResult {
    const newState = cloneState(state);
    const events: GameEvent[] = [];
    const space = getSpace(position);

    let highestBid = 0;
    let winnerId: string | null = null;

    // Determine winner (highest bid; first bidder wins ties in turn order)
    for (const player of newState.players) {
      if (player.isBankrupt) continue;
      const bid = bids.get(player.id) ?? 0;
      if (bid > highestBid) {
        highestBid = bid;
        winnerId = player.id;
      }
    }

    if (winnerId && highestBid > 0) {
      const winner = getPlayerById(newState, winnerId);
      winner.balance -= highestBid;
      winner.properties.set(position, { houses: 0, mortgaged: false });
      events.push({
        type: 'auction_won',
        playerId: winnerId,
        property: space.name,
        price: highestBid,
      });
    } else {
      events.push({ type: 'auction_no_bids', property: space.name });
    }

    newState.turnPhase = 'post_action';
    newState.gameLog.push(...events);
    return { success: true, newState, events };
  }

  private handleBuildHouse(state: GameState, position: number, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const space = getSpace(position);

    if (space.type !== 'property') {
      return { success: false, newState: state, events: [], error: 'Not a property' };
    }

    const propState = player.properties.get(position);
    if (!propState) {
      return { success: false, newState: state, events: [], error: 'You do not own this property' };
    }
    if (propState.mortgaged) {
      return { success: false, newState: state, events: [], error: 'Property is mortgaged' };
    }

    const groupPositions = COLOR_GROUP_MEMBERS[space.colorGroup];
    if (!playerOwnsColorGroup(state, player.id, groupPositions)) {
      return { success: false, newState: state, events: [], error: 'You must own all properties in the color group' };
    }

    // Check any property in group is mortgaged
    for (const gp of groupPositions) {
      if (player.properties.get(gp)?.mortgaged) {
        return { success: false, newState: state, events: [], error: 'Cannot build while any property in the group is mortgaged' };
      }
    }

    if (propState.houses >= 4) {
      return { success: false, newState: state, events: [], error: 'Property already has 4 houses. Use build_hotel to upgrade.' };
    }

    // Even building rule
    const minHouses = Math.min(...groupPositions.map(p => player.properties.get(p)!.houses));
    if (propState.houses > minHouses) {
      return { success: false, newState: state, events: [], error: 'Must build evenly. Build on properties with fewer houses first.' };
    }

    if (state.bankHouses <= 0) {
      return { success: false, newState: state, events: [], error: 'No houses available in the bank' };
    }

    if (player.balance < space.houseCost) {
      return { success: false, newState: state, events: [], error: `Insufficient funds. Houses cost $${space.houseCost}` };
    }

    player.balance -= space.houseCost;
    propState.houses++;
    state.bankHouses--;

    events.push({
      type: 'build_house',
      playerId: player.id,
      property: space.name,
      position,
      houses: propState.houses,
    });

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleBuildHotel(state: GameState, position: number, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const space = getSpace(position);

    if (space.type !== 'property') {
      return { success: false, newState: state, events: [], error: 'Not a property' };
    }

    const propState = player.properties.get(position);
    if (!propState) {
      return { success: false, newState: state, events: [], error: 'You do not own this property' };
    }
    if (propState.houses !== 4) {
      return { success: false, newState: state, events: [], error: 'Must have exactly 4 houses to build a hotel' };
    }
    if (state.bankHotels <= 0) {
      return { success: false, newState: state, events: [], error: 'No hotels available in the bank' };
    }

    if (player.balance < (space as PropertySpace).houseCost) {
      return { success: false, newState: state, events: [], error: `Insufficient funds. Hotel costs $${(space as PropertySpace).houseCost}` };
    }

    player.balance -= (space as PropertySpace).houseCost;
    propState.houses = 5; // 5 = hotel
    state.bankHotels--;
    state.bankHouses += 4; // Return houses to bank

    events.push({
      type: 'build_hotel',
      playerId: player.id,
      property: space.name,
      position,
    });

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleSellHouse(state: GameState, position: number, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const space = getSpace(position);

    if (space.type !== 'property') {
      return { success: false, newState: state, events: [], error: 'Not a property' };
    }

    const propState = player.properties.get(position);
    if (!propState) {
      return { success: false, newState: state, events: [], error: 'You do not own this property' };
    }

    if (propState.houses === 0) {
      return { success: false, newState: state, events: [], error: 'No houses to sell' };
    }

    const groupPositions = COLOR_GROUP_MEMBERS[space.colorGroup];

    if (propState.houses === 5) {
      // Selling hotel: need 4 houses available or must sell all
      if (state.bankHouses >= 4) {
        propState.houses = 4;
        state.bankHotels++;
        state.bankHouses -= 4;
      } else {
        // Not enough houses to downgrade — sell entire hotel
        propState.houses = 0;
        state.bankHotels++;
      }
    } else {
      // Even selling rule
      const maxHouses = Math.max(...groupPositions.map(p => player.properties.get(p)!.houses));
      if (propState.houses < maxHouses) {
        return { success: false, newState: state, events: [], error: 'Must sell evenly. Sell from properties with more houses first.' };
      }
      propState.houses--;
      state.bankHouses++;
    }

    const refund = Math.floor((space as PropertySpace).houseCost / 2);
    player.balance += refund;

    events.push({
      type: 'sell_house',
      playerId: player.id,
      property: space.name,
      position,
      houses: propState.houses,
    });

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleMortgage(state: GameState, position: number, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const space = getSpace(position);

    if (!isOwnableSpace(space)) {
      return { success: false, newState: state, events: [], error: 'Not a mortgageable space' };
    }

    const propState = player.properties.get(position);
    if (!propState) {
      return { success: false, newState: state, events: [], error: 'You do not own this property' };
    }
    if (propState.mortgaged) {
      return { success: false, newState: state, events: [], error: 'Property is already mortgaged' };
    }

    // Must sell all houses in color group first
    if (space.type === 'property') {
      const groupPositions = COLOR_GROUP_MEMBERS[space.colorGroup];
      for (const gp of groupPositions) {
        const gs = player.properties.get(gp);
        if (gs && gs.houses > 0) {
          return { success: false, newState: state, events: [], error: 'Must sell all houses in the color group before mortgaging' };
        }
      }
    }

    propState.mortgaged = true;
    player.balance += space.mortgageValue;

    events.push({
      type: 'mortgage',
      playerId: player.id,
      property: space.name,
      position,
      received: space.mortgageValue,
    });

    // Check if pending debt can now be resolved
    if (state.pendingDebt && player.balance >= 0) {
      state.pendingDebt = null;
      state.turnPhase = 'post_action';
    }

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleUnmortgage(state: GameState, position: number, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const space = getSpace(position);

    if (!isOwnableSpace(space)) {
      return { success: false, newState: state, events: [], error: 'Not a property' };
    }

    const propState = player.properties.get(position);
    if (!propState) {
      return { success: false, newState: state, events: [], error: 'You do not own this property' };
    }
    if (!propState.mortgaged) {
      return { success: false, newState: state, events: [], error: 'Property is not mortgaged' };
    }

    const cost = Math.floor(space.mortgageValue * 1.1); // 10% interest
    if (player.balance < cost) {
      return { success: false, newState: state, events: [], error: `Insufficient funds. Unmortgage costs $${cost}` };
    }

    propState.mortgaged = false;
    player.balance -= cost;

    events.push({
      type: 'unmortgage',
      playerId: player.id,
      property: space.name,
      position,
      cost,
    });

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleTradeOffer(state: GameState, offer: TradeOffer, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];

    if (offer.fromPlayerId !== player.id) {
      return { success: false, newState: state, events: [], error: 'Trade must be from the current player' };
    }

    const target = state.players.find(p => p.id === offer.toPlayerId);
    if (!target || target.isBankrupt) {
      return { success: false, newState: state, events: [], error: 'Invalid trade target' };
    }

    // Validate offered properties
    for (const pos of offer.offeredProperties) {
      if (!player.properties.has(pos)) {
        return { success: false, newState: state, events: [], error: `You don't own property at position ${pos}` };
      }
      const ps = player.properties.get(pos)!;
      if (ps.houses > 0) {
        return { success: false, newState: state, events: [], error: 'Must sell houses before trading a property' };
      }
    }

    // Validate requested properties
    for (const pos of offer.requestedProperties) {
      if (!target.properties.has(pos)) {
        return { success: false, newState: state, events: [], error: `${target.name} doesn't own property at position ${pos}` };
      }
      const ps = target.properties.get(pos)!;
      if (ps.houses > 0) {
        return { success: false, newState: state, events: [], error: `${target.name} must sell houses before trading that property` };
      }
    }

    if (offer.offeredMoney > player.balance) {
      return { success: false, newState: state, events: [], error: 'Insufficient funds for offered money' };
    }
    if (offer.requestedMoney > target.balance) {
      return { success: false, newState: state, events: [], error: `${target.name} has insufficient funds` };
    }

    state.activeTrade = offer;
    state.turnPhase = 'trading';

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleAcceptTrade(state: GameState, events: GameEvent[]): ActionResult {
    if (!state.activeTrade) {
      return { success: false, newState: state, events: [], error: 'No active trade' };
    }

    const trade = state.activeTrade;
    const from = getPlayerById(state, trade.fromPlayerId);
    const to = getPlayerById(state, trade.toPlayerId);

    // Transfer properties
    for (const pos of trade.offeredProperties) {
      const propState = from.properties.get(pos)!;
      from.properties.delete(pos);
      to.properties.set(pos, { ...propState });
    }
    for (const pos of trade.requestedProperties) {
      const propState = to.properties.get(pos)!;
      to.properties.delete(pos);
      from.properties.set(pos, { ...propState });
    }

    // Transfer money
    if (trade.offeredMoney > 0) {
      from.balance -= trade.offeredMoney;
      to.balance += trade.offeredMoney;
    }
    if (trade.requestedMoney > 0) {
      to.balance -= trade.requestedMoney;
      from.balance += trade.requestedMoney;
    }

    const desc = this.describeTradeOffer(trade);
    events.push({ type: 'trade_completed', fromPlayer: from.name, toPlayer: to.name, description: desc });

    state.activeTrade = null;
    // Return to the phase we were in before trading
    if (state.pendingDebt) {
      state.turnPhase = 'paying_debt';
    } else {
      state.turnPhase = 'post_action';
    }

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleRejectTrade(state: GameState, events: GameEvent[]): ActionResult {
    if (!state.activeTrade) {
      return { success: false, newState: state, events: [], error: 'No active trade' };
    }

    const trade = state.activeTrade;
    events.push({
      type: 'trade_rejected',
      fromPlayer: getPlayerById(state, trade.fromPlayerId).name,
      toPlayer: getPlayerById(state, trade.toPlayerId).name,
    });

    state.activeTrade = null;
    if (state.pendingDebt) {
      state.turnPhase = 'paying_debt';
    } else {
      state.turnPhase = 'post_action';
    }

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleEndTurn(state: GameState, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];

    // If player rolled doubles (and isn't in jail), they get another turn
    if (player.doublesCount > 0 && !player.inJail && state.lastDiceRoll) {
      const [d1, d2] = state.lastDiceRoll;
      if (d1 === d2) {
        state.turnPhase = 'pre_roll';
        state.gameLog.push(...events);
        return { success: true, newState: state, events };
      }
    }

    // Signal turn is over — game loop handles advancing to next player
    player.doublesCount = 0;
    state.lastDiceRoll = null;
    state.turnPhase = 'turn_complete';

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleBankruptcy(state: GameState, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];
    const creditor = state.pendingDebt?.creditor ?? 'bank';

    player.isBankrupt = true;
    events.push({ type: 'bankruptcy', playerId: player.id, creditor });

    if (creditor !== 'bank') {
      // Transfer all assets to creditor
      const creditorPlayer = getPlayerById(state, creditor);
      for (const [pos, propState] of player.properties) {
        creditorPlayer.properties.set(pos, { ...propState });
      }
      // Transfer remaining positive balance (if any)
      if (player.balance > 0) {
        creditorPlayer.balance += player.balance;
      }
      creditorPlayer.getOutOfJailCards += player.getOutOfJailCards;
    } else {
      // Return all houses/hotels to bank
      for (const [pos, propState] of player.properties) {
        if (propState.houses === 5) {
          state.bankHotels++;
        } else {
          state.bankHouses += propState.houses;
        }
      }
      // Properties return to unowned (just clear from player)
    }

    player.properties.clear();
    player.balance = 0;
    player.getOutOfJailCards = 0;
    state.pendingDebt = null;

    // Check for winner
    const activePlayers = getActivePlayers(state);
    if (activePlayers.length === 1) {
      state.winner = activePlayers[0].id;
      events.push({
        type: 'game_over',
        winnerId: activePlayers[0].id,
        reason: 'All other players bankrupt',
      });
    }

    state.turnPhase = 'turn_complete';
    this.advanceToNextPlayer(state);

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handleUseJailCard(state: GameState, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];

    if (!player.inJail) {
      return { success: false, newState: state, events: [], error: 'Not in jail' };
    }
    if (player.getOutOfJailCards <= 0) {
      return { success: false, newState: state, events: [], error: 'No Get Out of Jail Free cards' };
    }

    player.getOutOfJailCards--;
    player.inJail = false;
    player.jailTurns = 0;
    events.push({ type: 'get_out_of_jail', playerId: player.id, method: 'Get Out of Jail Free card' });

    state.turnPhase = 'awaiting_roll';
    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private handlePayJailFine(state: GameState, events: GameEvent[]): ActionResult {
    const player = state.players[state.currentPlayerIndex];

    if (!player.inJail) {
      return { success: false, newState: state, events: [], error: 'Not in jail' };
    }
    if (player.balance < 50) {
      return { success: false, newState: state, events: [], error: 'Insufficient funds to pay $50 fine' };
    }

    player.balance -= 50;
    player.inJail = false;
    player.jailTurns = 0;
    events.push({ type: 'get_out_of_jail', playerId: player.id, method: 'paid $50 fine' });
    events.push({ type: 'pay', playerId: player.id, amount: 50, reason: 'Jail fine' });

    state.turnPhase = 'awaiting_roll';
    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  // ── Helper Methods ──

  private movePlayer(state: GameState, player: PlayerState, spaces: number, events: GameEvent[]): void {
    const from = player.position;
    player.position = (player.position + spaces) % 40;
    const passedGo = player.position < from && spaces > 0;

    if (passedGo) {
      player.balance += 200;
      events.push({ type: 'pass_go', playerId: player.id, collected: 200 });
    }

    events.push({
      type: 'move',
      playerId: player.id,
      from,
      to: player.position,
      passedGo,
    });
  }

  private movePlayerToPosition(
    state: GameState,
    player: PlayerState,
    position: number,
    collectGo: boolean,
    events: GameEvent[],
  ): void {
    const from = player.position;
    const passedGo = collectGo && position < from && position !== from;

    if (passedGo) {
      player.balance += 200;
      events.push({ type: 'pass_go', playerId: player.id, collected: 200 });
    }

    player.position = position;
    events.push({
      type: 'move',
      playerId: player.id,
      from,
      to: position,
      passedGo,
    });
  }

  private sendToJail(state: GameState, player: PlayerState, events: GameEvent[], reason: string): void {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.doublesCount = 0;
    events.push({ type: 'go_to_jail', playerId: player.id, reason });
  }

  private resolveCardDraw(
    state: GameState,
    player: PlayerState,
    deckType: 'chance' | 'community_chest',
    events: GameEvent[],
  ): ActionResult {
    const isChance = deckType === 'chance';
    const cards = isChance ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;
    const deck = isChance ? state.chanceDeck : state.communityChestDeck;
    const discard = isChance ? state.chanceDiscardPile : state.communityChestDiscardPile;

    const result = drawCard(deck, discard, cards, this.rng);

    if (isChance) {
      state.chanceDeck = result.newDeck;
      state.chanceDiscardPile = result.newDiscardPile;
    } else {
      state.communityChestDeck = result.newDeck;
      state.communityChestDiscardPile = result.newDiscardPile;
    }

    const card = result.card;
    events.push({ type: 'draw_card', playerId: player.id, deck: deckType, cardText: card.text });

    this.applyCardEffect(state, player, card.effect, events);

    state.gameLog.push(...events);
    return { success: true, newState: state, events };
  }

  private applyCardEffect(
    state: GameState,
    player: PlayerState,
    effect: CardEffect,
    events: GameEvent[],
  ): void {
    switch (effect.type) {
      case 'move_to':
        this.movePlayerToPosition(state, player, effect.position, effect.collectGo, events);
        // Re-resolve landing
        state.turnPhase = 'post_roll_land';
        break;

      case 'move_back': {
        const newPos = (player.position - effect.spaces + 40) % 40;
        player.position = newPos;
        events.push({ type: 'move', playerId: player.id, from: player.position + effect.spaces, to: newPos, passedGo: false });
        state.turnPhase = 'post_roll_land';
        break;
      }

      case 'move_to_nearest': {
        let positions: number[];
        if (effect.spaceType === 'railroad') {
          positions = RAILROAD_POSITIONS;
        } else {
          positions = UTILITY_POSITIONS;
        }
        // Find nearest ahead
        let nearest = positions.find(p => p > player.position);
        if (!nearest) nearest = positions[0]; // Wrap around

        const from = player.position;
        const passedGo = nearest < from;
        if (passedGo) {
          player.balance += 200;
          events.push({ type: 'pass_go', playerId: player.id, collected: 200 });
        }
        player.position = nearest;
        events.push({ type: 'move', playerId: player.id, from, to: nearest, passedGo });

        // Handle rent with multiplier if owned
        const owner = getPropertyOwner(state, nearest);
        if (owner && owner.id !== player.id && !owner.properties.get(nearest)!.mortgaged) {
          const rent = calculateRent(state, nearest, state.lastDiceRoll!, effect.payMultiplier);
          player.balance -= rent;
          owner.balance += rent;
          events.push({
            type: 'pay_rent',
            payerId: player.id,
            ownerId: owner.id,
            amount: rent,
            property: getSpace(nearest).name,
          });
          if (player.balance < 0) {
            state.pendingDebt = { creditor: owner.id, amount: -player.balance, reason: `Card rent on ${getSpace(nearest).name}` };
            state.turnPhase = 'paying_debt';
          } else {
            state.turnPhase = 'post_action';
          }
        } else if (!owner) {
          state.turnPhase = 'purchase_decision';
        } else {
          state.turnPhase = 'post_action';
        }
        break;
      }

      case 'collect':
        player.balance += effect.amount;
        events.push({ type: 'collect', playerId: player.id, amount: effect.amount, reason: 'Card' });
        state.turnPhase = 'post_action';
        break;

      case 'pay':
        player.balance -= effect.amount;
        events.push({ type: 'pay', playerId: player.id, amount: effect.amount, reason: 'Card' });
        if (player.balance < 0) {
          state.pendingDebt = { creditor: 'bank', amount: -player.balance, reason: 'Card payment' };
          state.turnPhase = 'paying_debt';
        } else {
          state.turnPhase = 'post_action';
        }
        break;

      case 'pay_per_house': {
        const { houses, hotels } = countHousesAndHotels(state, player.id);
        const total = houses * effect.houseAmount + hotels * effect.hotelAmount;
        player.balance -= total;
        events.push({ type: 'pay', playerId: player.id, amount: total, reason: `Repairs: ${houses} houses × $${effect.houseAmount} + ${hotels} hotels × $${effect.hotelAmount}` });
        if (player.balance < 0) {
          state.pendingDebt = { creditor: 'bank', amount: -player.balance, reason: 'Property repairs' };
          state.turnPhase = 'paying_debt';
        } else {
          state.turnPhase = 'post_action';
        }
        break;
      }

      case 'collect_from_each_player': {
        let total = 0;
        for (const other of state.players) {
          if (other.id !== player.id && !other.isBankrupt) {
            other.balance -= effect.amount;
            total += effect.amount;
            events.push({
              type: 'transfer',
              fromPlayerId: other.id,
              toPlayerId: player.id,
              amount: effect.amount,
              reason: 'Card',
            });
          }
        }
        player.balance += total;
        state.turnPhase = 'post_action';
        break;
      }

      case 'pay_each_player': {
        let total = 0;
        for (const other of state.players) {
          if (other.id !== player.id && !other.isBankrupt) {
            other.balance += effect.amount;
            total += effect.amount;
            events.push({
              type: 'transfer',
              fromPlayerId: player.id,
              toPlayerId: other.id,
              amount: effect.amount,
              reason: 'Card',
            });
          }
        }
        player.balance -= total;
        if (player.balance < 0) {
          state.pendingDebt = { creditor: 'bank', amount: -player.balance, reason: 'Card payment' };
          state.turnPhase = 'paying_debt';
        } else {
          state.turnPhase = 'post_action';
        }
        break;
      }

      case 'get_out_of_jail_free':
        player.getOutOfJailCards++;
        state.turnPhase = 'post_action';
        break;

      case 'go_to_jail':
        this.sendToJail(state, player, events, 'Card: Go to Jail');
        state.turnPhase = 'post_action';
        break;
    }
  }

  private advanceToNextPlayer(state: GameState): void {
    const numPlayers = state.players.length;
    let next = (state.currentPlayerIndex + 1) % numPlayers;
    let attempts = 0;

    while (state.players[next].isBankrupt && attempts < numPlayers) {
      next = (next + 1) % numPlayers;
      attempts++;
    }

    state.currentPlayerIndex = next;
    state.turnPhase = 'pre_roll';
    state.turnNumber++;
    state.players[next].doublesCount = 0;
  }

  // ── Available Actions Builders ──

  private getPreRollActions(state: GameState, player: PlayerState): AvailableAction[] {
    const actions: AvailableAction[] = [
      { action: 'roll_dice', description: 'Roll the dice to move.' },
    ];

    this.addBuildActions(state, player, actions);
    this.addMortgageActions(state, player, actions);
    this.addTradeActions(state, player, actions);

    return actions;
  }

  private getAwaitingRollActions(state: GameState, player: PlayerState): AvailableAction[] {
    if (player.inJail) {
      const actions: AvailableAction[] = [
        { action: 'roll_dice', description: 'Roll the dice. Doubles gets you out of jail.' },
      ];
      if (player.getOutOfJailCards > 0) {
        actions.push({
          action: 'use_get_out_of_jail_card',
          description: 'Use a Get Out of Jail Free card.',
        });
      }
      if (player.balance >= 50) {
        actions.push({
          action: 'pay_jail_fine',
          description: 'Pay $50 to get out of jail.',
        });
      }
      return actions;
    }

    return [{ action: 'roll_dice', description: 'Roll the dice to move.' }];
  }

  private getPurchaseDecisionActions(state: GameState, player: PlayerState): AvailableAction[] {
    const space = getSpace(player.position) as OwnableSpace;
    const actions: AvailableAction[] = [];

    if (player.balance >= space.price) {
      actions.push({
        action: 'buy_property',
        description: `Buy ${space.name} for $${space.price}.`,
      });
    }
    actions.push({
      action: 'auction_property',
      description: `Decline to buy ${space.name}. It goes to auction.`,
    });

    return actions;
  }

  private getAuctionActions(state: GameState, player: PlayerState): AvailableAction[] {
    return [{
      action: 'submit_bid',
      description: 'Submit your bid for the property being auctioned. Bid 0 to pass.',
      parameters: {
        amount: {
          type: 'number',
          description: `Your bid amount (0 to pass, max $${player.balance}).`,
        },
      },
      required: ['amount'],
    }];
  }

  private getPayingDebtActions(state: GameState, player: PlayerState): AvailableAction[] {
    const actions: AvailableAction[] = [];

    // Can mortgage or sell houses to raise funds
    this.addSellHouseActions(state, player, actions);
    this.addMortgageActions(state, player, actions);
    this.addTradeActions(state, player, actions);

    // Can always declare bankruptcy
    actions.push({
      action: 'declare_bankruptcy',
      description: 'Declare bankruptcy. You are eliminated from the game.',
    });

    // If balance is now non-negative, debt is resolved
    if (player.balance >= 0) {
      actions.push({
        action: 'end_turn',
        description: 'Debt resolved. End your turn.',
      });
    }

    return actions;
  }

  private getTradingActions(state: GameState): AvailableAction[] {
    return [
      { action: 'accept_trade', description: 'Accept the trade offer.' },
      { action: 'reject_trade', description: 'Reject the trade offer.' },
    ];
  }

  private getPostActionActions(state: GameState, player: PlayerState): AvailableAction[] {
    const actions: AvailableAction[] = [
      { action: 'end_turn', description: 'End your turn.' },
    ];

    this.addBuildActions(state, player, actions);
    this.addMortgageActions(state, player, actions);
    this.addUnmortgageActions(state, player, actions);
    this.addTradeActions(state, player, actions);

    return actions;
  }

  private addBuildActions(state: GameState, player: PlayerState, actions: AvailableAction[]): void {
    const buildablePositions: number[] = [];
    const hotelPositions: number[] = [];

    for (const [pos, propState] of player.properties) {
      const space = getSpace(pos);
      if (space.type !== 'property') continue;
      if (propState.mortgaged) continue;

      const groupPositions = COLOR_GROUP_MEMBERS[space.colorGroup];
      if (!playerOwnsColorGroup(state, player.id, groupPositions)) continue;

      // Check no mortgaged properties in group
      const anyMortgaged = groupPositions.some(gp => player.properties.get(gp)?.mortgaged);
      if (anyMortgaged) continue;

      if (propState.houses < 4) {
        const minHouses = Math.min(...groupPositions.map(p => player.properties.get(p)!.houses));
        if (propState.houses <= minHouses && player.balance >= space.houseCost && state.bankHouses > 0) {
          buildablePositions.push(pos);
        }
      } else if (propState.houses === 4 && state.bankHotels > 0 && player.balance >= space.houseCost) {
        hotelPositions.push(pos);
      }
    }

    if (buildablePositions.length > 0) {
      actions.push({
        action: 'build_house',
        description: 'Build a house on a property.',
        parameters: {
          property_position: {
            type: 'number',
            description: 'Board position of the property.',
            enum: buildablePositions,
          },
        },
        required: ['property_position'],
      });
    }

    if (hotelPositions.length > 0) {
      actions.push({
        action: 'build_hotel',
        description: 'Upgrade a property from 4 houses to a hotel.',
        parameters: {
          property_position: {
            type: 'number',
            description: 'Board position of the property.',
            enum: hotelPositions,
          },
        },
        required: ['property_position'],
      });
    }
  }

  private addSellHouseActions(state: GameState, player: PlayerState, actions: AvailableAction[]): void {
    const sellablePositions: number[] = [];

    for (const [pos, propState] of player.properties) {
      const space = getSpace(pos);
      if (space.type !== 'property') continue;
      if (propState.houses === 0) continue;

      if (propState.houses === 5) {
        sellablePositions.push(pos);
      } else {
        // Even selling: can only sell from properties with max houses in group
        const groupPositions = COLOR_GROUP_MEMBERS[space.colorGroup];
        const maxHouses = Math.max(...groupPositions.map(p => player.properties.get(p)?.houses ?? 0));
        if (propState.houses >= maxHouses) {
          sellablePositions.push(pos);
        }
      }
    }

    if (sellablePositions.length > 0) {
      actions.push({
        action: 'sell_house',
        description: 'Sell a house (half of purchase price).',
        parameters: {
          property_position: {
            type: 'number',
            description: 'Board position of the property.',
            enum: sellablePositions,
          },
        },
        required: ['property_position'],
      });
    }
  }

  private addMortgageActions(state: GameState, player: PlayerState, actions: AvailableAction[]): void {
    const mortgageablePositions: number[] = [];

    for (const [pos, propState] of player.properties) {
      if (propState.mortgaged) continue;

      const space = getSpace(pos);
      if (space.type === 'property') {
        const groupPositions = COLOR_GROUP_MEMBERS[space.colorGroup];
        const hasHouses = groupPositions.some(gp => (player.properties.get(gp)?.houses ?? 0) > 0);
        if (hasHouses) continue;
      }

      mortgageablePositions.push(pos);
    }

    if (mortgageablePositions.length > 0) {
      actions.push({
        action: 'mortgage_property',
        description: 'Mortgage a property to the bank.',
        parameters: {
          property_position: {
            type: 'number',
            description: 'Board position of the property.',
            enum: mortgageablePositions,
          },
        },
        required: ['property_position'],
      });
    }
  }

  private addUnmortgageActions(state: GameState, player: PlayerState, actions: AvailableAction[]): void {
    const unmortgageablePositions: number[] = [];

    for (const [pos, propState] of player.properties) {
      if (!propState.mortgaged) continue;
      const space = getSpace(pos) as OwnableSpace;
      const cost = Math.floor(space.mortgageValue * 1.1);
      if (player.balance >= cost) {
        unmortgageablePositions.push(pos);
      }
    }

    if (unmortgageablePositions.length > 0) {
      actions.push({
        action: 'unmortgage_property',
        description: 'Unmortgage a property (pay mortgage value + 10% interest).',
        parameters: {
          property_position: {
            type: 'number',
            description: 'Board position of the property.',
            enum: unmortgageablePositions,
          },
        },
        required: ['property_position'],
      });
    }
  }

  private addTradeActions(state: GameState, player: PlayerState, actions: AvailableAction[]): void {
    const otherPlayers = state.players.filter(p => p.id !== player.id && !p.isBankrupt);
    if (otherPlayers.length === 0 || player.properties.size === 0) return;

    const tradablePositions = Array.from(player.properties.entries())
      .filter(([_, ps]) => ps.houses === 0)
      .map(([pos, _]) => pos);

    if (tradablePositions.length === 0) return;

    actions.push({
      action: 'trade_offer',
      description: 'Propose a trade with another player.',
      parameters: {
        target_player_id: {
          type: 'string',
          description: 'The player to trade with.',
          enum: otherPlayers.map(p => p.id),
        },
        offered_properties: {
          type: 'array',
          description: 'Board positions of properties you are offering.',
          items: { type: 'number', description: 'Property position', enum: tradablePositions },
        },
        offered_money: {
          type: 'number',
          description: 'Amount of money you are offering (0 if none).',
        },
        requested_properties: {
          type: 'array',
          description: 'Board positions of properties you are requesting.',
          items: { type: 'number', description: 'Property position' },
        },
        requested_money: {
          type: 'number',
          description: 'Amount of money you are requesting (0 if none).',
        },
      },
      required: ['target_player_id', 'offered_properties', 'offered_money', 'requested_properties', 'requested_money'],
    });
  }

  private describeTradeOffer(trade: TradeOffer): string {
    const parts: string[] = [];
    if (trade.offeredProperties.length > 0) {
      parts.push(`properties at [${trade.offeredProperties.map(p => getSpace(p).name).join(', ')}]`);
    }
    if (trade.offeredMoney > 0) {
      parts.push(`$${trade.offeredMoney}`);
    }
    const offered = parts.join(' and ') || 'nothing';

    const reqParts: string[] = [];
    if (trade.requestedProperties.length > 0) {
      reqParts.push(`properties at [${trade.requestedProperties.map(p => getSpace(p).name).join(', ')}]`);
    }
    if (trade.requestedMoney > 0) {
      reqParts.push(`$${trade.requestedMoney}`);
    }
    const requested = reqParts.join(' and ') || 'nothing';

    return `Offered ${offered} for ${requested}`;
  }
}
