import { Space, ColorGroup } from './types';

export const BOARD_SPACES: Space[] = [
  { position: 0, name: 'Go', type: 'go' },
  { position: 1, name: 'Mediterranean Avenue', type: 'property', colorGroup: 'brown',
    price: 60, mortgageValue: 30, houseCost: 50, rent: [2, 10, 30, 90, 160, 250] },
  { position: 2, name: 'Community Chest', type: 'community_chest' },
  { position: 3, name: 'Baltic Avenue', type: 'property', colorGroup: 'brown',
    price: 60, mortgageValue: 30, houseCost: 50, rent: [4, 20, 60, 180, 320, 450] },
  { position: 4, name: 'Income Tax', type: 'tax', amount: 200 },
  { position: 5, name: 'Reading Railroad', type: 'railroad',
    price: 200, mortgageValue: 100 },
  { position: 6, name: 'Oriental Avenue', type: 'property', colorGroup: 'light_blue',
    price: 100, mortgageValue: 50, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { position: 7, name: 'Chance', type: 'chance' },
  { position: 8, name: 'Vermont Avenue', type: 'property', colorGroup: 'light_blue',
    price: 100, mortgageValue: 50, houseCost: 50, rent: [6, 30, 90, 270, 400, 550] },
  { position: 9, name: 'Connecticut Avenue', type: 'property', colorGroup: 'light_blue',
    price: 120, mortgageValue: 60, houseCost: 50, rent: [8, 40, 100, 300, 450, 600] },
  { position: 10, name: 'Jail / Just Visiting', type: 'jail' },
  { position: 11, name: 'St. Charles Place', type: 'property', colorGroup: 'pink',
    price: 140, mortgageValue: 70, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { position: 12, name: 'Electric Company', type: 'utility',
    price: 150, mortgageValue: 75 },
  { position: 13, name: 'States Avenue', type: 'property', colorGroup: 'pink',
    price: 140, mortgageValue: 70, houseCost: 100, rent: [10, 50, 150, 450, 625, 750] },
  { position: 14, name: 'Virginia Avenue', type: 'property', colorGroup: 'pink',
    price: 160, mortgageValue: 80, houseCost: 100, rent: [12, 60, 180, 500, 700, 900] },
  { position: 15, name: 'Pennsylvania Railroad', type: 'railroad',
    price: 200, mortgageValue: 100 },
  { position: 16, name: 'St. James Place', type: 'property', colorGroup: 'orange',
    price: 180, mortgageValue: 90, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { position: 17, name: 'Community Chest', type: 'community_chest' },
  { position: 18, name: 'Tennessee Avenue', type: 'property', colorGroup: 'orange',
    price: 180, mortgageValue: 90, houseCost: 100, rent: [14, 70, 200, 550, 750, 950] },
  { position: 19, name: 'New York Avenue', type: 'property', colorGroup: 'orange',
    price: 200, mortgageValue: 100, houseCost: 100, rent: [16, 80, 220, 600, 800, 1000] },
  { position: 20, name: 'Free Parking', type: 'free_parking' },
  { position: 21, name: 'Kentucky Avenue', type: 'property', colorGroup: 'red',
    price: 220, mortgageValue: 110, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { position: 22, name: 'Chance', type: 'chance' },
  { position: 23, name: 'Indiana Avenue', type: 'property', colorGroup: 'red',
    price: 220, mortgageValue: 110, houseCost: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { position: 24, name: 'Illinois Avenue', type: 'property', colorGroup: 'red',
    price: 240, mortgageValue: 120, houseCost: 150, rent: [20, 100, 300, 750, 925, 1100] },
  { position: 25, name: 'B&O Railroad', type: 'railroad',
    price: 200, mortgageValue: 100 },
  { position: 26, name: 'Atlantic Avenue', type: 'property', colorGroup: 'yellow',
    price: 260, mortgageValue: 130, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { position: 27, name: 'Ventnor Avenue', type: 'property', colorGroup: 'yellow',
    price: 260, mortgageValue: 130, houseCost: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { position: 28, name: 'Water Works', type: 'utility',
    price: 150, mortgageValue: 75 },
  { position: 29, name: 'Marvin Gardens', type: 'property', colorGroup: 'yellow',
    price: 280, mortgageValue: 140, houseCost: 150, rent: [24, 120, 360, 850, 1025, 1200] },
  { position: 30, name: 'Go To Jail', type: 'go_to_jail' },
  { position: 31, name: 'Pacific Avenue', type: 'property', colorGroup: 'green',
    price: 300, mortgageValue: 150, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { position: 32, name: 'North Carolina Avenue', type: 'property', colorGroup: 'green',
    price: 300, mortgageValue: 150, houseCost: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { position: 33, name: 'Community Chest', type: 'community_chest' },
  { position: 34, name: 'Pennsylvania Avenue', type: 'property', colorGroup: 'green',
    price: 320, mortgageValue: 160, houseCost: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
  { position: 35, name: 'Short Line', type: 'railroad',
    price: 200, mortgageValue: 100 },
  { position: 36, name: 'Chance', type: 'chance' },
  { position: 37, name: 'Park Place', type: 'property', colorGroup: 'dark_blue',
    price: 350, mortgageValue: 175, houseCost: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
  { position: 38, name: 'Luxury Tax', type: 'tax', amount: 100 },
  { position: 39, name: 'Boardwalk', type: 'property', colorGroup: 'dark_blue',
    price: 400, mortgageValue: 200, houseCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
];

export const COLOR_GROUP_MEMBERS: Record<ColorGroup, number[]> = {
  brown: [1, 3],
  light_blue: [6, 8, 9],
  pink: [11, 13, 14],
  orange: [16, 18, 19],
  red: [21, 23, 24],
  yellow: [26, 27, 29],
  green: [31, 32, 34],
  dark_blue: [37, 39],
};

export const RAILROAD_POSITIONS = [5, 15, 25, 35];
export const UTILITY_POSITIONS = [12, 28];

export function getSpace(position: number): Space {
  return BOARD_SPACES[position];
}

export function isOwnableSpace(space: Space): space is import('./types.js').OwnableSpace {
  return space.type === 'property' || space.type === 'railroad' || space.type === 'utility';
}
