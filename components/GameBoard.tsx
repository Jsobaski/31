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
        ? <CardComponent card={info.card} size="md" />
        : <CardComponent faceDown  size="md" />}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function LivesDisplay({ lives }: { lives: number }) {
  if (lives <= 0) return <span className="text-purple-400 text-xs font-bold">FREE RIDE</span>;
  return (
    <span className="text-red-400 text-sm">
      {'♥'.repeat(Math.max(0, lives))}{'♡'.repeat(Math.max(0, 3 - lives))}
    </span>
  );
}

function BotPlayerArea({ player, isActive, score, showScore }: {
  player: Player; isActive: boolean; score?: number; showScore?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all
      ${isActive ? 'bg-green-900/60 ring-2 ring-green-400' : 'bg-gray-900/40'}
      ${player.isEliminated ? 'opacity-40' : ''}
    `}>
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">{player.name}</span>
        {player.hasKnocked && <span className="text-yellow-400 text-xs">🤛 Knocked</span>}
        {isActive && <span className="text-green-400 text-xs animate-pulse">●</span>}
      </div>
      <LivesDisplay lives={player.lives} />
      <div className="flex gap-1">
        {player.isEliminated ? (
          <span className="text-red-500 text-sm font-bold">ELIMINATED</span>
        ) : showScore ? (
          <>
            {player.hand.map(c => <CardComponent key={c.id} card={c} size="sm" />)}
            <span className="text-yellow-300 font-bold text-lg ml-1">{score}</span>
          </>
        ) : (
          player.hand.map(c => <CardComponent key={c.id} faceDown size="sm" />)
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

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
        {gameOver ? (
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">{winner?.isBot === false ? '🎉' : '💀'}</div>
            <h2 className="text-3xl font-bold text-yellow-400 mb-1">
              {winner ? `${winner.name} Wins!` : 'Game Over!'}
            </h2>
            <p className="text-gray-400">The game has ended.</p>
          </div>
        ) : (
          <h2 className="text-2xl font-bold text-white mb-4 text-center">
            Round {state.roundNumber} Results
          </h2>
        )}
        {roundResults.blitzPlayerId && (
          <div className="text-center text-yellow-300 font-bold text-lg mb-4">
            ⚡ BLITZ! {players.find(p => p.id === roundResults.blitzPlayerId)?.name} hit 31!
          </div>
        )}
        {roundResults.knockerPenalty && (
          <div className="text-center text-orange-400 text-sm mb-4">
            ⚠️ The knocker had the lowest score — 2 lives lost!
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {players
            .filter(p => !p.isEliminated || roundResults.scores[p.id] !== undefined)
            .map(player => {
              const score    = roundResults.scores[player.id];
              const isLoser  = roundResults.loserIds.includes(player.id);
              const isKnocker = state.knockerIdx !== null && players[state.knockerIdx]?.id === player.id;
              const livesLost = isLoser ? (roundResults.knockerPenalty && isKnocker ? 2 : 1) : 0;
              return (
                <div key={player.id} className={`p-3 rounded-xl border ${isLoser ? 'border-red-500 bg-red-950/50' : 'border-gray-700 bg-gray-800/50'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-semibold">
                      {player.name}
                      {isKnocker && <span className="text-yellow-400 text-xs ml-1">(Knocked)</span>}
                    </span>
                    <span className={`text-xl font-bold ${score === 31 ? 'text-yellow-400' : isLoser ? 'text-red-400' : 'text-green-400'}`}>
                      {score ?? '—'}
                    </span>
                  </div>
                  <div className="flex gap-1 mb-2">
                    {player.hand.map(c => <CardComponent key={c.id} card={c} size="sm" />)}
                  </div>
                  <div className="flex items-center justify-between">
                    <LivesDisplay lives={player.lives} />
                    {livesLost > 0 && <span className="text-red-400 text-xs">-{livesLost} life{livesLost > 1 ? 's' : ''}</span>}
                    {player.isEliminated && <span className="text-red-500 text-xs font-bold">ELIMINATED</span>}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="flex justify-center">
          {gameOver
            ? <button onClick={onPlayAgain} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-colors text-lg">Play Again</button>
            : <button onClick={onNextRound} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors text-lg">Next Round →</button>}
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
    launchFly(drawFromDeck(game), stockRef.current, humanHandRef.current, false);
  };

  const handleDrawDiscard = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw' || isAnimating) return;
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-green-950 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/30">
        <h1 className="text-yellow-400 font-bold text-xl tracking-wider">THIRTY-ONE</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">Round {game.roundNumber}</span>
          {!game.roundOver && (
            <span className="text-gray-300 text-sm">
              {botThinking ? `${currentPlayerName} is thinking…` : `${currentPlayerName}'s turn`}
            </span>
          )}
          <button onClick={onExit} className="px-3 py-1 text-gray-400 hover:text-white text-sm border border-gray-600 hover:border-gray-400 rounded transition-colors">
            Exit
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex flex-col items-center justify-between p-4 gap-4 max-w-4xl mx-auto w-full">

        {/* Bot zones */}
        <div className={`flex gap-4 w-full justify-center ${bots.length === 1 ? 'max-w-xs' : ''}`}>
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

        {/* Centre: piles + message */}
        <div className="flex flex-col items-center gap-4">
          <div className="px-4 py-2 bg-black/50 rounded-lg text-center min-w-64 max-w-sm">
            <p className="text-gray-200 text-sm">{game.message}</p>
          </div>

          <div className="flex items-end gap-8">
            {/* Stock pile */}
            <div ref={stockRef}>
              <FaceDownPile
                count={game.deck.length}
                label="Stock"
                onClick={isHumanTurn && game.turnPhase === 'draw' && !isAnimating ? handleDrawDeck : undefined}
              />
            </div>

            {/* Discard pile — hide the top card while it's flying */}
            <div ref={discardRef} className="flex flex-col items-center gap-1">
              {!hidingTopDiscard && topDiscard ? (
                <div
                  className={`transition-all duration-150 ${
                    isHumanTurn && game.turnPhase === 'draw' && !isAnimating
                      ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl ring-2 ring-transparent hover:ring-yellow-400 rounded-lg'
                      : ''
                  }`}
                  onClick={isHumanTurn && game.turnPhase === 'draw' && !isAnimating ? handleDrawDiscard : undefined}
                  title="Draw from discard pile"
                >
                  <CardComponent card={topDiscard} size="lg" />
                </div>
              ) : (
                <div className={`w-16 h-24 rounded-lg border-2 border-dashed flex items-center justify-center ${
                  hidingTopDiscard ? 'border-yellow-700/40' : 'border-gray-600'
                }`}>
                  {!hidingTopDiscard && <span className="text-gray-500 text-xs">Empty</span>}
                </div>
              )}
              <span className="text-gray-400 text-xs">Discard</span>
            </div>
          </div>

          {isHumanTurn && game.turnPhase === 'draw' && game.knockerIdx === null && !isAnimating && (
            <button onClick={handleKnock} className="px-5 py-2 bg-orange-700 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors shadow-lg text-sm">
              🤛 Knock
            </button>
          )}
        </div>

        {/* Human player zone */}
        <div className={`w-full flex flex-col items-center gap-3 p-4 rounded-2xl transition-all
          ${isHumanTurn ? 'bg-green-900/60 ring-2 ring-green-400' : 'bg-gray-900/40'}
          ${human.isEliminated ? 'opacity-50' : ''}
        `}>
          <div className="flex items-center gap-3">
            <span className="text-white font-bold">{human.name}</span>
            {human.hasKnocked && <span className="text-yellow-400 text-sm">🤛 Knocked</span>}
            <LivesDisplay lives={human.lives} />
            {!human.isEliminated && (() => {
              const s = game.roundOver && game.roundResults
                ? game.roundResults.scores[human.id]
                : calculateScore(human.hand);
              return (
                <span className={`text-xl font-bold tabular-nums ${
                  s === 31 ? 'text-yellow-400' : s >= 27 ? 'text-green-400' : s >= 20 ? 'text-white' : 'text-gray-400'
                }`}>{s}</span>
              );
            })()}
          </div>

          {human.isEliminated ? (
            <span className="text-red-500 font-bold text-lg">ELIMINATED</span>
          ) : (
            <div ref={humanHandRef} className="flex gap-2">
              {human.hand.map(card => {
                const isDrawnFromDiscard = game.drawnFromDiscard && game.drawnCard?.id === card.id;
                const canDiscard = isHumanTurn && game.turnPhase === 'discard' && !isDrawnFromDiscard && !isAnimating;
                return (
                  <CardComponent
                    key={card.id}
                    card={card}
                    size="lg"
                    selectable={canDiscard}
                    disabled={isHumanTurn && game.turnPhase === 'discard' && isDrawnFromDiscard}
                    onClick={canDiscard ? () => handleDiscard(card.id) : undefined}
                    label={
                      isDrawnFromDiscard ? 'Just drawn — cannot discard immediately' :
                      canDiscard ? `Discard ${cardName(card)}` : cardName(card)
                    }
                  />
                );
              })}
            </div>
          )}

          {isHumanTurn && game.turnPhase === 'discard' && !isAnimating && (
            <p className="text-green-300 text-xs animate-pulse">Click a card to discard it</p>
          )}
          {isHumanTurn && game.turnPhase === 'draw' && !isAnimating && (
            <p className="text-blue-300 text-xs animate-pulse">Draw from stock, discard pile, or knock</p>
          )}
        </div>
      </div>

      {/* Flying card overlay — rendered outside the board flow so z-index works */}
      {flyingCard && <FlyingCard info={flyingCard} onComplete={handleFlyComplete} />}

      {/* Round results modal */}
      {showResults && (
        <RoundResultsModal state={game} onNextRound={handleNextRound} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
}
