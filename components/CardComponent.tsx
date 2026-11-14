'use client';

import { Card } from '@/lib/types';

interface CardProps {
  card?: Card;
  faceDown?: boolean;
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  /** Card counts toward the hand's score (shown lit). */
  scoring?: boolean;
  /** Card does not count toward the score (shown dimmed). */
  dimmed?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  /** Stagger index for the deal-in animation. */
  dealIndex?: number;
  animateIn?: boolean;
}

const SUIT_SYMBOLS: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const RED_SUITS = new Set(['H', 'D']);

const DIMS = {
  sm: { box: 'w-10 h-14 rounded-md', idx: 'text-[11px]', pip: 'text-lg', corner: 'p-[3px]', face: 'text-xl' },
  md: { box: 'w-14 h-20 rounded-lg', idx: 'text-sm', pip: 'text-2xl', corner: 'p-1', face: 'text-3xl' },
  lg: { box: 'w-[4.5rem] h-[6.5rem] sm:w-20 sm:h-28 rounded-xl', idx: 'text-base sm:text-lg', pip: 'text-3xl sm:text-4xl', corner: 'p-1.5', face: 'text-4xl sm:text-5xl' },
} as const;

export default function CardComponent({
  card,
  faceDown = false,
  selectable = false,
  selected = false,
  disabled = false,
  scoring = false,
  dimmed = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  size = 'md',
  label,
  dealIndex = 0,
  animateIn = false,
}: CardProps) {
  const d = DIMS[size];
  const anim = animateIn ? 'animate-deal' : '';
  const animStyle = animateIn ? { animationDelay: `${dealIndex * 70}ms` } : undefined;

  if (faceDown) {
    return (
      <div
        className={`${d.box} card-back relative shrink-0 select-none border border-[#e8c468]/60 ${anim}`}
        style={animStyle}
        onClick={onClick}
        title={label}
      >
        <div className="absolute inset-[3px] rounded-[inherit] border border-[#e8c468]/40" />
        <div className="absolute inset-0 flex items-center justify-center text-[#e8c468]/70 card-serif text-lg">♠</div>
      </div>
    );
  }

  if (!card) return null;

  const isRed = RED_SUITS.has(card.suit);
  const sym = SUIT_SYMBOLS[card.suit];
  const color = isRed ? 'text-[#c1121f]' : 'text-[#16181d]';
  const isFace = card.value === 'J' || card.value === 'Q' || card.value === 'K';
  const interactive = selectable && !disabled;

  const ring = selected
    ? 'ring-2 ring-[#e8c468]'
    : scoring
    ? 'ring-2 ring-[#e8c468]/80 shadow-[0_0_16px_rgba(232,196,104,0.45)]'
    : '';

  return (
    <div
      className={`${d.box} card-face relative shrink-0 select-none border border-black/10 card-serif font-bold
        transition-all duration-200 ease-out ${anim} ${ring}
        ${interactive ? 'cursor-pointer hover:-translate-y-3 hover:rotate-[-1.5deg] hover:shadow-[0_18px_30px_rgba(0,0,0,0.5)]' : ''}
        ${dimmed ? 'brightness-[0.94]' : ''}
        ${disabled ? 'brightness-75' : ''}
      `}
      style={animStyle}
      onClick={!disabled && onClick ? onClick : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={label ?? `${card.value}${sym}`}
    >
      <div className={`absolute top-0 left-0 flex flex-col items-center leading-none ${d.corner} ${color}`}>
        <span className={d.idx}>{card.value}</span>
        <span className={d.idx}>{sym}</span>
      </div>

      <div className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none ${color}`}>
        {isFace ? (
          <>
            <span className={`${d.face} leading-none`}>{card.value}</span>
            <span className={`${size === 'sm' ? 'text-xs' : 'text-lg'} leading-none mt-0.5`}>{sym}</span>
          </>
        ) : (
          <span className={d.pip}>{sym}</span>
        )}
      </div>

      <div className={`absolute bottom-0 right-0 flex flex-col items-center leading-none rotate-180 ${d.corner} ${color}`}>
        <span className={d.idx}>{card.value}</span>
        <span className={d.idx}>{sym}</span>
      </div>
    </div>
  );
}

export function FaceDownPile({ count, label, onClick, highlight = false }: {
  count: number; label: string; onClick?: () => void; highlight?: boolean;
}) {
  const layers = Math.min(4, Math.max(0, count - 1));
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative w-[4.5rem] h-[6.5rem] sm:w-20 sm:h-28 ${onClick ? 'cursor-pointer group' : ''}`}
        onClick={onClick}
      >
        {count > 0 ? (
          <>
            {Array.from({ length: layers }).map((_, i) => (
              <div
                key={i}
                className="absolute card-back rounded-xl border border-[#e8c468]/40 w-full h-full"
                style={{ top: -(layers - i) * 1.5, left: -(layers - i) * 1.5 }}
              />
            ))}
            <div
              className={`absolute inset-0 card-back rounded-xl border border-[#e8c468]/70 flex items-center justify-center transition-all duration-200
                ${onClick ? 'group-hover:-translate-y-2 group-hover:shadow-[0_18px_30px_rgba(0,0,0,0.5)]' : ''}
                ${highlight ? 'ring-2 ring-[#e8c468] shadow-[0_0_22px_rgba(232,196,104,0.5)]' : ''}`}
            >
              <div className="absolute inset-[3px] rounded-[inherit] border border-[#e8c468]/40" />
              <span className="relative text-[#e8c468] card-serif text-lg font-bold bg-[#14204d]/90 rounded-full w-9 h-9 flex items-center justify-center border border-[#e8c468]/60">
                {count}
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-full rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center">
            <span className="text-white/30 text-xs">Empty</span>
          </div>
        )}
      </div>
      <span className="text-[11px] uppercase tracking-[0.2em] text-white/50">{label}</span>
    </div>
  );
}
