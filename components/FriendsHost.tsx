'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { DataConnection, Peer } from 'peerjs';
import { redactFor } from '@/lib/gameEngine';
import {
  MAX_SEATS, OFFLINE_AFTER_MS, loadPeer, makeRoomCode, peerIdFor, peerOptions,
  type ClientAction, type ClientMsg, type HostMsg, type HostNet, type LobbyInfo, type LobbyPlayer,
} from '@/lib/net';
import type { BotMove, GameState, Seat } from '@/lib/types';
import GameBoard from './GameBoard';

interface Guest {
  id: string;
  token: string;
  name: string;
  conn: DataConnection | null;
  connected: boolean;
  lastSeen: number;
}

export default function FriendsHost({ hostName, onExit }: { hostName: string; onExit: () => void }) {
  const [initialCode] = useState(() => makeRoomCode());
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<'opening' | 'ready' | 'error'>('opening');
  const [error, setError] = useState('');
  const [friends, setFriends] = useState<LobbyPlayer[]>([]);
  const [bots, setBots] = useState(1);
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);

  // Mutable room state shared with PeerJS callbacks
  const peerRef = useRef<Peer | null>(null);
  const guests = useRef(new Map<string, Guest>());
  const connToGuest = useRef(new Map<DataConnection, string>());
  const listeners = useRef(new Set<(id: string, a: ClientAction) => void>());
  const latest = useRef<{ game: GameState; moves: Record<string, BotMove> } | null>(null);
  const codeRef = useRef(initialCode);
  const startedRef = useRef(false);
  const counter = useRef(0);

  const send = (g: Guest, msg: HostMsg) => {
    if (g.conn && g.connected && g.conn.open) g.conn.send(msg);
  };

  const lobbyInfo = (): LobbyInfo => ({
    code: codeRef.current,
    host: hostName,
    players: [...guests.current.values()].map(g => ({ id: g.id, name: g.name, connected: g.connected })),
  });

  const publishLobby = () => {
    const info = lobbyInfo();
    setFriends(info.players);
    if (!startedRef.current) guests.current.forEach(g => send(g, { t: 'lobby', info, you: g.id }));
  };

  const sendState = (g: Guest) => {
    const cur = latest.current;
    if (!cur) return;
    const seat = cur.game.players.findIndex(p => p.id === g.id);
    if (seat < 0) return;
    send(g, { t: 'state', game: redactFor(cur.game, seat), seat, moves: cur.moves, you: g.id });
  };

  // ── Open the room ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let peer: Peer | null = null;

    const onMessage = (conn: DataConnection, m: ClientMsg) => {
      if (m.t === 'join') {
        const existing = [...guests.current.values()].find(g => g.token === m.token);
        if (existing) {
          existing.conn = conn;
          existing.connected = true;
          existing.lastSeen = Date.now();
          connToGuest.current.set(conn, existing.id);
          if (startedRef.current) sendState(existing);
          publishLobby();
          return;
        }
        if (startedRef.current) { conn.send({ t: 'rejected', reason: 'That game has already started.' } satisfies HostMsg); return; }
        if (guests.current.size >= MAX_SEATS - 1) { conn.send({ t: 'rejected', reason: 'This room is full.' } satisfies HostMsg); return; }
        const taken = new Set([hostName.toLowerCase(), ...[...guests.current.values()].map(g => g.name.toLowerCase())]);
        const base = (m.name || 'Friend').trim().slice(0, 16) || 'Friend';
        let name = base; let n = 2;
        while (taken.has(name.toLowerCase())) name = `${base} ${n++}`;
        const id = `f${++counter.current}`;
        guests.current.set(id, { id, token: m.token, name, conn, connected: true, lastSeen: Date.now() });
        connToGuest.current.set(conn, id);
        publishLobby();
        return;
      }
      const id = connToGuest.current.get(conn);
      const g = id ? guests.current.get(id) : undefined;
      if (!id || !g) return;
      g.lastSeen = Date.now();
      if (!g.connected && g.conn === conn) { // heard from a friend we'd marked offline
        g.connected = true;
        if (startedRef.current) sendState(g);
        publishLobby();
      }
      if (m.t !== 'ping') listeners.current.forEach(fn => fn(id, m));
    };

    const onClose = (conn: DataConnection) => {
      const id = connToGuest.current.get(conn);
      connToGuest.current.delete(conn);
      const g = id ? guests.current.get(id) : undefined;
      if (!g || g.conn !== conn) return;
      g.connected = false;
      if (!startedRef.current) guests.current.delete(g.id); // left the lobby
      publishLobby();
    };

    const open = async (c: string) => {
      const Peer = await loadPeer();
      if (cancelled) return;
      const p = new Peer(peerIdFor(c), peerOptions());
      peer = p;
      peerRef.current = p;
      p.on('open', () => {
        if (cancelled) return;
        codeRef.current = c;
        setCode(c);
        setStatus('ready');
      });
      p.on('error', err => {
        if (cancelled) return;
        if (err.type === 'unavailable-id' && attempts < 6) {
          attempts++;
          p.destroy();
          open(makeRoomCode());
          return;
        }
        setError(err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error'
          ? 'Could not reach the matchmaking server. Check your connection and try again.'
          : err.message);
        setStatus('error');
      });
      p.on('disconnected', () => { try { p.reconnect(); } catch { /* destroyed */ } });
      p.on('connection', conn => {
        conn.on('data', raw => onMessage(conn, raw as ClientMsg));
        conn.on('close', () => onClose(conn));
        conn.on('error', () => onClose(conn));
      });
    };
    open(initialCode);

    // Mark friends offline when their heartbeat stops
    const watchdog = setInterval(() => {
      let changed = false;
      guests.current.forEach(g => {
        if (g.connected && Date.now() - g.lastSeen > OFFLINE_AFTER_MS) { g.connected = false; changed = true; }
      });
      if (changed) {
        if (!startedRef.current) [...guests.current.values()].filter(g => !g.connected).forEach(g => guests.current.delete(g.id));
        publishLobby();
      }
    }, 2000);

    return () => { cancelled = true; clearInterval(watchdog); peer?.destroy(); peerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Join link / QR ─────────────────────────────────────────────────────────
  const joinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/?join=${code}`;
  useEffect(() => {
    if (status !== 'ready' || !joinUrl) return;
    let live = true;
    import('qrcode')
      .then(m => m.toDataURL(joinUrl, { margin: 1, width: 220, color: { dark: '#0c1c14', light: '#fffdf7' } }))
      .then(url => { if (live) setQr(url); })
      .catch(() => {});
    return () => { live = false; };
  }, [status, joinUrl]);

  // ── Bridge handed to the game board ────────────────────────────────────────
  const net = useMemo<HostNet>(() => ({
    publish(game, moves) {
      latest.current = { game, moves };
      guests.current.forEach(g => sendState(g));
    },
    subscribe(fn) {
      listeners.current.add(fn);
      return () => { listeners.current.delete(fn); };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const start = () => {
    const connected = [...guests.current.values()].filter(g => g.connected);
    [...guests.current.values()].filter(g => !g.connected).forEach(g => guests.current.delete(g.id));
    const humans: Seat[] = [
      { id: 'p0', name: hostName, isBot: false },
      ...connected.map(g => ({ id: g.id, name: g.name, isBot: false })),
    ];
    const botCount = Math.min(bots, MAX_SEATS - humans.length);
    const seatList = [
      ...humans,
      ...Array.from({ length: botCount }, (_, i) => ({ id: `bot${i + 1}`, name: `Bot ${i + 1}`, isBot: true })),
    ];
    if (seatList.length < 2) return;
    startedRef.current = true;
    setFriends(lobbyInfo().players);
    setSeats(seatList);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  // Opens the phone's messaging app with the invite pre-filled (works across cities).
  const inviteText = `Join my game of 31! Tap to play: ${joinUrl} (room code ${code})`;
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const smsHref = `sms:${isIOS ? '&' : '?'}body=${encodeURIComponent(inviteText)}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = async () => {
    try { await navigator.share({ title: 'Join my game of 31', text: inviteText, url: joinUrl }); } catch { /* cancelled */ }
  };

  // ── Playing ────────────────────────────────────────────────────────────────
  if (seats) {
    return (
      <GameBoard
        playerName={hostName}
        numBots={0}
        seats={seats}
        net={net}
        offlineIds={friends.filter(f => !f.connected).map(f => f.id)}
        onExit={onExit}
      />
    );
  }

  // ── Lobby ──────────────────────────────────────────────────────────────────
  const maxBots = MAX_SEATS - 1 - friends.length;
  const effectiveBots = Math.min(bots, Math.max(0, maxBots));
  const canStart = 1 + friends.filter(f => f.connected).length + effectiveBots >= 2;

  return (
    <div className="felt min-h-dvh flex items-center justify-center p-4">
      <div className="relative z-[1] animate-pop glass bg-[#0c1c14]/70 rounded-3xl p-6 sm:p-8 w-full max-w-md">
        <p className="text-center text-white/50 text-xs uppercase tracking-[0.3em]">Room code</p>

        {status === 'opening' && <p className="text-center text-white/60 py-10 animate-pulse">Opening room…</p>}

        {status === 'error' && (
          <div className="text-center py-6">
            <p className="text-rose-300 text-sm mb-4">{error}</p>
            <button onClick={onExit} className="px-6 py-2 rounded-full border border-white/30 text-white/80 hover:border-white/60 transition">Back</button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <h1 className="text-center text-6xl font-black gold-text tracking-[0.3em] card-serif my-2 pl-[0.3em]" data-testid="room-code">{code}</h1>
            <p className="text-center text-white/50 text-xs mb-4">
              Send the link below, or on their phone open <span className="text-white/80">{typeof window !== 'undefined' ? window.location.host : ''}</span> and enter the code:
            </p>
            <div className="flex flex-col items-center gap-3 mb-5">
              <div className="w-[220px] h-[220px] rounded-2xl bg-[#fffdf7] p-0 overflow-hidden flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {qr ? <img src={qr} alt={`QR code to join room ${code}`} width={220} height={220} /> : <span className="text-black/30 text-xs">…</span>}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <a href={smsHref} data-testid="sms-invite" className="text-xs px-4 py-2 rounded-full font-bold text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 transition">
                  💬 Text invite
                </a>
                <button onClick={copy} className="text-xs px-4 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/50 transition">
                  {copied ? 'Link copied ✓' : 'Copy link'}
                </button>
                {canShare && (
                  <button onClick={share} className="text-xs px-4 py-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/50 transition">
                    Share…
                  </button>
                )}
              </div>
              <p className="text-white/35 text-[11px] text-center max-w-[16rem]">
                Anyone with the link can join from anywhere — it works over the internet, not just the same Wi-Fi.
              </p>
            </div>

            <div className="rounded-2xl bg-black/25 border border-white/10 p-3 mb-4 space-y-1.5 text-sm">
              <div className="flex items-center gap-2"><span className="text-emerald-400">●</span><span className="text-white font-semibold">{hostName}</span><span className="text-white/40 text-xs">(host)</span></div>
              {friends.map(f => (
                <div key={f.id} className="flex items-center gap-2 animate-pop">
                  <span className={f.connected ? 'text-emerald-400' : 'text-amber-400'}>●</span>
                  <span className="text-white font-semibold">{f.name}</span>
                  {!f.connected && <span className="text-amber-300/80 text-xs">reconnecting…</span>}
                </div>
              ))}
              {friends.length < MAX_SEATS - 1 && (
                <div className="flex items-center gap-2 text-white/30"><span>○</span><span>Waiting for a friend…</span></div>
              )}
            </div>

            <div className="mb-5">
              <span className="block text-white/60 text-xs uppercase tracking-widest mb-1.5">Fill empty seats with bots</span>
              <div className="flex gap-2">
                {Array.from({ length: Math.max(0, maxBots) + 1 }, (_, n) => n).map(n => (
                  <button
                    key={n}
                    onClick={() => setBots(n)}
                    className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all ${
                      effectiveBots === n ? 'bg-[#e8c468] text-[#3b2a05]' : 'bg-white/5 text-white/70 border border-white/15 hover:border-white/40'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={start}
              disabled={!canStart}
              className="w-full py-3.5 rounded-full font-bold text-lg text-[#3b2a05] bg-gradient-to-b from-[#fff3c4] to-[#e8c468] hover:brightness-110 active:scale-[0.98] transition shadow-[0_10px_28px_rgba(232,196,104,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Start game →
            </button>
            {!canStart && <p className="text-center text-white/40 text-xs mt-2">Waiting for a friend (or add a bot) to start.</p>}
            <button onClick={onExit} className="block mx-auto mt-4 text-white/40 hover:text-white/70 text-xs uppercase tracking-widest transition">Close room</button>
          </>
        )}
      </div>
    </div>
  );
}
