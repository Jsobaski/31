'use client';

import { useEffect, useState } from 'react';
import type { BotMove, GameState } from '@/lib/types';
import type { ClientAction } from '@/lib/net';
import { calculateScore, cardName } from '@/lib/gameEngine';
import CardComponent, { FaceDownPile } from './CardComponent';
import {
  BotPlayerArea, LivesDisplay, RoundResultsModal, bestScoreWith, scoreColor, scoringIds,
} from './boardParts';

interface Props {
  game: GameState;          // already redacted by the host: only our own hand is real
  seat: number;
  moves: Record<string, BotMove>;
  send: (a: ClientAction) => void;
  onExit: () => void;
}

// A friend's phone view of the table: tap to draw, tap a card to pick it, confirm to discard.
export default function RemoteBoard({ game, seat, moves, send, onExit }: Props) {
  const me = game.players[seat];
  const others = game.players.filter((_, i) => i !== seat);
  const isMyTurn = game.currentTurnIdx === seat && !game.roundOver && !game.gameOver;
  const canDraw = isMyTurn && game.turnPhase === 'draw';
  const canDiscard = isMyTurn && game.turnPhase === 'discard';
  const topDiscard = game.discardPile[game.discardPile.length - 1];
  const current = game.players[game.currentTurnIdx];

  const [selected, setSelected] = useState<string | null>(null);
  const [confirmKnock, setConfirmKnock] = useState(false);
  const [shownKey, setShownKey] = useState('');

  // Show the results popup shortly after the round ends (same beat as the host)
  const resultsKey = `${game.roundNumber}-${game.gameOver}`;
  useEffect(() => {
    if (!game.roundOver) return;
    const t = setTimeout(() => setShownKey(resultsKey), 600);
    return () => clearTimeout(t);
  }, [game.roundOver, resultsKey]);
  const showResults = game.roundOver && shownKey === resultsKey;

  const score = me.isEliminated ? 0 : calculateScore(me.hand);
  const lit = scoringIds(me.hand);
  const selCard = canDiscard ? me.hand.find(c => c.id === selected) : undefined;
  const selPreview = selCard ? calculateScore(me.hand.filter(c => c.id !== selCard.id)) : null;
  const takePreview = canDraw && topDiscard ? bestScoreWith(me.hand, topDiscard) : null;

  const prompt = canDiscard && game.drawnCard
    ? `You ${game.drawnFromDiscard ? 'took' : 'drew'} ${cardName(game.drawnCard)}${game.drawnFromDiscard ? ' from the discard' : ''}. Pick a card to discard.`
    : canDraw ? (game.knockerIdx !== null ? 'Last turn! Draw a card.' : 'Your turn — draw a card, or knock.')
    : game.roundOver || game.gameOver ? game.message
    : `Waiting for ${current?.name ?? 'the next player'}…`;

  const draw = (from: 'stock' | 'discard') => {
    if (!canDraw) return;
    setConfirmKnock(false);
    send({ t: 'draw', from });
  };
  const doDiscard = () => {
    if (!selCard) return;
    setSelected(null);
    send({ t: 'discard', cardId: selCard.id });
  };

  return (
    <div className="felt min-h-dvh flex flex-col overflow-hidden">
      <header className="relative z-[1] flex items-center justify-between px-4 py-2 bg-black/35 backdrop-blur border-b border-[#e8c468]/20">
        <h1 className="gold-text font-black text-2xl tracking-[0.25em] card-serif">31</h1>
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-xs uppercase tracking-widest">Round {game.roundNumber}</span>
          <button onClick={onExit} className="px-3 py-1 text-white/60 hover:text-white text-xs uppercase tracking-widest border border-white/20 hover:border-white/50 rounded-full transition-colors">
            Leave
          </button>
        </div>
      </header>

      <main className="relative z-[1] flex-1 flex flex-col items-center justify-between p-3 gap-3 max-w-xl mx-auto w-full">
        {/* Opponents (the host and everyone else) */}
        <div className="grid gap-2 w-full" style={{ gridTemplateColumns: `repeat(${others.length}, minmax(0, 1fr))` }}>
          {others.map(p => (
            <div key={p.id} className="min-w-0">
              <BotPlayerArea
                player={p}
                isActive={current?.id === p.id && !game.roundOver}
                showScore={game.roundOver}
                score={game.roundResults?.scores[p.id]}
                lastMove={moves[p.id]}
              />
            </div>
          ))}
        </div>

        {/* Status + piles */}
        <div className="flex flex-col items-center gap-3">
          <div key={prompt} className="animate-pop glass px-5 py-2 rounded-full text-center max-w-sm" aria-live="polite">
            <p className="text-white/90 text-sm" data-testid="status">{prompt}</p>
          </div>

          <div className="flex items-end gap-8">
            <FaceDownPile count={game.deck.length} label="Stock" highlight={canDraw} onClick={canDraw ? () => draw('stock') : undefined} />
            <div className="relative flex flex-col items-center gap-2">
              <div className="w-[4.5rem] h-[6.5rem] sm:w-20 sm:h-28 relative">
                {topDiscard ? (
                  <div
                    className={`rounded-xl transition-all duration-200 ${canDraw ? 'cursor-pointer ring-2 ring-[#e8c468] shadow-[0_0_22px_rgba(232,196,104,0.5)]' : ''}`}
                    onClick={canDraw ? () => draw('discard') : undefined}
                    title="Take the top discard"
                  >
                    <CardComponent card={topDiscard} size="lg" />
                  </div>
                ) : (
                  <div className="w-full h-full rounded-xl border-2 border-dashed border-white/20" />
                )}
                {takePreview !== null && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-full bg-black/80 border border-[#e8c468]/50 text-[11px] text-[#ffe27a] font-semibold">
                    Take → up to {takePreview}
                  </div>
                )}
              </div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">Discard</span>
            </div>
          </div>
        </div>

        {/* My hand */}
        <section className={`glass w-full flex flex-col items-center gap-2 p-3 rounded-3xl transition-all duration-300 ${isMyTurn ? 'turn-glow' : ''} ${me.isEliminated ? 'opacity-50' : ''}`}>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span className="text-white font-bold card-serif text-lg">{me.name}</span>
            {me.hasKnocked && (
              <span className="px-2 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/60 text-orange-200 text-[10px] font-bold tracking-wider">KNOCKED</span>
            )}
            <LivesDisplay lives={me.lives} />
            {!me.isEliminated && (
              <div className="flex items-center gap-2">
                <span key={score} className={`score-bump text-3xl font-black tabular-nums card-serif ${scoreColor(score)}`}>{score}</span>
                <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden>
                  <div className={`h-full rounded-full transition-all duration-500 ${score === 31 ? 'bg-[#ffe27a]' : score >= 27 ? 'bg-emerald-400' : 'bg-white/50'}`} style={{ width: `${Math.min(100, (score / 31) * 100)}%` }} />
                </div>
              </div>
            )}
          </div>

          {me.isEliminated ? (
            <span className="text-rose-400 font-bold text-lg py-6">ELIMINATED — watching the rest of the game</span>
          ) : (
            <>
              <div className="h-5 flex items-center">
                {selCard && selPreview !== null && (
                  <span className="animate-pop text-xs text-white/80 px-3 py-0.5 rounded-full bg-black/50 border border-white/15">
                    Discard {cardName(selCard)} → score <b className={scoreColor(selPreview)}>{selPreview}</b>
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 sm:gap-3 justify-center min-h-[6.5rem] sm:min-h-28" data-testid="my-hand">
                {me.hand.map((card, i) => {
                  const blocked = canDiscard && game.drawnFromDiscard && game.drawnCard?.id === card.id;
                  return (
                    <div key={card.id} data-card-id={card.id} className={`transition-transform duration-200 ${selected === card.id && canDiscard ? '-translate-y-3' : ''}`}>
                      <CardComponent
                        card={card}
                        size="lg"
                        animateIn
                        dealIndex={i}
                        selectable={canDiscard && !blocked}
                        selected={selected === card.id && canDiscard}
                        disabled={blocked}
                        scoring={!game.roundOver && lit.has(card.id) && score >= 20}
                        dimmed={!game.roundOver && !lit.has(card.id)}
                        onClick={canDiscard && !blocked ? () => setSelected(card.id) : undefined}
                        label={blocked ? 'Just drawn from the discard — cannot discard immediately' : cardName(card)}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 min-h-10">
                {canDiscard && (
                  <button
                    onClick={doDiscard}
                    disabled={!selCard}
                    className="px-6 py-2 rounded-full font-bold text-sm text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {selCard ? `Discard ${cardName(selCard)}` : 'Tap a card to discard'}
                  </button>
                )}
                {canDraw && game.knockerIdx === null && (
                  confirmKnock ? (
                    <div className="animate-pop flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-orange-500/15 border border-orange-400/60">
                      <span className="text-orange-100 text-xs">Knock at <b>{score}</b>?</span>
                      <button onClick={() => { setConfirmKnock(false); send({ t: 'knock' }); }} className="px-3 py-1 rounded-full bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold transition">Confirm</button>
                      <button onClick={() => setConfirmKnock(false)} className="px-2 py-1 text-white/60 hover:text-white text-xs transition">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmKnock(true)} className="px-5 py-1.5 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 hover:brightness-110 active:scale-95 text-white font-bold text-sm tracking-wide transition shadow-[0_6px_18px_rgba(234,88,12,0.4)]">
                      ✊ Knock
                    </button>
                  )
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {showResults && <RoundResultsModal state={game} viewerId={me.id} canAdvance={false} />}
    </div>
  );
}
