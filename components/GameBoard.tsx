'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BotMove, Card, GameState, Seat } from '@/lib/types';
import type { ClientAction, HostNet } from '@/lib/net';
import {
  initGame, initGameFromSeats, takeOverWithBot, drawFromDeck, drawFromDiscard, knock, discardCard, dealRound,
  executeBotDraw, executeBotDiscard, calculateScore, cardName,
} from '@/lib/gameEngine';
import CardComponent, { FaceDownPile } from './CardComponent';
import { BotPlayerArea, LivesDisplay, RoundResultsModal, bestScoreWith, scoreColor, scoringIds } from './boardParts';

interface Props {
  playerName: string;
  numBots: number;
  onExit: () => void;
  /** Multiplayer: explicit seats (seat 0 is the host, who plays on this screen). */
  seats?: Seat[];
  /** Multiplayer: bridge that broadcasts state to friends and delivers their moves. */
  net?: HostNet;
  /** Multiplayer: ids of friends whose connection dropped. */
  offlineIds?: string[];
}

// ─── Flying Card Overlay ──────────────────────────────────────────────────────

interface FlyInfo {
  card: Card; faceUp: boolean; fromRect: DOMRect; toRect: DOMRect;
  kind: 'draw' | 'discard';
  /** Hand card to hide while its flying copy is in the air. */
  hideId?: string;
}

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
          ? `translate(calc(${dx}px - 50%), calc(${dy}px - 50%)) rotate(${info.kind === 'discard' ? 7 : -5}deg)`
          : 'translate(-50%, -50%)',
        transition: moving ? 'transform 0.5s cubic-bezier(0.22, 0.9, 0.3, 1)' : 'none',
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

// ─── Main Board ───────────────────────────────────────────────────────────────

