'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataConnection, Peer } from 'peerjs';
import {
  CONN_OPTIONS, PING_EVERY_MS, loadPeer, peerIdFor, peerOptions,
  type ClientAction, type ClientMsg, type HostMsg, type LobbyInfo,
} from '@/lib/net';
import type { BotMove, GameState } from '@/lib/types';
import RemoteBoard from './RemoteBoard';

type Phase = 'connecting' | 'lobby' | 'playing' | 'reconnecting' | 'error';

const MAX_RETRIES = 8;

function tokenFor(code: string): string {
  const key = `t31-token-${code}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

// A friend's device: joins a room by code, waits in the lobby, then plays from a private view.
export default function FriendsGuest({ code, name, onExit }: { code: string; name: string; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState('');
  const [lobby, setLobby] = useState<LobbyInfo | null>(null);
  const [you, setYou] = useState('');
  const [view, setView] = useState<{ game: GameState; seat: number; moves: Record<string, BotMove> } | null>(null);
  const connRef = useRef<DataConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    let fatal = false;
    let joined = false;
    let retries = 0;
    let peer: Peer | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pinger: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const token = tokenFor(code);

    const giveUp = (msg: string) => {
      fatal = true;
      setError(msg);
      setPhase('error');
    };

    // Lost (or never got) a connection: retry quietly, then give up.
    const lost = (reason: string) => {
      if (cancelled || fatal) return;
      clearTimeout(timer);
      clearInterval(pinger);
      peer?.destroy();
      if (++retries > MAX_RETRIES) {
        giveUp(joined ? 'The host ended the game or the connection was lost.' : reason);
        return;
      }
      if (joined) setPhase('reconnecting');
      retryTimer = setTimeout(attempt, 2000);
    };

    const onMsg = (m: HostMsg) => {
      if (m.t === 'rejected') { giveUp(m.reason); return; }
      joined = true;
      retries = 0;
      setYou(m.you);
      if (m.t === 'lobby') { setLobby(m.info); setPhase('lobby'); }
      else { setView({ game: m.game, seat: m.seat, moves: m.moves }); setPhase('playing'); }
    };

    const attempt = async () => {
      const Peer = await loadPeer();
      if (cancelled) return;
      const p = new Peer(peerOptions());
      peer = p;
      let opened = false;
      let dead = false; // each attempt reports its failure once (destroy() can emit more events)
      const fail = (reason: string) => { if (!dead) { dead = true; lost(reason); } };
      timer = setTimeout(() => { if (!opened) fail('Could not reach that room. Check the code and try again.'); }, 15000);

      p.on('error', err => {
        if (err.type === 'peer-unavailable') fail(`No room "${code}" found. Check the code, or ask the host to resend the link.`);
        else fail('Connection problem. Check your internet and try again.');
      });
      p.on('open', () => {
        const conn = p.connect(peerIdFor(code), CONN_OPTIONS);
        connRef.current = conn;
        conn.on('open', () => {
          opened = true;
          clearTimeout(timer);
          conn.send({ t: 'join', name, token } satisfies ClientMsg);
          clearInterval(pinger);
          pinger = setInterval(() => { if (conn.open) conn.send({ t: 'ping' } satisfies ClientMsg); }, PING_EVERY_MS);
        });
        conn.on('data', raw => onMsg(raw as HostMsg));
        conn.on('close', () => fail('The host closed the room.'));
        conn.on('error', () => fail('Connection problem.'));
      });
    };
    attempt();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(retryTimer);
      clearInterval(pinger);
      peer?.destroy();
    };
  }, [code, name]);

  const send = useCallback((a: ClientAction) => {
    const c = connRef.current;
    if (c?.open) c.send(a);
  }, []);

  if (phase === 'playing' && view) {
    return <RemoteBoard game={view.game} seat={view.seat} moves={view.moves} send={send} onExit={onExit} />;
  }

  return (
    <div className="felt min-h-dvh flex items-center justify-center p-4">
      <div className="relative z-[1] animate-pop glass bg-[#0c1c14]/70 rounded-3xl p-6 sm:p-8 w-full max-w-md text-center">
        <p className="text-white/50 text-xs uppercase tracking-[0.3em]">Room</p>
        <h1 className="text-5xl font-black gold-text tracking-[0.3em] card-serif my-2 pl-[0.3em]">{code}</h1>

        {(phase === 'connecting' || phase === 'reconnecting') && (
          <p className="text-white/60 py-6 animate-pulse" data-testid="guest-status">
            {phase === 'connecting' ? 'Connecting…' : 'Reconnecting to the host…'}
          </p>
        )}

        {phase === 'lobby' && lobby && (
          <div className="py-4" data-testid="guest-status">
            <p className="text-emerald-300 font-semibold mb-4">You&apos;re in! Waiting for {lobby.host} to start…</p>
            <div className="rounded-2xl bg-black/25 border border-white/10 p-3 space-y-1.5 text-sm text-left">
              <div className="flex items-center gap-2"><span className="text-emerald-400">●</span><span className="text-white font-semibold">{lobby.host}</span><span className="text-white/40 text-xs">(host)</span></div>
              {lobby.players.map(p => (
                <div key={p.id} className="flex items-center gap-2 animate-pop">
                  <span className={p.connected ? 'text-emerald-400' : 'text-amber-400'}>●</span>
                  <span className="text-white font-semibold">{p.name}</span>
                  {p.id === you && <span className="text-white/40 text-xs">(you)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-4">
            <p className="text-rose-300 text-sm mb-4" data-testid="guest-status">{error}</p>
          </div>
        )}

        <button onClick={onExit} className="mt-2 text-white/40 hover:text-white/70 text-xs uppercase tracking-widest transition">
          {phase === 'error' ? 'Back' : 'Leave'}
        </button>
      </div>
    </div>
  );
}
