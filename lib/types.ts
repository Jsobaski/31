export type Suit = 'H' | 'D' | 'C' | 'S';
export type Value = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  value: Value;
  points: number;
  id: string;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  lives: number;
  isBot: boolean;
  hasKnocked: boolean;
  isEliminated: boolean;
}

export interface RoundResult {
  loserIds: string[];
  knockerPenalty: boolean;
  scores: Record<string, number>;
  blitzPlayerId?: string;
}

export type TurnPhase = 'draw' | 'discard';

export interface GameState {
  deck: Card[];
  discardPile: Card[];
  players: Player[];
  currentTurnIdx: number;
  knockerIdx: number | null;
  roundOver: boolean;
  turnPhase: TurnPhase;
  drawnCard: Card | null;
  drawnFromDiscard: boolean;
  roundResults: RoundResult | null;
  gameOver: boolean;
  winnerId: string | null;
  message: string;
  roundNumber: number;
}

/** A seat at the table when starting a game. */
export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
}

/** What a player most recently did, shown as a label under their name. */
export interface BotMove {
  draw?: string;
  fromStock?: boolean;
  discard?: string;
}
