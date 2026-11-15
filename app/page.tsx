'use client';

import { useState, useSyncExternalStore } from 'react';
import GameBoard from '@/components/GameBoard';
import CardComponent from '@/components/CardComponent';
import FriendsHost from '@/components/FriendsHost';
import FriendsGuest from '@/components/FriendsGuest';
import { normalizeCode } from '@/lib/net';

const DEMO = [
  { suit: 'S', value: 'A', points: 11, id: 'AS' },
  { suit: 'S', value: 'K', points: 10, id: 'KS' },
  { suit: 'S', value: '10', points: 10, id: '10S' },
] as const;

const noopSubscribe = () => () => {};
const readJoinParam = () => normalizeCode(new URLSearchParams(window.location.search).get('join') ?? '');

type Mode = 'menu' | 'solo' | 'host' | 'join' | 'guest';

export default function Home() {
  const [mode, setMode] = useState<Mode>('menu');
  const [playerName, setPlayerName] = useState('');
  const [numBots, setNumBots] = useState(2);
  const [joinCode, setJoinCode] = useState('');
  const [linkDismissed, setLinkDismissed] = useState(false);
  // ?join=ABCD from a texted invite link ('' on the server → no hydration mismatch)
  const linkCode = useSyncExternalStore(noopSubscribe, readJoinParam, () => '');
  const started = mode === 'solo';
  const code = joinCode || (linkDismissed ? '' : linkCode);
  const showJoin = mode === 'join' || (mode === 'menu' && !!linkCode && !linkDismissed);

  const leaveToMenu = () => {
    setMode('menu');
    setLinkDismissed(true);
    setJoinCode('');
  };

  if (mode === 'host') {
    return <FriendsHost hostName={playerName.trim() || 'Host'} onExit={leaveToMenu} />;
  }
  if (mode === 'guest') {
    return <FriendsGuest code={code} name={playerName.trim() || 'Friend'} onExit={leaveToMenu} />;
  }

  if (started) {
    return (
      <GameBoard
        playerName={playerName || 'You'}
        numBots={numBots}
        onExit={() => setMode('menu')}
      />
    );
  }

  if (showJoin) {
    const valid = code.length === 4;
    return (
      <div className="felt min-h-dvh flex items-center justify-center p-4">
        <div className="relative z-[1] animate-pop glass bg-[#0c1c14]/70 rounded-3xl p-6 sm:p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-5xl font-black gold-text tracking-[0.2em] card-serif">31</h1>
            <p className="text-white/50 text-xs uppercase tracking-[0.3em] mt-1">Join a friend&apos;s game</p>
          </div>
          <div className="space-y-5">
            <div>
              <label htmlFor="code" className="block text-white/60 text-xs uppercase tracking-widest mb-1.5">Room code</label>
              <input
                id="code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={e => setJoinCode(normalizeCode(e.target.value))}
                placeholder="ABCD"
                maxLength={4}
                className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-center text-3xl font-black tracking-[0.5em] pl-[0.5em] text-[#ffe27a] placeholder-white/20 focus:outline-none focus:border-[#e8c468] focus:ring-1 focus:ring-[#e8c468]/60 transition uppercase"
              />
            </div>
            <div>
              <label htmlFor="jname" className="block text-white/60 text-xs uppercase tracking-widest mb-1.5">Your name</label>
              <input
                id="jname"
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && valid && (setJoinCode(code), setMode('guest'))}
                placeholder="Enter your name"
                maxLength={16}
                autoFocus={!!linkCode}
                className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-[#e8c468] focus:ring-1 focus:ring-[#e8c468]/60 transition"
              />
            </div>
            <button
              onClick={() => { setJoinCode(code); setMode('guest'); }}
              disabled={!valid}
              className="w-full py-3.5 rounded-full font-bold text-lg text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-[0.98] transition shadow-[0_10px_28px_rgba(232,196,104,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Join game →
            </button>
            <button onClick={leaveToMenu} className="block mx-auto text-white/40 hover:text-white/70 text-xs uppercase tracking-widest transition">Back</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="felt min-h-screen flex items-center justify-center p-4">
      <div className="relative z-[1] animate-pop glass bg-[#0c1c14]/70 rounded-3xl p-6 sm:p-8 w-full max-w-md">
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
            <p className="text-white/40">Friends: host a room, then text them the invite link — they play from their own phone.</p>
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
              onKeyDown={e => e.key === 'Enter' && setMode('solo')}
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
            onClick={() => setMode('solo')}
            className="w-full py-3.5 rounded-full font-bold text-lg text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-[0.98] transition shadow-[0_10px_28px_rgba(232,196,104,0.35)]"
          >
            Deal Cards →
          </button>

          <div className="flex items-center gap-3 text-white/30 text-[11px] uppercase tracking-[0.25em]">
            <span className="h-px flex-1 bg-white/10" />play with friends<span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('host')}
              className="flex-1 py-3 rounded-full font-bold text-sm text-white border border-[#e8c468]/60 hover:bg-[#e8c468]/10 active:scale-[0.98] transition"
            >
              Host a room
            </button>
            <button
              onClick={() => setMode('join')}
              className="flex-1 py-3 rounded-full font-bold text-sm text-white border border-white/25 hover:bg-white/10 active:scale-[0.98] transition"
            >
              Join a room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
