This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Playing with friends

From the home screen choose **Host a room**. Friends join from their own phones by opening the invite link
(use **Text invite** to send it by SMS), scanning the QR code, or typing the 4-letter room code under
**Join a room**. It works over the internet, not just the same Wi-Fi.

How it works: the host's browser runs the game and is the source of truth; friends connect peer-to-peer
(WebRTC via [PeerJS](https://peerjs.com)) and only ever receive their own hand. The host must keep the tab open.
If a friend drops, the host can hand their seat to a bot, or the friend can rejoin from the same tab.

By default the free public PeerJS signalling service is used (only for connecting the players; no game data
passes through it). To self-host a signalling server (`npx peerjs --port 9000`), set these at build time:
`NEXT_PUBLIC_PEER_HOST`, `NEXT_PUBLIC_PEER_PORT`, `NEXT_PUBLIC_PEER_PATH`, `NEXT_PUBLIC_PEER_SECURE`.
