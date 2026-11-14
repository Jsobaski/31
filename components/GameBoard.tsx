'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, GameState, Player } from '@/lib/types';
import {
  initGame, drawFromDeck, drawFromDiscard, knock, discardCard, dealRound,
  executeBotDraw, executeBotDiscard, calculateScore, cardName,
} from '@/lib/gameEngine';
import CardComponent, { FaceDownPile } from './CardComponent';

interface Props { playerName: string; numBots: number; onExit: () => void; }

// ─── Flying Card Overlay ──────────────────────────────────────────────────────

interface FlyInfo { card: Card; faceUp: boolean; fromRect: DOMRect; toRect: DOMRect; }

function FlyingCard({ info, onComplete }: { info: FlyInfo; onComplete: () => void }) {
  const [moving, setMoving] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    // Two RAFs: first paints the card at the source, second triggers the transition
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMoving(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Delta from source centre to destination centre
  const dx = (info.toRect.left + info.toRect.width  / 2) - (info.fromRect.left + info.fromRect.width  / 2);
  const dy = (info.toRect.top  + info.toRect.height / 2) - (info.fromRect.top  + info.fromRect.height / 2);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        // Anchor at source centre; translate(-50%,-50%) centres the card there
        left: info.fromRect.left + info.fromRect.width  / 2,
        top:  info.fromRect.top  + info.fromRect.height / 2,
        transform: moving
          ? `translate(calc(${dx}px - 50%), calc(${dy}px - 50%))`
          : 'translate(-50%, -50%)',
        transition: moving ? 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
        filter: info.faceUp
          ? 'drop-shadow(0 6px 20px rgba(251,191,36,0.85))'
          : 'drop-shadow(0 6px 20px rgba(96,165,250,0.85))',
      }}
      onTransitionEnd={() => {
        if (fired.current) return;
        fired.current = true;
        onComplete();
      }}
    >
      {info.faceUp
        ? <CardComponent card={info.card} size="lg" />
        : <CardComponent faceDown size="lg" />}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Which cards contribute to the hand's score (for highlighting).
function scoringIds(hand: Card[]): Set<string> {
  if (hand.length === 3 && hand.every(c => c.value === hand[0].value)) {
    return new Set(hand.map(c => c.id));
  }
  const totals: Record<string, number> = {};
  for (const c of hand) totals[c.suit] = (totals[c.suit] ?? 0) + c.points;
  const best = Object.entries(totals).sort((x, y) => y[1] - x[1])[0]?.[0];
  return new Set(hand.filter(c => c.suit === best).map(c => c.id));
}

// Best score reachable by taking `card` and discarding any other card.
function bestScoreWith(hand: Card[], card: Card): number {
  return Math.max(...hand.map(r => calculateScore([...hand.filter(c => c.id !== r.id), card])));
}

function scoreColor(s: number) {
  return s === 31 ? 'text-[#ffe27a]' : s >= 27 ? 'text-emerald-300' : s >= 20 ? 'text-white' : 'text-white/60';
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function LivesDisplay({ lives }: { lives: number }) {
  if (lives <= 0) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-200 text-[10px] font-bold tracking-widest">
        FREE RIDE
      </span>
    );
  }
  return (
    <span className="flex gap-0.5" aria-label={`${lives} lives`}>
      {[0, 1, 2].map(i => (
        <span key={i} className={`text-base leading-none transition-all ${i < lives ? 'text-rose-400 drop-shadow-[0_0_6px_rgba(251,113,133,0.7)]' : 'text-white/15'}`}>
          ♥
        </span>
      ))}
    </span>
  );
}

