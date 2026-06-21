import { Card, GameState, Player, RoundResult, Suit, Value } from './types';

const VALUE_POINTS: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  J: 10, Q: 10, K: 10, A: 11,
};

const SUIT_SYMBOLS: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };

export function createDeck(): Card[] {
  const suits: Suit[] = ['H', 'D', 'C', 'S'];
  const values: Value[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return suits.flatMap(suit =>
    values.map(value => ({
      suit,
      value,
      points: VALUE_POINTS[value],
      id: `${value}${suit}`,
    }))
  );
}

export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function calculateScore(hand: Card[]): number {
  if (hand.length === 0) return 0;

  // Three of a kind = 30 points
  if (
    hand.length === 3 &&
    hand[0].value === hand[1].value &&
    hand[1].value === hand[2].value
  ) {
    return 30;
  }

  // Group by suit and return the highest suit total
  const suitTotals: Record<string, number> = {};
  for (const card of hand) {
    suitTotals[card.suit] = (suitTotals[card.suit] ?? 0) + card.points;
  }
  return Math.max(...Object.values(suitTotals));
}

export function cardName(card: Card): string {
  return `${card.value}${SUIT_SYMBOLS[card.suit]}`;
}

// ─── Init / Deal ──────────────────────────────────────────────────────────────

export function initGame(playerName: string, numBots: number): GameState {
  const players: Player[] = [
    { id: 'p0', name: playerName || 'You', hand: [], lives: 3, isBot: false, hasKnocked: false, isEliminated: false },
    ...Array.from({ length: numBots }, (_, i) => ({
      id: `bot${i + 1}`,
      name: `Bot ${i + 1}`,
      hand: [],
      lives: 3,
      isBot: true,
      hasKnocked: false,
      isEliminated: false,
    })),
  ];

  return dealRound({
    deck: [],
    discardPile: [],
    players,
    currentTurnIdx: 0,
    knockerIdx: null,
    roundOver: false,
    turnPhase: 'draw',
    drawnCard: null,
    drawnFromDiscard: false,
    roundResults: null,
    gameOver: false,
    winnerId: null,
    message: '',
    roundNumber: 1,
  });
}

export function dealRound(state: GameState): GameState {
  const deck = shuffleDeck(createDeck());
  let idx = 0;

  const players = state.players.map(p => {
    if (p.isEliminated) return { ...p, hand: [], hasKnocked: false };
    const hand = deck.slice(idx, idx + 3);
    idx += 3;
    return { ...p, hand, hasKnocked: false };
  });

  const discardPile = [deck[idx]];
  const remaining = deck.slice(idx + 1);

  let startIdx = 0;
  while (players[startIdx].isEliminated) startIdx = (startIdx + 1) % players.length;

  return {
    ...state,
    deck: remaining,
    discardPile,
    players,
    currentTurnIdx: startIdx,
    knockerIdx: null,
    roundOver: false,
    turnPhase: 'draw',
    drawnCard: null,
    drawnFromDiscard: false,
    roundResults: null,
    message: `Round ${state.roundNumber}. ${players[startIdx].name}'s turn to draw.`,
  };
}

// ─── Human actions ────────────────────────────────────────────────────────────

export function drawFromDeck(state: GameState): GameState {
  if (state.turnPhase !== 'draw' || state.roundOver) return state;
  if (state.players[state.currentTurnIdx].isBot) return state;

  let deck = [...state.deck];

  // Reshuffle discard pile into deck if empty (keep top card)
  if (deck.length === 0) {
    if (state.discardPile.length <= 1) return { ...state, message: 'No cards left to draw!' };
    const top = state.discardPile[state.discardPile.length - 1];
    const reshuffled = shuffleDeck(state.discardPile.slice(0, -1));
    deck = reshuffled;
    return drawFromDeck({ ...state, deck, discardPile: [top] });
  }

  const drawnCard = deck[deck.length - 1];
  deck = deck.slice(0, -1);

  const players = state.players.map((p, i) =>
    i === state.currentTurnIdx ? { ...p, hand: [...p.hand, drawnCard] } : p
  );

  return {
    ...state,
    deck,
    players,
    turnPhase: 'discard',
    drawnCard,
    drawnFromDiscard: false,
    message: `You drew ${cardName(drawnCard)}. Choose a card to discard.`,
  };
}

export function drawFromDiscard(state: GameState): GameState {
  if (state.turnPhase !== 'draw' || state.roundOver) return state;
  if (state.players[state.currentTurnIdx].isBot) return state;
  if (state.discardPile.length === 0) return { ...state, message: 'Discard pile is empty!' };

  const discardPile = [...state.discardPile];
  const drawnCard = discardPile.pop()!;

  const players = state.players.map((p, i) =>
    i === state.currentTurnIdx ? { ...p, hand: [...p.hand, drawnCard] } : p
  );

  return {
    ...state,
    discardPile,
    players,
    turnPhase: 'discard',
    drawnCard,
    drawnFromDiscard: true,
    message: `You drew ${cardName(drawnCard)} from the discard. Choose a card to discard.`,
  };
}

export function knock(state: GameState): GameState {
  if (state.turnPhase !== 'draw' || state.knockerIdx !== null || state.roundOver) return state;
  if (state.players[state.currentTurnIdx].isBot) return state;

  const current = state.players[state.currentTurnIdx];
  const players = state.players.map((p, i) =>
    i === state.currentTurnIdx ? { ...p, hasKnocked: true } : p
  );

  const nextIdx = nextActiveIdx(players, state.currentTurnIdx);

  return {
    ...state,
    players,
    knockerIdx: state.currentTurnIdx,
    currentTurnIdx: nextIdx,
    turnPhase: 'draw',
    message: `${current.name} knocked! All other players get one more turn.`,
  };
}

export function discardCard(state: GameState, cardId: string): GameState {
  if (state.turnPhase !== 'discard' || state.roundOver) return state;

  const current = state.players[state.currentTurnIdx];

  if (state.drawnFromDiscard && state.drawnCard?.id === cardId) {
    return {
      ...state,
      message: 'You cannot put back the card you just drew from the discard pile!',
    };
  }

  const cardToDiscard = current.hand.find(c => c.id === cardId);
  if (!cardToDiscard) return state;

  const newHand = current.hand.filter(c => c.id !== cardId);
  const discardPile = [...state.discardPile, cardToDiscard];

  const players = state.players.map((p, i) =>
    i === state.currentTurnIdx ? { ...p, hand: newHand } : p
  );

  const updatedState: GameState = {
    ...state,
    players,
    discardPile,
    drawnCard: null,
    drawnFromDiscard: false,
  };

  // Instant 31 — blitz!
  if (calculateScore(newHand) === 31) {
    return resolveRound(updatedState, 'blitz', state.currentTurnIdx);
  }

  const nextIdx = nextActiveIdx(players, state.currentTurnIdx);
  const knockCountdownComplete = state.knockerIdx !== null && nextIdx === state.knockerIdx;

  if (knockCountdownComplete) {
    return resolveRound({ ...updatedState, currentTurnIdx: nextIdx }, 'knock', -1);
  }

  return {
    ...updatedState,
    currentTurnIdx: nextIdx,
    turnPhase: 'draw',
    message: `${players[nextIdx].name}'s turn to draw.`,
  };
}

// ─── Bot AI ───────────────────────────────────────────────────────────────────

// Phase 1: bot decides whether to knock, draw from discard, or draw from deck.
// Returns state with turnPhase:'discard' (4-card hand) or, on knock, the
// already-advanced state with the next player active.
export function executeBotDraw(state: GameState): GameState {
  const bot = state.players[state.currentTurnIdx];
  if (!bot.isBot || state.roundOver || state.gameOver || state.turnPhase !== 'draw') return state;

  const currentScore = calculateScore(bot.hand);
  const topDiscard = state.discardPile[state.discardPile.length - 1];

  // Knock if score is high enough and nobody has knocked yet
  if (state.knockerIdx === null && currentScore >= 27) {
    if (currentScore >= 29 || Math.random() < 0.55) {
      const players = state.players.map((p, i) =>
        i === state.currentTurnIdx ? { ...p, hasKnocked: true } : p
      );
      const nextIdx = nextActiveIdx(players, state.currentTurnIdx);
      return {
        ...state,
        players,
        knockerIdx: state.currentTurnIdx,
        currentTurnIdx: nextIdx,
        turnPhase: 'draw',
        message: `${bot.name} knocked! All other players get one more turn.`,
      };
    }
  }

  // Evaluate all possible swaps to decide: discard pile or deck?
  let useDiscardPile = false;
  let bestScore = currentScore;

  if (topDiscard) {
    for (const remove of bot.hand) {
      const sim = [...bot.hand.filter(c => c.id !== remove.id), topDiscard];
      const s = calculateScore(sim);
      if (s > bestScore) {
        bestScore = s;
        useDiscardPile = true;
      }
    }
  }

  if (useDiscardPile) {
    const discardPile = state.discardPile.slice(0, -1);
    const players = state.players.map((p, i) =>
      i === state.currentTurnIdx ? { ...p, hand: [...p.hand, topDiscard] } : p
    );
    return {
      ...state,
      discardPile,
      players,
      turnPhase: 'discard',
      drawnCard: topDiscard,
      drawnFromDiscard: true,
      message: `${bot.name} took ${cardName(topDiscard)} from the discard pile.`,
    };
  }

  // Draw from deck (reshuffle discard into deck if needed)
  let deck = [...state.deck];
  if (deck.length === 0) {
    if (state.discardPile.length <= 1) return state;
    const top = state.discardPile[state.discardPile.length - 1];
    deck = shuffleDeck(state.discardPile.slice(0, -1));
    return executeBotDraw({ ...state, deck, discardPile: [top] });
  }
  const drawnCard = deck[deck.length - 1];
  deck = deck.slice(0, -1);
  const players = state.players.map((p, i) =>
    i === state.currentTurnIdx ? { ...p, hand: [...p.hand, drawnCard] } : p
  );
  return {
    ...state,
    deck,
    players,
    turnPhase: 'discard',
    drawnCard,
    drawnFromDiscard: false,
    message: `${bot.name} drew from the stock pile.`,
  };
}

// Phase 2: bot picks the best card to discard from its 4-card hand.
export function executeBotDiscard(state: GameState): GameState {
  const bot = state.players[state.currentTurnIdx];
  if (!bot.isBot || state.roundOver || state.gameOver || state.turnPhase !== 'discard') return state;

  // Find the discard that maximises the remaining 3-card score
  let bestDiscardId = '';
  let best = -1;
  for (const card of bot.hand) {
    // Cannot immediately put back a card drawn from the discard pile
    if (state.drawnFromDiscard && state.drawnCard?.id === card.id) continue;
    const remaining = bot.hand.filter(c => c.id !== card.id);
    const s = calculateScore(remaining);
    if (s > best) {
      best = s;
      bestDiscardId = card.id;
    }
  }

  // Fallback: discard first non-restricted card
  if (!bestDiscardId) {
    bestDiscardId = bot.hand.find(
      c => !(state.drawnFromDiscard && state.drawnCard?.id === c.id)
    )?.id ?? bot.hand[0].id;
  }

  const cardToDiscard = bot.hand.find(c => c.id === bestDiscardId)!;
  const newHand = bot.hand.filter(c => c.id !== bestDiscardId);
  const discardPile = [...state.discardPile, cardToDiscard];
  const players = state.players.map((p, i) =>
    i === state.currentTurnIdx ? { ...p, hand: newHand } : p
  );

  const afterDiscard: GameState = {
    ...state,
    players,
    discardPile,
    drawnCard: null,
    drawnFromDiscard: false,
  };

  if (calculateScore(newHand) === 31) {
    return resolveRound(afterDiscard, 'blitz', state.currentTurnIdx);
  }

  const nextIdx = nextActiveIdx(players, state.currentTurnIdx);
  const knockCountdownComplete =
    afterDiscard.knockerIdx !== null && nextIdx === afterDiscard.knockerIdx;

  if (knockCountdownComplete) {
    return resolveRound({ ...afterDiscard, currentTurnIdx: nextIdx }, 'knock', -1);
  }

  return {
    ...afterDiscard,
    currentTurnIdx: nextIdx,
    turnPhase: 'draw',
    message: `${players[nextIdx].name}'s turn to draw.`,
  };
}

// ─── Round resolution ─────────────────────────────────────────────────────────

function resolveRound(
  state: GameState,
  trigger: 'blitz' | 'knock',
  blitzIdx: number
): GameState {
  const active = state.players.filter(p => !p.isEliminated);
  const scores: Record<string, number> = Object.fromEntries(
    active.map(p => [p.id, calculateScore(p.hand)])
  );

  let loserIds: string[];
  let knockerPenalty = false;

  if (trigger === 'blitz') {
    // Everyone else at the table loses a life when someone hits 31
    const blitzId = state.players[blitzIdx].id;
    loserIds = active.filter(p => p.id !== blitzId).map(p => p.id);
  } else {
    const minScore = Math.min(...active.map(p => scores[p.id]));
    loserIds = active.filter(p => scores[p.id] === minScore).map(p => p.id);

    const knocker = state.knockerIdx !== null ? state.players[state.knockerIdx] : null;
    if (knocker && loserIds.includes(knocker.id)) {
      knockerPenalty = true;
    }
  }

  const knockerId =
    state.knockerIdx !== null ? state.players[state.knockerIdx].id : null;

  const newPlayers = state.players.map(p => {
    if (!loserIds.includes(p.id)) return p;
    const penalty = knockerPenalty && p.id === knockerId ? 2 : 1;
    return { ...p, lives: p.lives - penalty };
  });

  const { finalPlayers, gameOver, winnerId } = checkEliminations(newPlayers);

  const roundResults: RoundResult = {
    loserIds,
    knockerPenalty,
    scores,
    blitzPlayerId: trigger === 'blitz' ? state.players[blitzIdx].id : undefined,
  };

  let message = buildRoundMessage(state.players, roundResults, state.knockerIdx);

  return {
    ...state,
    players: finalPlayers,
    roundOver: true,
    gameOver,
    winnerId,
    roundResults,
    message,
  };
}

function buildRoundMessage(
  players: Player[],
  result: RoundResult,
  knockerIdx: number | null
): string {
  if (result.blitzPlayerId) {
    const blitzer = players.find(p => p.id === result.blitzPlayerId);
    return `${blitzer?.name ?? 'Someone'} hit 31! Round over.`;
  }
  const loserNames = result.loserIds
    .map(id => players.find(p => p.id === id)?.name)
    .filter(Boolean)
    .join(' & ');
  const penalty = result.knockerPenalty
    ? ` The knocker lost — they lose 2 lives!`
    : '';
  return `Round over!${penalty} ${loserNames} had the lowest score.`;
}

function checkEliminations(players: Player[]): {
  finalPlayers: Player[];
  gameOver: boolean;
  winnerId: string | null;
} {
  const finalPlayers = players.map(p => ({
    ...p,
    isEliminated: p.isEliminated || p.lives < 0,
  }));

  const active = finalPlayers.filter(p => !p.isEliminated);
  if (active.length === 1) return { finalPlayers, gameOver: true, winnerId: active[0].id };
  if (active.length === 0) return { finalPlayers, gameOver: true, winnerId: null };
  return { finalPlayers, gameOver: false, winnerId: null };
}

function nextActiveIdx(players: Player[], current: number): number {
  let next = (current + 1) % players.length;
  let guard = 0;
  while (players[next].isEliminated && guard < players.length) {
    next = (next + 1) % players.length;
    guard++;
  }
  return next;
}
