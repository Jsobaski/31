'use client';

import { useState } from 'react';
import GameBoard from '@/components/GameBoard';
import CardComponent from '@/components/CardComponent';

const DEMO = [
  { suit: 'S', value: 'A', points: 11, id: 'AS' },
  { suit: 'S', value: 'K', points: 10, id: 'KS' },
  { suit: 'S', value: '10', points: 10, id: '10S' },
] as const;

export default function Home() {
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [numBots, setNumBots] = useState(2);

  if (started) {
    return (
      <GameBoard
        playerName={playerName || 'You'}
        numBots={numBots}
        onExit={() => setStarted(false)}
      />
    );
  }

  return (
    <div className="felt min-h-screen flex items-center justify-center p-4">
      <div className="animate-pop glass bg-[#0c1c14]/70 rounded-3xl p-6 sm:p-8 w-full max-w-md">
        {/* Title */}
        <div className="text-center mb-6">
          <div className="flex justify-center gap-2 mb-4">
            {DEMO.map((c, i) => (
              <div key={c.id} style={{ transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -6 : 0}px)` }}>
                <CardComponent card={{ ...c }} size="md" animateIn dealIndex={i} />
              </div>
            ))}
          </div>
          <h1 className="text-6xl font-black gold-text tracking-[0.2em] card-serif">31</h1>
          <p className="text-white/50 text-xs uppercase tracking-[0.3em] mt-1">The classic card game</p>
        </div>

        {/* Rules summary */}
        <details className="group mb-6 rounded-2xl bg-black/25 border border-white/10 text-xs text-white/60">
          <summary className="cursor-pointer select-none px-4 py-3 text-white/80 font-semibold tracking-wide list-none flex justify-between items-center">
            How to play
            <span className="text-[#e8c468] transition-transform group-open:rotate-45 text-base leading-none">+</span>
          </summary>
          <div className="px-4 pb-4 space-y-1.5">
            <p>• Draw from the stock or discard pile, then discard one card.</p>
            <p>• Score = highest suit total (A=11, face cards=10).</p>
            <p>• Three of a kind = 30 points.</p>
            <p>• Hit exactly <span className="text-[#ffe27a] font-bold">31</span> for an instant win!</p>
            <p>• <span className="text-orange-300 font-bold">Knock</span> to end the round — everyone else gets one last turn.</p>
            <p>• Lowest scorer loses a life. Knocker who loses pays 2 lives.</p>
            <p>• 3 lives each. At 0 you get a <span className="text-purple-300">Free Ride</span>. Lose again → eliminated.</p>
            <p className="pt-1 text-white/40">Tip: press D / S to draw, K to knock, 1–4 to discard.</p>
          </div>
        </details>

        {/* Setup */}
        <div className="space-y-5">
          <div>
            <label htmlFor="name" className="block text-white/60 text-xs uppercase tracking-widest mb-1.5">Your name</label>
            <input
              id="name"
              type="text"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setStarted(true)}
              placeholder="Enter your name"
              maxLength={16}
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-[#e8c468] focus:ring-1 focus:ring-[#e8c468]/60 transition"
            />
          </div>

          <div>
            <span className="block text-white/60 text-xs uppercase tracking-widest mb-1.5">Opponents</span>
            <div className="flex gap-2">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => setNumBots(n)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                    numBots === n
                      ? 'bg-[#e8c468] text-[#3b2a05] shadow-[0_0_18px_rgba(232,196,104,0.4)]'
                      : 'bg-white/5 text-white/70 border border-white/15 hover:border-white/40'
                  }`}
                >
                  {n} Bot{n > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="w-full py-3.5 rounded-full font-bold text-lg text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-[0.98] transition shadow-[0_10px_28px_rgba(232,196,104,0.35)]"
          >
            Deal Cards →
          </button>
        </div>
      </div>
    </div>
  );
}
