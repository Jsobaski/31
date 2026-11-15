import type { BotMove, GameState } from './types';

// ─── Wire protocol ────────────────────────────────────────────────────────────
// The host's browser is authoritative: it runs the engine and sends each friend
// a redacted view (their hand only). Friends send intents; the host validates them.

export const MAX_SEATS = 4;

export interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
}

export interface LobbyInfo {
  code: string;
  host: string;
  players: LobbyPlayer[]; // friends only
}

export type HostMsg =
  | { t: 'lobby'; info: LobbyInfo; you: string }
  | { t: 'state'; game: GameState; seat: number; moves: Record<string, BotMove>; you: string }
  | { t: 'rejected'; reason: string };

export type ClientAction =
  | { t: 'draw'; from: 'stock' | 'discard' }
  | { t: 'knock' }
  | { t: 'discard'; cardId: string };

export type ClientMsg = { t: 'join'; name: string; token: string } | { t: 'ping' } | ClientAction;

// Friends ping every few seconds so the host notices a dead phone quickly
// (WebRTC alone can take 30s+ to report a vanished peer).
export const PING_EVERY_MS = 3000;
export const OFFLINE_AFTER_MS = 12000;

/** Host-side bridge handed to the game board. */
export interface HostNet {
  publish(game: GameState, moves: Record<string, BotMove>): void;
  subscribe(fn: (playerId: string, action: ClientAction) => void): () => void;
}

// ─── Room codes + PeerJS config ───────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O

export function makeRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

export const peerIdFor = (code: string) => `thirtyone-${code}`;

// Defaults to the free public PeerJS signalling cloud. Override at build time to
// self-host (NEXT_PUBLIC_PEER_HOST / _PORT / _PATH / _SECURE).
export function peerOptions(): Record<string, unknown> {
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  if (!host) return {};
  return {
    host,
    port: Number(process.env.NEXT_PUBLIC_PEER_PORT ?? 443),
    path: process.env.NEXT_PUBLIC_PEER_PATH ?? '/',
    secure: process.env.NEXT_PUBLIC_PEER_SECURE !== 'false',
  };
}

export const CONN_OPTIONS = { serialization: 'json', reliable: true } as const;

/** Loads PeerJS on demand (browser only) so it never touches the server bundle. */
export async function loadPeer() {
  const mod = await import('peerjs');
  return mod.Peer;
}
