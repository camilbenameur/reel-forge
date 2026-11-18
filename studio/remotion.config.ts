import { Config } from '@remotion/cli/config';
import dns from 'node:dns';

// Node downloads the audio files (http://127.0.0.1:<port>/public/...): resolve addresses
// as IPv4 first, so nothing depends on the IPv6 configuration of the host.
dns.setDefaultResultOrder('ipv4first');

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer('angle');
// Concurrency 2: with 4 tabs, the ffmpeg assembly runs out of memory when about 4 GB are left free.
// `reelforge render` passes --concurrency (REELFORGE_RENDER_CONCURRENCY); this value serves the studio and manual renders.
Config.setConcurrency(2);
// Fixed ports and IPv4 server, so the render and the studio stay reachable in a predictable way.
Config.setRendererPort(4310);
Config.setStudioPort(4311);
Config.setIPv4(true);
