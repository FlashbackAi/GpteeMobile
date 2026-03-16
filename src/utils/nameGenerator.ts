/**
 * nameGenerator.ts
 * Generates unique gameId-style names (e.g., "ShadowWolf42", "CrimsonPhoenix88")
 */

const adjectives = [
  'Shadow', 'Crimson', 'Mystic', 'Thunder', 'Silver', 'Golden', 'Dark', 'Bright',
  'Storm', 'Frost', 'Fire', 'Ocean', 'Sky', 'Star', 'Moon', 'Solar',
  'Neon', 'Cyber', 'Quantum', 'Phantom', 'Ninja', 'Dragon', 'Phoenix', 'Tiger',
  'Wolf', 'Eagle', 'Hawk', 'Lion', 'Bear', 'Fox', 'Raven', 'Viper',
  'Blade', 'Steel', 'Iron', 'Bronze', 'Arctic', 'Desert', 'Forest', 'Mountain',
  'Crystal', 'Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Obsidian', 'Electric', 'Sonic',
  'Turbo', 'Nitro', 'Rocket', 'Laser', 'Plasma', 'Atomic', 'Cosmic', 'Galactic',
];

const nouns = [
  'Wolf', 'Tiger', 'Dragon', 'Phoenix', 'Eagle', 'Hawk', 'Lion', 'Bear',
  'Fox', 'Raven', 'Viper', 'Cobra', 'Panther', 'Falcon', 'Shark', 'Jaguar',
  'Warrior', 'Knight', 'Hunter', 'Ranger', 'Assassin', 'Ninja', 'Samurai', 'Ronin',
  'Wizard', 'Mage', 'Sage', 'Oracle', 'Prophet', 'Mystic', 'Shaman', 'Druid',
  'Blade', 'Shadow', 'Storm', 'Thunder', 'Lightning', 'Blaze', 'Inferno', 'Frost',
  'Reaper', 'Phantom', 'Ghost', 'Specter', 'Wraith', 'Spirit', 'Demon', 'Angel',
  'Titan', 'Giant', 'Colossus', 'Behemoth', 'Leviathan', 'Kraken', 'Hydra', 'Chimera',
];

/**
 * Generate a unique gameId-style name
 * Format: AdjectiveNounXX (e.g., "ShadowWolf42")
 */
export function generateGameName(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(Math.random() * 100);

  return `${adjective}${noun}${number}`;
}

/**
 * Generate multiple unique names
 */
export function generateMultipleNames(count: number): string[] {
  const names = new Set<string>();

  while (names.size < count) {
    names.add(generateGameName());
  }

  return Array.from(names);
}
