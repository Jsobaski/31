'use client';

import { Card } from '@/lib/types';

interface CardProps {
  card?: Card;
  faceDown?: boolean;
  selectable?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SUIT_SYMBOLS: Record<string, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
const RED_SUITS = new Set(['H', 'D']);

export default function CardComponent({
  card,
  faceDown = false,
  selectable = false,
  selected = false,
  disabled = false,
  onClick,
  size = 'md',
  label,
}: CardProps) {
  const sizeClasses = {
    sm: 'w-10 h-14 text-xs',
    md: 'w-14 h-20 text-sm',
    lg: 'w-16 h-24 text-base',
  };

  const baseClasses = `
    ${sizeClasses[size]}
    rounded-lg border-2 shadow-md flex flex-col relative
    transition-all duration-150 select-none font-mono font-bold
    ${onClick ? 'cursor-pointer' : ''}
  `;

  if (faceDown) {
    return (
      <div
        className={`${baseClasses} bg-blue-800 border-blue-600 items-center justify-center`}
        onClick={onClick}
        title={label}
      >
        <div className="absolute inset-1 rounded border border-blue-500 opacity-40" />
        <div className="text-blue-400 text-lg">🂠</div>
      </div>
    );
  }

  if (!card) return null;

  const isRed = RED_SUITS.has(card.suit);
  const sym = SUIT_SYMBOLS[card.suit];
  const colorClass = isRed ? 'text-red-600' : 'text-gray-900';

  const borderClass = selected
    ? 'border-yellow-400 ring-2 ring-yellow-300'
    : selectable && !disabled
    ? 'border-green-400 hover:border-green-300 hover:-translate-y-2 hover:shadow-xl'
    : 'border-gray-300';

  const bgClass = disabled ? 'bg-gray-100' : 'bg-white';

  return (
    <div
      className={`${baseClasses} ${bgClass} ${borderClass} p-1`}
      onClick={!disabled && onClick ? onClick : undefined}
      title={label ?? `${card.value}${sym}`}
    >
      {/* Top-left */}
      <div className={`flex flex-col leading-none ${colorClass}`}>
        <span>{card.value}</span>
        <span>{sym}</span>
      </div>

      {/* Center suit */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none ${colorClass}`}
        style={{ fontSize: size === 'sm' ? '1rem' : '1.5rem' }}
      >
        {sym}
      </div>

      {/* Bottom-right rotated */}
      <div className={`flex flex-col leading-none mt-auto self-end rotate-180 ${colorClass}`}>
        <span>{card.value}</span>
        <span>{sym}</span>
      </div>
    </div>
  );
}

export function FaceDownPile({ count, label, onClick }: { count: number; label: string; onClick?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" onClick={onClick}>
        {count > 0 ? (
          <div className={`relative ${onClick ? 'cursor-pointer' : ''}`}>
            {count > 2 && (
              <div className="absolute -top-1 -left-1 w-14 h-20 bg-blue-900 rounded-lg border-2 border-blue-700" />
            )}
            {count > 1 && (
              <div className="absolute -top-0.5 -left-0.5 w-14 h-20 bg-blue-800 rounded-lg border-2 border-blue-600" />
            )}
            <div className="relative w-14 h-20 bg-blue-700 rounded-lg border-2 border-blue-500 flex items-center justify-center shadow-md transition-all hover:border-blue-300 hover:shadow-lg">
              <div className="absolute inset-1 rounded border border-blue-400 opacity-40" />
              <span className="text-blue-300 text-xs">{count}</span>
            </div>
          </div>
        ) : (
          <div className="w-14 h-20 bg-gray-700 rounded-lg border-2 border-dashed border-gray-500 flex items-center justify-center">
            <span className="text-gray-500 text-xs">Empty</span>
          </div>
        )}
      </div>
      <span className="text-gray-400 text-xs">{label}</span>
    </div>
  );
}