export default function GameBoard({ playerName, numBots, onExit, seats, net, offlineIds = [] }: Props) {
  const [game, setGame]             = useState<GameState>(() => seats ? initGameFromSeats(seats) : initGame(playerName, numBots));
  const [showResults, setShowResults] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [flyingCard, setFlyingCard]   = useState<FlyInfo | null>(null);
  const [hoverId, setHoverId]         = useState<string | null>(null);
  const [hoverDiscard, setHoverDiscard] = useState(false);
  const [confirmKnock, setConfirmKnock] = useState(false);
  const [lastMoves, setLastMoves]     = useState<Record<string, BotMove>>({});

  // Stable ref mirrors — read inside setTimeout/callbacks without stale-closure issues
  const gameRef    = useRef(game);
  const pendingRef = useRef<GameState | null>(null);
  useEffect(() => { gameRef.current = game; }, [game]);

  // DOM position anchors
  const stockRef     = useRef<HTMLDivElement>(null);
  const discardRef   = useRef<HTMLDivElement>(null);
  const humanHandRef = useRef<HTMLDivElement>(null);
  const emptySlotRef = useRef<HTMLDivElement>(null);
  const prevCardLeft = useRef<Map<string, number>>(new Map());
  const botAreaRefs  = useRef<(HTMLDivElement | null)[]>([]);

  const human        = game.players[0];
  const isHumanTurn  = game.currentTurnIdx === 0 && !game.roundOver && !game.gameOver;
  const topDiscard   = game.discardPile[game.discardPile.length - 1];
  const isAnimating  = flyingCard !== null;

  // Cards glide to their new slot when the hand changes (FLIP).
  useLayoutEffect(() => {
    const container = humanHandRef.current;
    if (!container) return;
    const next = new Map<string, number>();
    container.querySelectorAll<HTMLElement>('[data-card-id]').forEach(el => {
      const left = el.getBoundingClientRect().left;
      const id = el.dataset.cardId as string;
      next.set(id, left);
      const prev = prevCardLeft.current.get(id);
      if (prev !== undefined && Math.abs(prev - left) > 1) {
        el.style.transition = 'none';
        el.style.transform = `translateX(${prev - left}px)`;
        void el.offsetWidth;
        el.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
      }
    });
    prevCardLeft.current = next;
  });

  // ── Animation helpers ──────────────────────────────────────────────────────

  // If nextState puts a bot in the discard phase, schedule the discard after `ms` ms,
  // flying the discarded card from the bot to the discard pile.
  function scheduleBotDiscard(nextState: GameState, ms = 600) {
    const cp = nextState.players[nextState.currentTurnIdx];
    if (cp?.isBot && nextState.turnPhase === 'discard' && !nextState.roundOver && !nextState.gameOver) {
      setTimeout(() => {
        const g = gameRef.current;
        const p = g.players[g.currentTurnIdx];
        if (!p?.isBot || g.turnPhase !== 'discard' || g.roundOver) return;
        const after = executeBotDiscard(g);
        const card = after.discardPile[after.discardPile.length - 1];
        const botEl = botAreaRefs.current[g.currentTurnIdx - 1];
        if (!card || after.discardPile.length <= g.discardPile.length) { setGame(after); return; }
        setLastMoves(m => ({ ...m, [p.id]: { ...m[p.id], discard: `Discarded ${cardName(card)}` } }));
        launchFlyCard(after, card, botEl?.getBoundingClientRect(), discardRef.current?.getBoundingClientRect(), true, 'discard');
      }, ms);
    }
  }

  // Fly `card` between two rects, then apply `nextState`.
  function launchFlyCard(
    nextState: GameState, card: Card, fromRect: DOMRect | undefined, toRect: DOMRect | undefined,
    faceUp: boolean, kind: 'draw' | 'discard', hideId?: string
  ) {
    if (!fromRect || !toRect) {
      setGame(nextState);
      scheduleBotDiscard(nextState);
      return;
    }
    pendingRef.current = nextState;
    setFlyingCard({ card, faceUp, fromRect, toRect, kind, hideId });
  }

  // Draw flight: the drawn card travels from a pile to `toEl`.
  function launchFly(
    nextState: GameState,
    fromEl: HTMLElement | null | undefined,
    toEl:   HTMLElement | null | undefined,
    faceUp: boolean
  ) {
    if (!nextState.drawnCard) { setGame(nextState); scheduleBotDiscard(nextState); return; }
    launchFlyCard(nextState, nextState.drawnCard, fromEl?.getBoundingClientRect(), toEl?.getBoundingClientRect(), faceUp, 'draw');
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
        setLastMoves(m => ({ ...m, [cp.id]: { draw: '✊ Knocked!', discard: undefined } }));
        setGame(afterDraw);
        return;
      }
      setLastMoves(m => ({
        ...m,
        [cp.id]: afterDraw.drawnFromDiscard
          ? { draw: `Took ${cardName(afterDraw.drawnCard!)} from discard` }
          : { draw: 'Drew from stock', fromStock: true },
      }));
      const fromEl = afterDraw.drawnFromDiscard ? discardRef.current : stockRef.current;
      const toEl   = botAreaRefs.current[g.currentTurnIdx - 1]; // bots start at player index 1
      launchFly(afterDraw, fromEl, toEl, afterDraw.drawnFromDiscard);
    }, 800);

    return () => { clearTimeout(t); setBotThinking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.currentTurnIdx, game.turnPhase, game.roundOver, game.gameOver, game.players[game.currentTurnIdx]?.isBot]);

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
    setLastMoves(m => ({ ...m, [human.id]: { draw: 'Drew from stock', fromStock: true } }));
    launchFly(drawFromDeck(game), stockRef.current, emptySlotRef.current ?? humanHandRef.current, false);
  };

  const handleDrawDiscard = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw' || isAnimating) return;
    setConfirmKnock(false);
    if (topDiscard) setLastMoves(m => ({ ...m, [human.id]: { draw: `Took ${cardName(topDiscard)} from discard` } }));
    launchFly(drawFromDiscard(game), discardRef.current, emptySlotRef.current ?? humanHandRef.current, true);
  };

  const handleKnock = () => {
    if (!isHumanTurn || game.turnPhase !== 'draw' || game.knockerIdx !== null || isAnimating) return;
    setLastMoves(m => ({ ...m, [human.id]: { draw: '✊ Knocked!' } }));
    setGame(prev => knock(prev));
  };

  const handleDiscard = (cardId: string) => {
    if (!isHumanTurn || game.turnPhase !== 'discard' || isAnimating) return;
    const next = discardCard(game, cardId);
    const card = human.hand.find(c => c.id === cardId);
    if (!card || next.discardPile.length <= game.discardPile.length) { setGame(next); return; }
    setLastMoves(m => ({ ...m, [human.id]: { ...m[human.id], discard: `Discarded ${cardName(card)}` } }));
    const el = humanHandRef.current?.querySelector(`[data-card-id="${cardId}"]`);
    launchFlyCard(next, card, el?.getBoundingClientRect(), discardRef.current?.getBoundingClientRect(), true, 'discard', cardId);
  };

  const handleNextRound = () => {
    setShowResults(false);
    setLastMoves({});
    setGame(prev => dealRound({ ...prev, roundNumber: prev.roundNumber + 1 }));
  };

  const handlePlayAgain = () => {
    setShowResults(false);
    setLastMoves({});
    setGame(seats ? initGameFromSeats(seats) : initGame(playerName, numBots));
  };

  // ── Friends on other devices (multiplayer host) ────────────────────────────

  const remoteRef = useRef<(pid: string, a: ClientAction) => void>(() => {});
  useEffect(() => {
    remoteRef.current = (pid, a) => {
      // Wait out any card in flight so we always act on the settled state
      if (pendingRef.current) { setTimeout(() => remoteRef.current(pid, a), 120); return; }
      const g = gameRef.current;
      const idx = g.currentTurnIdx;
      const p = g.players[idx];
      if (!p || p.id !== pid || p.isBot || idx === 0 || g.roundOver || g.gameOver) return;
      const area = botAreaRefs.current[idx - 1];

      if (a.t === 'draw' && g.turnPhase === 'draw') {
        const fromDiscard = a.from === 'discard';
        const after = fromDiscard ? drawFromDiscard(g) : drawFromDeck(g);
        if (!after.drawnCard) return;
        const drawn = after.drawnCard;
        setLastMoves(m => ({
          ...m,
          [pid]: fromDiscard ? { draw: `Took ${cardName(drawn)} from discard` } : { draw: 'Drew from stock', fromStock: true },
        }));
        launchFly(after, fromDiscard ? discardRef.current : stockRef.current, area, fromDiscard);
      } else if (a.t === 'knock' && g.turnPhase === 'draw' && g.knockerIdx === null) {
        setLastMoves(m => ({ ...m, [pid]: { draw: '✊ Knocked!' } }));
        setGame(knock(g));
      } else if (a.t === 'discard' && g.turnPhase === 'discard') {
        const after = discardCard(g, a.cardId);
        const card = p.hand.find(c => c.id === a.cardId);
        if (!card || after.discardPile.length <= g.discardPile.length) return;
        setLastMoves(m => ({ ...m, [pid]: { ...m[pid], discard: `Discarded ${cardName(card)}` } }));
        launchFlyCard(after, card, area?.getBoundingClientRect(), discardRef.current?.getBoundingClientRect(), true, 'discard');
      }
    };
  });

  useEffect(() => net?.subscribe((pid, a) => remoteRef.current(pid, a)), [net]);
  useEffect(() => { net?.publish(game, lastMoves); }, [net, game, lastMoves]);

  const currentId     = game.players[game.currentTurnIdx]?.id;
  const currentOffline = !game.roundOver && !game.gameOver && currentId !== undefined && offlineIds.includes(currentId);
  const takeOver = () => {
    if (!currentId) return;
    const next = takeOverWithBot(gameRef.current, currentId);
    setGame(next);
    scheduleBotDiscard(next);
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const bots              = game.players.slice(1);
  const currentPlayerName = game.players[game.currentTurnIdx]?.name ?? '';
  // While a discard-pile card is in flight, hide the source card so it doesn't appear in two places
  const hidingTopDiscard  = isAnimating && flyingCard?.kind === 'draw' && flyingCard.faceUp;

  const canDraw    = isHumanTurn && game.turnPhase === 'draw' && !isAnimating;
  const canDiscard = isHumanTurn && game.turnPhase === 'discard' && !isAnimating;
  const myPrompt = canDiscard && game.drawnCard
    ? `You ${game.drawnFromDiscard ? 'took' : 'drew'} ${cardName(game.drawnCard)}${game.drawnFromDiscard ? ' from the discard' : ''}. Choose a card to discard.`
    : null;
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
    <div className="felt min-h-dvh flex flex-col overflow-hidden">

      {/* Header */}
      <header className="relative z-[1] flex items-center justify-between px-4 sm:px-8 py-2 sm:py-3 bg-black/35 backdrop-blur border-b border-[#e8c468]/20">
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
      <main className="relative z-[1] flex-1 flex flex-col items-center justify-between p-3 sm:p-4 gap-3 sm:gap-4 max-w-4xl mx-auto w-full">

        {/* Bot zones */}
        <div
          className={`grid gap-2 sm:gap-5 w-full justify-center ${bots.length === 1 ? 'max-w-xs' : ''}`}
          style={{ gridTemplateColumns: `repeat(${bots.length}, minmax(0, 1fr))` }}
        >
          {bots.map((bot, i) => (
            <div key={bot.id} ref={el => { botAreaRefs.current[i] = el; }} className="min-w-0">
              <BotPlayerArea
                player={bot}
                isActive={game.currentTurnIdx === i + 1 && !game.roundOver}
                showScore={game.roundOver}
                score={game.roundResults?.scores[bot.id]}
                lastMove={lastMoves[bot.id]}
                offline={offlineIds.includes(bot.id)}
              />
            </div>
          ))}
        </div>

        {/* Centre: status + piles */}
        <div className="flex flex-col items-center gap-3 sm:gap-5">
          <div
            key={game.message}
            className="animate-pop glass px-5 py-2 rounded-full text-center max-w-md"
            aria-live="polite"
          >
            <p className="text-white/90 text-sm">
              {myPrompt ?? (botThinking && !game.roundOver ? `${currentPlayerName} is thinking…` : game.message)}
              {canDraw && !/Your turn/.test(game.message) ? ' Your move.' : ''}
            </p>
          </div>

          {currentOffline && (
            <button onClick={takeOver} className="animate-pop px-4 py-1.5 rounded-full bg-red-500/20 border border-red-400/60 text-red-100 text-xs font-semibold hover:bg-red-500/30 transition">
              {currentPlayerName} disconnected — let a bot play for them
            </button>
          )}

          <div className="flex items-end gap-8 sm:gap-12">
            <div ref={stockRef} className="relative">
              <FaceDownPile
                count={game.deck.length}
                label="Stock"
                highlight={canDraw || (isAnimating && flyingCard?.kind === 'draw' && !flyingCard.faceUp && game.currentTurnIdx !== 0)}
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
        <section className={`glass w-full flex flex-col items-center gap-2 sm:gap-3 p-3 sm:p-5 rounded-3xl transition-all duration-300
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
              <div className="h-5 sm:h-6 flex items-center">
                {discardPreview !== null && hoverCard && (
                  <span className="animate-pop text-xs text-white/80 px-3 py-0.5 rounded-full bg-black/50 border border-white/15">
                    Discard {cardName(hoverCard)} → score <b className={scoreColor(discardPreview)}>{discardPreview}</b>
                  </span>
                )}
              </div>

              <div ref={humanHandRef} className="flex gap-1.5 sm:gap-3 justify-center min-h-[6.5rem] sm:min-h-28">
                {human.hand.map((card, i) => {
                  const isDrawnFromDiscard = game.drawnFromDiscard && game.drawnCard?.id === card.id;
                  const canPick = canDiscard && !isDrawnFromDiscard;
                  const showLit = !game.roundOver && human.hand.length >= 3;
                  return (
                    <div key={card.id} data-card-id={card.id} className="relative" style={{ opacity: flyingCard?.hideId === card.id ? 0 : 1 }}>
                      <CardComponent
                        card={card}
                        size="lg"
                        animateIn={card.id !== game.drawnCard?.id}
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
                {/* Reserved slot(s) so cards never jump when the 4th card arrives */}
                {Array.from({ length: Math.max(0, 4 - human.hand.length) }).map((_, i) => (
                  <div
                    key={`slot-${i}`}
                    ref={i === 0 ? emptySlotRef : undefined}
                    className="w-[4.5rem] h-[6.5rem] sm:w-20 sm:h-28 rounded-xl border border-dashed border-white/10"
                    aria-hidden
                  />
                ))}
              </div>

              {/* Turn guide + actions */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 sm:mt-2">
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

              <p className="hidden sm:block text-white/40 text-xs h-4">
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
        <RoundResultsModal state={game} viewerId={human.id} onNextRound={handleNextRound} onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
}