function BotPlayerArea({ player, isActive, score, showScore }: {
  player: Player; isActive: boolean; score?: number; showScore?: boolean;
}) {
  return (
    <div className={`glass flex flex-col items-center gap-2 px-4 py-3 rounded-2xl transition-all duration-300
      ${isActive ? 'turn-glow' : ''}
      ${player.isEliminated ? 'opacity-40 grayscale' : ''}
    `}>
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold card-serif border
          ${isActive ? 'bg-[#e8c468] text-[#3b2a05] border-[#fff3c4]' : 'bg-white/10 text-white/80 border-white/20'}`}>
          {player.name.slice(-1)}
        </span>
        <span className="text-white font-semibold text-sm">{player.name}</span>
        {player.hasKnocked && (
          <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/60 text-orange-200 text-[10px] font-bold tracking-wider">
            KNOCKED
          </span>
        )}
      </div>
      <LivesDisplay lives={player.lives} />
      <div className="flex items-center gap-1 min-h-14">
        {player.isEliminated ? (
          <span className="text-rose-400 text-xs font-bold tracking-widest">ELIMINATED</span>
        ) : showScore ? (
          <>
            {player.hand.map(c => <CardComponent key={c.id} card={c} size="sm" />)}
            <span className="text-[#ffe27a] font-bold text-xl ml-1 tabular-nums">{score}</span>
          </>
        ) : (
          <div className="flex -space-x-3">
            {player.hand.map((c, i) => (
              <div key={c.id} style={{ transform: `rotate(${(i - (player.hand.length - 1) / 2) * 6}deg)` }}>
                <CardComponent faceDown size="sm" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoundResultsModal({ state, onNextRound, onPlayAgain }: {
  state: GameState; onNextRound: () => void; onPlayAgain: () => void;
}) {
  const { roundResults, players, gameOver, winnerId } = state;
  if (!roundResults) return null;
  const winner = winnerId ? players.find(p => p.id === winnerId) : null;
  const humanWon = winner?.isBot === false;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="animate-pop glass bg-[#0c1c14]/90 rounded-3xl p-6 sm:p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto">
        {gameOver ? (
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">{humanWon ? '🏆' : '💀'}</div>
            <h2 className="text-3xl font-black gold-text mb-1 card-serif">
              {winner ? `${winner.name} Wins!` : 'Game Over'}
            </h2>
            <p className="text-white/50 text-sm">{humanWon ? 'Well played.' : 'Better luck next time.'}</p>
          </div>
        ) : (
          <h2 className="text-2xl font-bold text-white mb-5 text-center card-serif tracking-wide">
            Round {state.roundNumber} Results
          </h2>
        )}
        {roundResults.blitzPlayerId && (
          <div className="relative overflow-hidden text-center text-[#ffe27a] font-bold text-lg mb-4 py-2 rounded-xl bg-[#e8c468]/10 border border-[#e8c468]/40">
            <div className="absolute inset-0 shimmer" />
            <span className="relative">⚡ BLITZ — {players.find(p => p.id === roundResults.blitzPlayerId)?.name} hit 31!</span>
          </div>
        )}
        {roundResults.knockerPenalty && (
          <div className="text-center text-orange-300 text-sm mb-4 py-2 rounded-xl bg-orange-500/10 border border-orange-400/30">
            The knocker had the lowest score — 2 lives lost.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {players
            .filter(p => !p.isEliminated || roundResults.scores[p.id] !== undefined)
            .map(player => {
              const score     = roundResults.scores[player.id];
              const isLoser   = roundResults.loserIds.includes(player.id);
              const isKnocker = state.knockerIdx !== null && players[state.knockerIdx]?.id === player.id;
              const livesLost = isLoser ? (roundResults.knockerPenalty && isKnocker ? 2 : 1) : 0;
              const isBlitzer = roundResults.blitzPlayerId === player.id;
              return (
                <div key={player.id} className={`p-3 rounded-2xl border ${
                  isLoser ? 'border-rose-500/60 bg-rose-950/40'
                  : isBlitzer ? 'border-[#e8c468]/70 bg-[#e8c468]/10'
                  : 'border-white/10 bg-white/5'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-semibold text-sm">
                      {player.name}
                      {isKnocker && <span className="text-orange-300 text-[10px] ml-1.5 tracking-wider">KNOCKED</span>}
                    </span>
                    <span className={`text-2xl font-black tabular-nums ${score === 31 ? 'text-[#ffe27a]' : isLoser ? 'text-rose-400' : 'text-emerald-300'}`}>
                      {score ?? '—'}
                    </span>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {player.hand.map(c => <CardComponent key={c.id} card={c} size="sm" />)}
                  </div>
                  <div className="flex items-center justify-between">
                    <LivesDisplay lives={player.lives} />
                    {livesLost > 0 && <span className="text-rose-300 text-xs font-semibold">−{livesLost} {livesLost > 1 ? 'lives' : 'life'}</span>}
                    {player.isEliminated && <span className="text-rose-400 text-[10px] font-bold tracking-widest">ELIMINATED</span>}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="flex justify-center">
          {gameOver
            ? <button onClick={onPlayAgain} className="px-10 py-3 rounded-full font-bold text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-95 transition shadow-[0_8px_24px_rgba(232,196,104,0.35)]">Play Again</button>
            : <button onClick={onNextRound} autoFocus className="px-10 py-3 rounded-full font-bold text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-95 transition shadow-[0_8px_24px_rgba(232,196,104,0.35)]">Next Round →</button>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export default function GameBoard({ playerName, numBots, onExit }: Props) {
  const [game, setGame]             = useState<GameState>(() => initGame(playerName, numBots));
  const [showResults, setShowResults] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [flyingCard, setFlyingCard]   = useState<FlyInfo | null>(null);
  const [hoverId, setHoverId]         = useState<string | null>(null);
  const [hoverDiscard, setHoverDiscard] = useState(false);
  const [confirmKnock, setConfirmKnock] = useState(false);

  // Stable ref mirrors — read inside setTimeout/callbacks without stale-closure issues
  const gameRef    = useRef(game);
  const pendingRef = useRef<GameState | null>(null);
  useEffect(() => { gameRef.current = game; }, [game]);

  // DOM position anchors
  const stockRef     = useRef<HTMLDivElement>(null);
  const discardRef   = useRef<HTMLDivElement>(null);
  const humanHandRef = useRef<HTMLDivElement>(null);
  const botAreaRefs  = useRef<(HTMLDivElement | null)[]>([]);

  const human        = game.players[0];
  const isHumanTurn  = game.currentTurnIdx === 0 && !game.roundOver && !game.gameOver;
  const topDiscard   = game.discardPile[game.discardPile.length - 1];
  const isAnimating  = flyingCard !== null;

  // ── Animation helpers ──────────────────────────────────────────────────────

  // If nextState puts a bot in the discard phase, schedule the discard after `ms` ms
  function scheduleBotDiscard(nextState: GameState, ms = 500) {
    const cp = nextState.players[nextState.currentTurnIdx];
    if (cp?.isBot && nextState.turnPhase === 'discard' && !nextState.roundOver && !nextState.gameOver) {
      setTimeout(() => {
        setGame(s => {
          const p = s.players[s.currentTurnIdx];
          if (!p?.isBot || s.turnPhase !== 'discard' || s.roundOver) return s;
          return executeBotDiscard(s);
        });
      }, ms);
    }
  }

  // Launch a card flying from `fromEl` to `toEl`, then apply `nextState`.
  // Falls back to an immediate state update when rects are unavailable.
  function launchFly(
    nextState: GameState,
    fromEl: HTMLDivElement | null | undefined,
    toEl:   HTMLDivElement | null | undefined,
    faceUp: boolean
  ) {
    const fromRect = fromEl?.getBoundingClientRect();
    const toRect   = toEl?.getBoundingClientRect();
    if (!nextState.drawnCard || !fromRect || !toRect) {
      setGame(nextState);
      scheduleBotDiscard(nextState);
      return;
    }
    pendingRef.current = nextState;
    setFlyingCard({ card: nextState.drawnCard, faceUp, fromRect, toRect });
  }

  // Called by FlyingCard when the transition ends
  function handleFlyComplete() {
    const next = pendingRef.current;
    pendingRef.current = null;
    setFlyingCard(null);
    if (next) {
      setGame(next);
      scheduleBotDiscard(next);
    }
  }

  // ── Bot automation ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (game.roundOver || game.gameOver || game.turnPhase !== 'draw') return;
    const current = game.players[game.currentTurnIdx];
    if (!current?.isBot) return;

    setBotThinking(true);
    const t = setTimeout(() => {
      setBotThinking(false);
      const g  = gameRef.current;
      const cp = g.players[g.currentTurnIdx];
      if (!cp?.isBot || g.turnPhase !== 'draw' || g.roundOver) return;

      const afterDraw = executeBotDraw(g);
      if (!afterDraw.drawnCard) {
        // Bot knocked — no card to animate
        setGame(afterDraw);
        return;
      }
      const fromEl = afterDraw.drawnFromDiscard ? discardRef.current : stockRef.current;
      const toEl   = botAreaRefs.current[g.currentTurnIdx - 1]; // bots start at player index 1
      launchFly(afterDraw, fromEl, toEl, afterDraw.drawnFromDiscard);
    }, 800);

    return () => { clearTimeout(t); setBotThinking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.currentTurnIdx, game.turnPhase, game.roundOver, game.gameOver]);

  // ── Round results ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!game.roundOver) return;
    const t = setTimeout(() => setShowResults(true), 600);
    return () => clearTimeout(t);
  }, [game.roundOver]);

  // ── Human actions ──────────────────────────────────────────────────────────

  const handleDrawDeck = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw' || isAnimating) return;
    setConfirmKnock(false);
    launchFly(drawFromDeck(game), stockRef.current, humanHandRef.current, false);
  };

  const handleDrawDiscard = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw' || isAnimating) return;
    setConfirmKnock(false);
    launchFly(drawFromDiscard(game), discardRef.current, humanHandRef.current, true);
  };

  const handleKnock = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw' || game.knockerIdx !== null || isAnimating) return;
    setGame(prev => knock(prev));
  };

  const handleDiscard = (cardId: string) => {
    if (!isHumanTurn || game.turnPhase !== 'discard' || isAnimating) return;
    setGame(prev => discardCard(prev, cardId));
  };

  const handleNextRound = () => {
    setShowResults(false);
    setGame(prev => dealRound({ ...prev, roundNumber: prev.roundNumber + 1 }));
  };

  const handlePlayAgain = () => {
    setShowResults(false);
    setGame(initGame(playerName, numBots));
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const bots              = game.players.slice(1);
  const currentPlayerName = game.players[game.currentTurnIdx]?.name ?? '';
  // While a discard-pile card is in flight, hide the source card so it doesn't appear in two places
  const hidingTopDiscard  = isAnimating && flyingCard?.faceUp;

  const canDraw    = isHumanTurn && game.turnPhase === 'draw' && !isAnimating;
  const canDiscard = isHumanTurn && game.turnPhase === 'discard' && !isAnimating;
  const humanScore = human.isEliminated ? 0
    : game.roundOver && game.roundResults ? game.roundResults.scores[human.id] : calculateScore(human.hand);
  const lit        = scoringIds(human.hand);
  const hoverCard  = hoverId ? human.hand.find(c => c.id === hoverId) : undefined;
  const discardPreview = canDiscard && hoverCard && !(game.drawnFromDiscard && game.drawnCard?.id === hoverCard.id)
    ? calculateScore(human.hand.filter(c => c.id !== hoverCard.id)) : null;
  const takePreview = canDraw && hoverDiscard && topDiscard ? bestScoreWith(human.hand, topDiscard) : null;

  // Keyboard shortcuts: D stock · S discard pile · K knock · 1-4 discard · Esc cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showResults || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { setConfirmKnock(false); return; }
      if (canDraw && k === 'd') handleDrawDeck();
      else if (canDraw && k === 's') handleDrawDiscard();
      else if (canDraw && k === 'k' && game.knockerIdx === null) setConfirmKnock(c => !c);
      else if (canDraw && k === 'enter' && confirmKnock) { setConfirmKnock(false); handleKnock(); }
      else if (canDiscard && /^[1-9]$/.test(k)) {
        const card = human.hand[Number(k) - 1];
        if (card) handleDiscard(card.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="felt min-h-screen flex flex-col overflow-hidden">

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-3 bg-black/35 backdrop-blur border-b border-[#e8c468]/20">
        <div className="flex items-baseline gap-3">
          <h1 className="gold-text font-black text-2xl tracking-[0.25em] card-serif">31</h1>
          <span className="text-white/40 text-xs uppercase tracking-[0.25em] hidden sm:inline">Thirty-One</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="text-white/50 text-xs uppercase tracking-widest">Round {game.roundNumber}</span>
          <button onClick={onExit} className="px-3 py-1 text-white/60 hover:text-white text-xs uppercase tracking-widest border border-white/20 hover:border-white/50 rounded-full transition-colors">
            Exit
          </button>
        </div>
      </header>

      {/* Board */}
      <main className="flex-1 flex flex-col items-center justify-between p-4 gap-4 max-w-4xl mx-auto w-full">

        {/* Bot zones */}
        <div className={`flex flex-wrap gap-3 sm:gap-5 w-full justify-center ${bots.length === 1 ? 'max-w-xs' : ''}`}>
          {bots.map((bot, i) => (
            <div key={bot.id} ref={el => { botAreaRefs.current[i] = el; }}>
              <BotPlayerArea
                player={bot}
                isActive={game.currentTurnIdx === i + 1 && !game.roundOver}
                showScore={game.roundOver}
                score={game.roundResults?.scores[bot.id]}
              />
            </div>
          ))}
        </div>

        {/* Centre: status + piles */}
        <div className="flex flex-col items-center gap-5">
          <div
            key={game.message}
            className="animate-pop glass px-5 py-2 rounded-full text-center max-w-md"
            aria-live="polite"
          >
            <p className="text-white/90 text-sm">
              {botThinking && !game.roundOver ? `${currentPlayerName} is thinking…` : game.message}
            </p>
          </div>

          <div className="flex items-end gap-8 sm:gap-12">
            <div ref={stockRef} className="relative">
              <FaceDownPile
                count={game.deck.length}
                label="Stock"
                highlight={canDraw}
                onClick={canDraw ? handleDrawDeck : undefined}
              />
            </div>

            <div ref={discardRef} className="relative flex flex-col items-center gap-2">
              <div className="w-[4.5rem] h-[6.5rem] sm:w-20 sm:h-28 relative">
                {!hidingTopDiscard && topDiscard ? (
                  <div
                    className={`transition-all duration-200 rounded-xl ${
                      canDraw ? 'cursor-pointer hover:-translate-y-2 ring-2 ring-[#e8c468] shadow-[0_0_22px_rgba(232,196,104,0.5)]' : ''
                    }`}
                    onClick={canDraw ? handleDrawDiscard : undefined}
                    onMouseEnter={() => setHoverDiscard(true)}
                    onMouseLeave={() => setHoverDiscard(false)}
                    title="Take the top discard"
                  >
                    <CardComponent card={topDiscard} size="lg" />
                  </div>
                ) : (
                  <div className={`w-full h-full rounded-xl border-2 border-dashed flex items-center justify-center ${
                    hidingTopDiscard ? 'border-[#e8c468]/30' : 'border-white/20'
                  }`}>
                    {!hidingTopDiscard && <span className="text-white/30 text-xs">Empty</span>}
                  </div>
                )}
                {takePreview !== null && (
                  <div className="animate-pop absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 rounded-full bg-black/80 border border-[#e8c468]/50 text-xs text-[#ffe27a] font-semibold">
                    Take → up to {takePreview}
                  </div>
                )}
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">Discard</span>
            </div>
          </div>
        </div>

        {/* Human player zone */}
        <section className={`glass w-full flex flex-col items-center gap-3 p-4 sm:p-5 rounded-3xl transition-all duration-300
          ${isHumanTurn ? 'turn-glow' : ''}
          ${human.isEliminated ? 'opacity-50' : ''}
        `}>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span className="text-white font-bold card-serif text-lg">{human.name}</span>
            {human.hasKnocked && (
              <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/60 text-orange-200 text-[10px] font-bold tracking-wider">KNOCKED</span>
            )}
            <LivesDisplay lives={human.lives} />
            {!human.isEliminated && (
              <div className="flex items-center gap-2">
                <span key={humanScore} className={`score-bump text-3xl font-black tabular-nums card-serif ${scoreColor(humanScore)}`}>
                  {humanScore}
                </span>
                {/* Progress toward 31 */}
                <div className="w-20 sm:w-28 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${humanScore === 31 ? 'bg-[#ffe27a]' : humanScore >= 27 ? 'bg-emerald-400' : 'bg-white/50'}`}
                    style={{ width: `${Math.min(100, (humanScore / 31) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {human.isEliminated ? (
            <span className="text-rose-400 font-bold text-lg">ELIMINATED</span>
          ) : (
            <>
              {/* Hover preview */}
              <div className="h-6 flex items-center">
                {discardPreview !== null && hoverCard && (
                  <span className="animate-pop text-xs text-white/80 px-3 py-0.5 rounded-full bg-black/50 border border-white/15">
                    Discard {cardName(hoverCard)} → score <b className={scoreColor(discardPreview)}>{discardPreview}</b>
                  </span>
                )}
              </div>

              <div ref={humanHandRef} className="flex gap-2 sm:gap-3 justify-center min-h-28">
                {human.hand.map((card, i) => {
                  const isDrawnFromDiscard = game.drawnFromDiscard && game.drawnCard?.id === card.id;
                  const canPick = canDiscard && !isDrawnFromDiscard;
                  const showLit = !game.roundOver && human.hand.length >= 3;
                  return (
                    <div key={card.id} className="relative">
                      <CardComponent
                        card={card}
                        size="lg"
                        animateIn
                        dealIndex={i}
                        selectable={canPick}
                        disabled={canDiscard && isDrawnFromDiscard}
                        scoring={showLit && lit.has(card.id) && humanScore >= 20}
                        dimmed={showLit && !lit.has(card.id)}
                        onClick={canPick ? () => handleDiscard(card.id) : undefined}
                        onMouseEnter={() => setHoverId(card.id)}
                        onMouseLeave={() => setHoverId(null)}
                        label={
                          isDrawnFromDiscard && canDiscard ? 'Just drawn from the discard — cannot discard immediately' :
                          canPick ? `Discard ${cardName(card)}` : cardName(card)
                        }
                      />
                      {canDiscard && (
                        <span className="hidden sm:block absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/30">{i + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Turn guide + actions */}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest">
                  {(['draw', 'discard'] as const).map((phase, i) => {
                    const on = isHumanTurn && game.turnPhase === phase;
                    return (
                      <span key={phase} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-white/20">→</span>}
                        <span className={`px-3 py-1 rounded-full border transition-all ${
                          on ? 'bg-[#e8c468] text-[#3b2a05] border-[#fff3c4] font-bold' : 'border-white/15 text-white/35'}`}>
                          {i + 1}. {phase}
                        </span>
                      </span>
                    );
                  })}
                </div>

                {canDraw && game.knockerIdx === null && (
                  confirmKnock ? (
                    <div className="animate-pop flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-orange-500/15 border border-orange-400/60">
                      <span className="text-orange-100 text-xs">Knock at <b>{humanScore}</b>?</span>
                      <button onClick={() => { setConfirmKnock(false); handleKnock(); }} className="px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold transition">Confirm</button>
                      <button onClick={() => setConfirmKnock(false)} className="px-2 py-1 text-white/60 hover:text-white text-xs transition">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmKnock(true)} className="px-5 py-1.5 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 hover:brightness-110 active:scale-95 text-white font-bold text-sm tracking-wide transition shadow-[0_6px_18px_rgba(234,88,12,0.4)]">
                      ✊ Knock
                    </button>
                  )
                )}
              </div>

              <p className="text-white/40 text-xs h-4">
                {canDraw ? 'Draw from the stock or discard pile — or knock.'
                  : canDiscard ? 'Choose a card to discard.'
                  : isHumanTurn || game.roundOver ? '' : `Waiting for ${currentPlayerName}…`}
              </p>
            </>
          )}
        </section>
      </main>

      {/* Flying card overlay — rendered outside the board flow so z-index works */}
      {flyingCard && <FlyingCard info={flyingCard} onComplete={handleFlyComplete} />}

      {/* Round results modal */}
      {showResults && (
        <RoundResultsModal state={game} onNextRound={handleNextRound} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
}
