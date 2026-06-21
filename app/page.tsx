'use client';

import { useState } from 'react';
import GameBoard from '@/components/GameBoard';

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
    <div className="min-h-screen bg-green-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-yellow-400 tracking-widest mb-2">31</h1>
          <p className="text-gray-400 text-sm">The classic card game</p>
        </div>

        {/* Rules summary */}
        <div className="bg-gray-800/60 rounded-xl p-4 mb-6 text-xs text-gray-400 space-y-1">
          <p className="text-gray-300 font-semibold mb-2">How to play:</p>
          <p>• Draw from the stock or discard pile, then discard one card.</p>
          <p>• Score = highest suit total (A=11, face cards=10).</p>
          <p>• Three of a kind = 30 points.</p>
          <p>
            • Hit exactly{' '}
            <span className="text-yellow-400 font-bold">31</span> for an instant win!
          </p>
          <p>
            •{' '}
            <span className="text-orange-400 font-bold">Knock</span> to end the round — everyone
            else gets one last turn.
          </p>
          <p>• Lowest scorer loses a life. Knocker who loses pays 2 lives.</p>
          <p>
            • 3 lives each. At 0 you get a{' '}
            <span className="text-purple-400">Free Ride</span>. Lose again → eliminated.
          </p>
        </div>

        {/* Setup Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-gray-300 text-sm mb-1">Your name</label>
            <input
              type="text"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={16}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm mb-1">Number of opponents</label>
            <div className="flex gap-2">
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  onClick={() => setNumBots(n)}
                  className={`flex-1 py-2 rounded-lg font-bold transition-colors ${
                    numBots === n
                      ? 'bg-green-600 text-white border-2 border-green-400'
                      : 'bg-gray-700 text-gray-300 border-2 border-transparent hover:border-gray-500'
                  }`}
                >
                  {n} Bot{n > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold text-lg rounded-xl transition-colors shadow-lg mt-2"
          >
            Deal Cards →
          </button>
        </div>
      </div>
    </div>
  );
}
