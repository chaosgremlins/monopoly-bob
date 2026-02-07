import { describe, it, expect } from 'bun:test';
import {
  BOARD_SPACES, COLOR_GROUP_MEMBERS, RAILROAD_POSITIONS, UTILITY_POSITIONS,
  getSpace, isOwnableSpace,
} from '../src/engine/board-data';

describe('board-data', () => {
  it('has exactly 40 spaces', () => {
    expect(BOARD_SPACES).toHaveLength(40);
  });

  it('each space has a unique position from 0-39', () => {
    const positions = BOARD_SPACES.map(s => s.position);
    expect(positions).toEqual(Array.from({ length: 40 }, (_, i) => i));
  });

  it('Go is at position 0', () => {
    expect(BOARD_SPACES[0].type).toBe('go');
    expect(BOARD_SPACES[0].name).toBe('Go');
  });

  it('Jail is at position 10', () => {
    expect(BOARD_SPACES[10].type).toBe('jail');
  });

  it('Free Parking is at position 20', () => {
    expect(BOARD_SPACES[20].type).toBe('free_parking');
  });

  it('Go To Jail is at position 30', () => {
    expect(BOARD_SPACES[30].type).toBe('go_to_jail');
  });

  it('has 4 railroads at correct positions', () => {
    expect(RAILROAD_POSITIONS).toEqual([5, 15, 25, 35]);
    for (const pos of RAILROAD_POSITIONS) {
      expect(BOARD_SPACES[pos].type).toBe('railroad');
    }
  });

  it('has 2 utilities at correct positions', () => {
    expect(UTILITY_POSITIONS).toEqual([12, 28]);
    for (const pos of UTILITY_POSITIONS) {
      expect(BOARD_SPACES[pos].type).toBe('utility');
    }
  });

  it('has 2 tax spaces', () => {
    const taxes = BOARD_SPACES.filter(s => s.type === 'tax');
    expect(taxes).toHaveLength(2);
    expect(taxes[0].name).toBe('Income Tax');
    expect(taxes[1].name).toBe('Luxury Tax');
  });

  it('has 3 Chance and 3 Community Chest spaces', () => {
    const chance = BOARD_SPACES.filter(s => s.type === 'chance');
    const cc = BOARD_SPACES.filter(s => s.type === 'community_chest');
    expect(chance).toHaveLength(3);
    expect(cc).toHaveLength(3);
  });

  it('has 22 properties across 8 color groups', () => {
    const properties = BOARD_SPACES.filter(s => s.type === 'property');
    expect(properties).toHaveLength(22);

    const totalGroupMembers = Object.values(COLOR_GROUP_MEMBERS)
      .reduce((sum, arr) => sum + arr.length, 0);
    expect(totalGroupMembers).toBe(22);
  });

  it('all color group positions reference valid property spaces', () => {
    for (const [group, positions] of Object.entries(COLOR_GROUP_MEMBERS)) {
      for (const pos of positions) {
        const space = BOARD_SPACES[pos];
        expect(space.type).toBe('property');
        if (space.type === 'property') {
          expect(space.colorGroup).toBe(group);
        }
      }
    }
  });

  it('brown has 2 members, dark_blue has 2, others have 3', () => {
    expect(COLOR_GROUP_MEMBERS.brown).toHaveLength(2);
    expect(COLOR_GROUP_MEMBERS.dark_blue).toHaveLength(2);
    expect(COLOR_GROUP_MEMBERS.light_blue).toHaveLength(3);
    expect(COLOR_GROUP_MEMBERS.pink).toHaveLength(3);
    expect(COLOR_GROUP_MEMBERS.orange).toHaveLength(3);
    expect(COLOR_GROUP_MEMBERS.red).toHaveLength(3);
    expect(COLOR_GROUP_MEMBERS.yellow).toHaveLength(3);
    expect(COLOR_GROUP_MEMBERS.green).toHaveLength(3);
  });

  it('all properties have valid rent arrays with 6 entries', () => {
    for (const space of BOARD_SPACES) {
      if (space.type === 'property') {
        expect(space.rent).toHaveLength(6);
        // Rent should be monotonically increasing
        for (let i = 1; i < 6; i++) {
          expect(space.rent[i]).toBeGreaterThan(space.rent[i - 1]);
        }
      }
    }
  });

  it('mortgage values are half of prices', () => {
    for (const space of BOARD_SPACES) {
      if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
        expect(space.mortgageValue).toBe(space.price / 2);
      }
    }
  });

  describe('getSpace', () => {
    it('returns the space at the given position', () => {
      expect(getSpace(0).name).toBe('Go');
      expect(getSpace(39).name).toBe('Boardwalk');
    });
  });

  describe('isOwnableSpace', () => {
    it('returns true for properties, railroads, and utilities', () => {
      expect(isOwnableSpace(getSpace(1))).toBe(true);  // property
      expect(isOwnableSpace(getSpace(5))).toBe(true);  // railroad
      expect(isOwnableSpace(getSpace(12))).toBe(true); // utility
    });

    it('returns false for non-ownable spaces', () => {
      expect(isOwnableSpace(getSpace(0))).toBe(false);  // Go
      expect(isOwnableSpace(getSpace(7))).toBe(false);  // Chance
      expect(isOwnableSpace(getSpace(4))).toBe(false);  // Tax
      expect(isOwnableSpace(getSpace(10))).toBe(false); // Jail
      expect(isOwnableSpace(getSpace(30))).toBe(false); // Go To Jail
    });
  });
});
