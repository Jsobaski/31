'use client';

import { useEffect, useRef } from 'react';
import { BotMove, Card, GameState, Player } from '@/lib/types';
import { calculateScore } from '@/lib/gameEngine';
import CardComponent from './CardComponent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Which cards contribute to the hand's score (for highlighting).
export function scoringIds(hand: Card[]): Set<string> {
  if (hand.length === 3 && hand.every(c => c.value === hand[0].value)) {
    return new Set(hand.map(c => c.id));
  }
  const totals: Record<string, number> = {};
  for (const c of hand) totals[c.suit] = (totals[c.suit] ?? 0) + c.points;
  const best = Object.entries(totals).sort((x, y) => y[1] - x[1])[0]?.[0];
  return new Set(hand.filter(c => c.suit === best).map(c => c.id));
}

// Best score reachable by taking `card` and discarding any other card.
export function bestScoreWith(hand: Card[], card: Card): number {
  return Math.max(...hand.map(r => calculateScore([...hand.filter(c => c.id !== r.id), card])));
}

export function scoreColor(s: number) {
  return s === 31 ? 'text-[#ffe27a]' : s >= 27 ? 'text-emerald-300' : s >= 20 ? 'text-white' : 'text-white/60';
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

export function LivesDisplay({ lives }: { lives: number }) {
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

export function BotPlayerArea({ player, isActive, score, showScore, lastMove, offline }: {
  player: Player; isActive: boolean; score?: number; showScore?: boolean; lastMove?: BotMove; offline?: boolean;
}) {
  return (
    <div className={`glass flex flex-col items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 rounded-2xl transition-all duration-300
      ${isActive ? 'turn-glow' : ''}
      ${player.isEliminated ? 'opacity-40 grayscale' : ''}
    `}>
      <div className="flex items-center gap-2">
        <span className={`hidden sm:flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold card-serif border
          ${isActive ? 'bg-[#e8c468] text-[#3b2a05] border-[#fff3c4]' : 'bg-white/10 text-white/80 border-white/20'}`}>
          {player.name.slice(-1)}
        </span>
        <span className="text-white font-semibold text-sm">{player.name}</span>
        {player.hasKnocked && (
          <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/60 text-orange-200 text-[10px] font-bold tracking-wider">
            KNOCKED
          </span>
        )}
        {offline && (
          <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-400/60 text-red-200 text-[10px] font-bold tracking-wider">
            OFFLINE
          </span>
        )}
      </div>
      <LivesDisplay lives={player.lives} />
      {/* Persistent record of what this bot just did */}
      <div className="h-[3.25rem] sm:h-9 w-full flex flex-col items-center justify-center gap-0.5 text-[10px] sm:text-[11px] leading-tight text-center" aria-live="polite">
        {lastMove?.draw && (
          <span key={lastMove.draw} className={`animate-pop px-2 py-0.5 rounded-xl sm:rounded-full border font-semibold ${
            lastMove.fromStock
              ? 'bg-sky-500/20 border-sky-400/50 text-sky-100'
              : 'bg-amber-500/20 border-amber-400/50 text-amber-100'}`}>
            {lastMove.fromStock ? '🂠 ' : ''}{lastMove.draw}
          </span>
        )}
        {lastMove?.discard && <span className="animate-pop text-white/55">{lastMove.discard}</span>}
      </div>
      <div className="flex items-center justify-center gap-1 min-h-14 max-w-full">
        {player.isEliminated ? (
          <span className="text-rose-400 text-xs font-bold tracking-widest">ELIMINATED</span>
        ) : showScore ? (
          <>
            {player.hand.map(c => <CardComponent key={c.id} card={c} size="sm" />)}
            <span className="text-[#ffe27a] font-bold text-xl ml-1 tabular-nums">{score}</span>
          </>
        ) : (
          <div className="flex -space-x-4 sm:-space-x-3">
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

export function RoundResultsModal({ state, viewerId, canAdvance = true, onNextRound, onPlayAgain }: {
  state: GameState; viewerId: string; canAdvance?: boolean; onNextRound?: () => void; onPlayAgain?: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  // Focus for keyboard users without scrolling the panel past its title
  useEffect(() => { btnRef.current?.focus({ preventScroll: true }); }, []);
  const { roundResults, players, gameOver, winnerId } = state;
  if (!roundResults) return null;
  const winner = winnerId ? players.find(p => p.id === winnerId) : null;
  const humanWon = winner?.id === viewerId;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="animate-pop glass bg-[#0c1c14]/90 rounded-3xl p-4 sm:p-8 max-w-2xl w-full max-h-[94dvh] overflow-y-auto">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
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
          {!canAdvance ? (
            <p className="text-white/50 text-sm py-3">Waiting for the host…</p>
          ) : gameOver
            ? <button ref={btnRef} onClick={onPlayAgain} className="px-10 py-3 rounded-full font-bold text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-95 transition shadow-[0_8px_24px_rgba(232,196,104,0.35)]">Play Again</button>
            : <button ref={btnRef} onClick={onNextRound} className="px-10 py-3 rounded-full font-bold text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-95 transition shadow-[0_8px_24px_rgba(232,196,104,0.35)]">Next Round →</button>}
        </div>
      </div>
    </div>
  );
}

