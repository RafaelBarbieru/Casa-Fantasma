// true in `npm run dev`; tools/build.mjs rewrites this file to `false` in dist/ and leaves out debug.js.
// Gates every debug tool and cheat: the debug overlay + its keys, ?debug, ?seed, ?level, window.casa.
export const DEV = true;
