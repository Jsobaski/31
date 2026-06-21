'use client';

import { useEffect, useState } from 'react';
import { GameState, Player } from '@/lib/types';
import {
  initGame,
  drawFromDeck,
  drawFromDiscard,
  knock,
  discardCard,
  dealRound,
  executeBotDraw,
  executeBotDiscard,
  calculateScore,
  cardName,
} from '@/lib/gameEngine';
import CardComponent, { FaceDownPile } from './CardComponent';

interface Props {
  playerName: string;
  numBots: number;
  onExit: () => void;
}

function LivesDisplay({ lives }: { lives: number }) {
  if (lives <= 0) {
    return <span className="text-purple-400 text-xs font-bold">FREE RIDE</span>;
  }
  return (
    <span className="text-red-400 text-sm">
      {'♥'.repeat(Math.max(0, lives))}
      {'♡'.repeat(Math.max(0, 3 - lives))}
    </span>
  );
}

function BotPlayerArea({ player, isActive, score, showScore, animSource }: {
  player: Player;
  isActive: boolean;
  score?: number;
  showScore?: boolean;
  animSource?: 'deck' | 'discard' | null;
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

      {/* Source badge — appears briefly when bot draws */}
      <div className="h-5 flex items-center">
        {animSource && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            animSource === 'deck'
              ? 'bg-blue-900/70 text-blue-300'
              : 'bg-yellow-900/70 text-yellow-300'
          }`}>
            {animSource === 'deck' ? '📦 Stock' : '♻️ Discard'}
          </span>
        )}
      </div>

      <div className="flex gap-1">
        {player.isEliminated ? (
          <span className="text-red-500 text-sm font-bold">ELIMINATED</span>
        ) : showScore ? (
          <>
            {player.hand.map(card => (
              <CardComponent key={card.id} card={card} size="sm" />
            ))}
            <div className="flex items-center ml-1">
              <span className="text-yellow-300 font-bold text-lg">{score}</span>
            </div>
          </>
        ) : (
          <>
            {player.hand.map((card, idx) => {
              const isNewCard = animSource && idx === player.hand.length - 1;
              return (
                <div
                  key={card.id}
                  style={isNewCard ? {
                    animation: `${animSource === 'deck' ? 'bot-draw-from-deck' : 'bot-draw-from-discard'} 0.45s ease-out forwards`,
                  } : undefined}
                >
                  <CardComponent faceDown size="sm" />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function RoundResultsModal({ state, onNextRound, onPlayAgain }: {
  state: GameState;
  onNextRound: () => void;
  onPlayAgain: () => void;
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

        {/* Blitz indicator */}
        {roundResults.blitzPlayerId && (
          <div className="text-center text-yellow-300 font-bold text-lg mb-4">
            ⚡ BLITZ! {players.find(p => p.id === roundResults.blitzPlayerId)?.name} hit 31!
          </div>
        )}

        {/* Knocker penalty */}
        {roundResults.knockerPenalty && (
          <div className="text-center text-orange-400 text-sm mb-4">
            ⚠️ The knocker had the lowest score — 2 lives lost!
          </div>
        )}

        {/* Player scores */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {players.filter(p => !p.isEliminated || roundResults.scores[p.id] !== undefined).map(player => {
            const score = roundResults.scores[player.id];
            const isLoser = roundResults.loserIds.includes(player.id);
            const isKnocker = state.knockerIdx !== null && players[state.knockerIdx]?.id === player.id;
            const livesLost = isLoser ? (roundResults.knockerPenalty && isKnocker ? 2 : 1) : 0;

            return (
              <div key={player.id} className={`p-3 rounded-xl border ${
                isLoser ? 'border-red-500 bg-red-950/50' : 'border-gray-700 bg-gray-800/50'
              }`}>
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
                  {player.hand.map(card => (
                    <CardComponent key={card.id} card={card} size="sm" />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <LivesDisplay lives={player.lives} />
                  {livesLost > 0 && (
                    <span className="text-red-400 text-xs">-{livesLost} life{livesLost > 1 ? 's' : ''}</span>
                  )}
                  {player.isEliminated && (
                    <span className="text-red-500 text-xs font-bold">ELIMINATED</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          {gameOver ? (
            <button
              onClick={onPlayAgain}
              className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-colors text-lg"
            >
              Play Again
            </button>
          ) : (
            <button
              onClick={onNextRound}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors text-lg"
            >
              Next Round →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GameBoard({ playerName, numBots, onExit }: Props) {
  const [game, setGame] = useState<GameState>(() => initGame(playerName, numBots));
  const [showResults, setShowResults] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [drawAnim, setDrawAnim] = useState<{ cardId: string; source: 'deck' | 'discard' } | null>(null);
  const [botDrawAnim, setBotDrawAnim] = useState<{ playerIdx: number; source: 'deck' | 'discard' } | null>(null);

  const human = game.players[0];
  const isHumanTurn = game.currentTurnIdx === 0 && !game.roundOver && !game.gameOver;
  const topDiscard = game.discardPile[game.discardPile.length - 1];

  // Bot draw phase automation
  useEffect(() => {
    if (game.roundOver || game.gameOver || game.turnPhase !== 'draw') return;
    const current = game.players[game.currentTurnIdx];
    if (!current?.isBot) return;

    setBotThinking(true);
    const t = setTimeout(() => {
      setGame(prev => {
        const cp = prev.players[prev.currentTurnIdx];
        if (!cp?.isBot || prev.roundOver || prev.gameOver || prev.turnPhase !== 'draw') return prev;
        return executeBotDraw(prev);
      });
      setBotThinking(false);
    }, 800);
    return () => { clearTimeout(t); setBotThinking(false); };
  }, [game.currentTurnIdx, game.roundOver, game.gameOver]);

  // When bot transitions to discard phase, record what it drew from for the animation
  useEffect(() => {
    if (game.turnPhase !== 'discard' || game.roundOver) return;
    const current = game.players[game.currentTurnIdx];
    if (!current?.isBot || !game.drawnCard) return;
    setBotDrawAnim({
      playerIdx: game.currentTurnIdx,
      source: game.drawnFromDiscard ? 'discard' : 'deck',
    });
  }, [game.currentTurnIdx, game.turnPhase]);

  // Bot discard phase automation (fires after draw phase completes)
  useEffect(() => {
    if (game.roundOver || game.gameOver || game.turnPhase !== 'discard') return;
    const current = game.players[game.currentTurnIdx];
    if (!current?.isBot) return;

    const t = setTimeout(() => {
      setGame(prev => {
        const cp = prev.players[prev.currentTurnIdx];
        if (!cp?.isBot || prev.roundOver || prev.gameOver || prev.turnPhase !== 'discard') return prev;
        return executeBotDiscard(prev);
      });
    }, 800);
    return () => clearTimeout(t);
  }, [game.currentTurnIdx, game.turnPhase, game.roundOver, game.gameOver]);

  // Clear bot draw animation after it finishes playing
  useEffect(() => {
    if (!botDrawAnim) return;
    const t = setTimeout(() => setBotDrawAnim(null), 600);
    return () => clearTimeout(t);
  }, [botDrawAnim]);

  // Clear draw animation after it plays
  useEffect(() => {
    if (!drawAnim) return;
    const t = setTimeout(() => setDrawAnim(null), 500);
    return () => clearTimeout(t);
  }, [drawAnim]);

  // Show round results modal
  useEffect(() => {
    if (game.roundOver) {
      const t = setTimeout(() => setShowResults(true), 600);
      return () => clearTimeout(t);
    }
  }, [game.roundOver]);

  const handleDrawDeck = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw') return;
    const next = drawFromDeck(game);
    if (next.drawnCard) setDrawAnim({ cardId: next.drawnCard.id, source: 'deck' });
    setGame(next);
  };

  const handleDrawDiscard = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw') return;
    const next = drawFromDiscard(game);
    if (next.drawnCard) setDrawAnim({ cardId: next.drawnCard.id, source: 'discard' });
    setGame(next);
  };

  const handleKnock = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw' || game.knockerIdx !== null) return;
    setGame(prev => knock(prev));
  };

  const handleDiscard = (cardId: string) => {
    if (!isHumanTurn || game.turnPhase !== 'discard') return;
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

  const bots = game.players.slice(1);
  const currentPlayerName = game.players[game.currentTurnIdx]?.name ?? '';

  return (
    <div className="min-h-screen bg-green-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/30">
        <h1 className="text-yellow-400 font-bold text-xl tracking-wider">THIRTY-ONE</h1>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">Round {game.roundNumber}</span>
          {!game.roundOver && (
            <span className="text-gray-300 text-sm">
              {botThinking ? `${currentPlayerName} is thinking…` : currentPlayerName + "'s turn"}
            </span>
          )}
          <button
            onClick={onExit}
            className="px-3 py-1 text-gray-400 hover:text-white text-sm border border-gray-600 hover:border-gray-400 rounded transition-colors"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Main Board */}
      <div className="flex-1 flex flex-col items-center justify-between p-4 gap-4 max-w-4xl mx-auto w-full">

        {/* Bot Zones */}
        <div className={`flex gap-4 w-full justify-center ${bots.length === 1 ? 'max-w-xs' : ''}`}>
          {bots.map((bot, i) => (
            <BotPlayerArea
              key={bot.id}
              player={bot}
              isActive={game.currentTurnIdx === i + 1 && !game.roundOver}
              showScore={game.roundOver}
              score={game.roundResults?.scores[bot.id]}
              animSource={botDrawAnim?.playerIdx === i + 1 ? botDrawAnim.source : null}
            />
          ))}
        </div>

        {/* Center: Deck, Discard, Message */}
        <div className="flex flex-col items-center gap-4">
          {/* Message banner */}
          <div className="px-4 py-2 bg-black/50 rounded-lg text-center min-w-64 max-w-sm">
            <p className="text-gray-200 text-sm">{game.message}</p>
          </div>

          {/* Piles */}
          <div className="flex items-end gap-8">
            {/* Stock Deck */}
            <FaceDownPile
              count={game.deck.length}
              label="Stock"
              onClick={isHumanTurn && game.turnPhase === 'draw' ? handleDrawDeck : undefined}
            />

            {/* Discard Pile */}
            <div className="flex flex-col items-center gap-1">
              {topDiscard ? (
                <div
                  className={`transition-all duration-150 ${
                    isHumanTurn && game.turnPhase === 'draw'
                      ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl ring-2 ring-transparent hover:ring-yellow-400 rounded-lg'
                      : ''
                  }`}
                  onClick={isHumanTurn && game.turnPhase === 'draw' ? handleDrawDiscard : undefined}
                  title="Draw from discard"
                >
                  <CardComponent card={topDiscard} size="lg" />
                </div>
              ) : (
                <div className="w-16 h-24 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center">
                  <span className="text-gray-600 text-xs text-center">Empty</span>
                </div>
              )}
              <span className="text-gray-400 text-xs">Discard</span>
            </div>
          </div>

          {/* Knock button */}
          {isHumanTurn && game.turnPhase === 'draw' && game.knockerIdx === null && (
            <button
              onClick={handleKnock}
              className="px-5 py-2 bg-orange-700 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors shadow-lg text-sm"
            >
              🤛 Knock
            </button>
          )}
        </div>

        {/* Human Player Zone */}
        <div className={`w-full flex flex-col items-center gap-3 p-4 rounded-2xl transition-all
          ${isHumanTurn ? 'bg-green-900/60 ring-2 ring-green-400' : 'bg-gray-900/40'}
          ${human.isEliminated ? 'opacity-50' : ''}
        `}>
          <div className="flex items-center gap-3">
            <span className="text-white font-bold">{human.name}</span>
            {human.hasKnocked && <span className="text-yellow-400 text-sm">🤛 Knocked</span>}
            <LivesDisplay lives={human.lives} />
            {!human.isEliminated && (() => {
              const liveScore = game.roundOver && game.roundResults
                ? game.roundResults.scores[human.id]
                : calculateScore(human.hand);
              return (
                <span className={`text-xl font-bold tabular-nums transition-colors ${
                  liveScore === 31 ? 'text-yellow-400' :
                  liveScore >= 27 ? 'text-green-400' :
                  liveScore >= 20 ? 'text-white' : 'text-gray-400'
                }`}>
                  {liveScore}
                </span>
              );
            })()}
          </div>

          {/* Hand */}
          {human.isEliminated ? (
            <span className="text-red-500 font-bold text-lg">ELIMINATED</span>
          ) : (
            <div className="flex gap-2">
              {human.hand.map(card => {
                const isDrawnFromDiscard = game.drawnFromDiscard && game.drawnCard?.id === card.id;
                const canDiscard = isHumanTurn && game.turnPhase === 'discard' && !isDrawnFromDiscard;
                const isAnimCard = drawAnim?.cardId === card.id;
                return (
                  <div
                    key={card.id}
                    style={isAnimCard ? {
                      animation: `${drawAnim!.source === 'deck' ? 'draw-from-deck' : 'draw-from-discard'} 0.45s ease-out forwards`,
                    } : undefined}
                  >
                    <CardComponent
                      card={card}
                      size="lg"
                      selectable={canDiscard}
                      disabled={isHumanTurn && game.turnPhase === 'discard' && isDrawnFromDiscard}
                      onClick={canDiscard ? () => handleDiscard(card.id) : undefined}
                      label={
                        isDrawnFromDiscard
                          ? 'Just drawn — cannot discard immediately'
                          : canDiscard
                          ? `Discard ${cardName(card)}`
                          : cardName(card)
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}

          {isHumanTurn && game.turnPhase === 'discard' && (
            <p className="text-green-300 text-xs animate-pulse">Click a card to discard it</p>
          )}
          {isHumanTurn && game.turnPhase === 'draw' && (
            <p className="text-blue-300 text-xs animate-pulse">Draw from stock, discard pile, or knock</p>
          )}
        </div>
      </div>

      {/* Round Results Modal */}
      {showResults && (
        <RoundResultsModal
          state={game}
          onNextRound={handleNextRound}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
