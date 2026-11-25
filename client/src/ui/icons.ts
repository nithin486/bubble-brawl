// One icon family for the whole UI: 24×24, solid white shapes with rounded joins (colour comes from the surface they sit on).
const svg = (body: string, attrs = 'fill="#fff"') => `<svg class="ico" viewBox="0 0 24 24" ${attrs} aria-hidden="true">${body}</svg>`;
const line = (body: string) => svg(body, 'fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"');

export const UI = {
  gear: svg('<path d="M10.3 2h3.4l.5 2.7c.6.2 1.2.5 1.7.9l2.6-.9 1.7 3-2.1 1.8a7 7 0 0 1 0 1.9l2.1 1.8-1.7 3-2.6-.9c-.5.4-1.1.7-1.7.9l-.5 2.8h-3.4l-.5-2.8c-.6-.2-1.2-.5-1.7-.9l-2.6.9-1.7-3 2.1-1.8a7 7 0 0 1 0-1.9L3.8 7.7l1.7-3 2.6.9c.5-.4 1.1-.7 1.7-.9zM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z" fill-rule="evenodd"/>'),
  soundOn: svg('<path d="M3 9h4l5-5v16l-5-5H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'),
  soundOff: svg('<path d="M3 9h4l5-5v16l-5-5H3z"/><path d="m16 9 6 6m0-6-6 6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>'),
  friends: svg('<circle cx="8.5" cy="8" r="3.6"/><path d="M2 20c0-3.9 2.9-6.4 6.5-6.4S15 16.1 15 20z"/><circle cx="17" cy="9" r="2.8"/><path d="M16 13.4c3.3-.3 6 2 6 5.6h-5.2c0-2.3-.3-4-0.8-5.6z"/>'),
  star: svg('<path d="m12 2 3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z" fill="#ffd23f" stroke="#7a3d00" stroke-width="1.4" stroke-linejoin="round"/>'),
  coin: svg('<circle cx="12" cy="12" r="9.5" fill="#ffc81e" stroke="#9a5200" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#fff6b0" stroke-width="2.2"/>'),
  crown: svg('<path d="M3 7l5 4 4-7 4 7 5-4-2 12H5z" fill="#ffd23f" stroke="#7a3d00" stroke-width="1.4" stroke-linejoin="round"/>'),
  trophy: svg('<path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/>'),
  bubble: svg('<circle cx="12" cy="12" r="9" fill="#8fe9ff" fill-opacity=".55" stroke="#fff" stroke-width="2"/><circle cx="9" cy="9" r="2.4"/>'),
  gift: svg('<path d="M3 8h18v4H3zM5 13h6v8H5zM13 13h6v8h-6z"/><path d="M12 8S9 2.5 6.8 4.2 8.5 8 12 8zm0 0s3-5.500 5.200-3.800S15.500 8 12 8z" fill="none" stroke="#fff" stroke-width="2"/>'),
  bolt: svg('<path d="M14 2 4 14h6l-1.5 8L20 9h-6.5z"/>'),
  bomb: svg('<circle cx="10.500" cy="14.500" r="7.500"/><path d="m14.500 8 3-3 2 2-3 3z"/><path d="M19 4.500 21 2.500M20 7h2.500M17 4V1.500" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'),
  ammo: svg('<path d="M5 9c0-4 1.500-6 2.500-6S10 5 10 9v8H5zM14 9c0-4 1.500-6 2.500-6S19 5 19 9v8h-5zM5 18.500h5V22H5zM14 18.500h5V22h-5z"/>'),
  rocket: svg('<path d="M14 3c4-1 6-.5 7 0 .5 1 1 3 0 7l-7 7-3-1-3-3-1-3zm2.500 3.500a2 2 0 1 0 0 .1zM6 14l4 4c-1 2.500-3.500 3.500-7 3 .0-3.500 1-6 3-7z"/>'),
  snow: line('<path d="M12 2v20M3.300 7l17.400 10M20.700 7 3.300 17M9.500 3.500 12 6l2.500-2.500M9.500 20.500 12 18l2.500 2.500"/>'),
  shake: line('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4 8v8M2 10.500v3M20 8v8M22 10.500v3"/>'),
  camera: svg('<path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 2.500a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" fill-rule="evenodd"/>'),
  display: svg('<path d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v9h16V6z" fill-rule="evenodd"/><path d="m7 13 3.500-4 2.500 2.500L15.500 9 18 13z"/>'),
  heroes: svg('<circle cx="12" cy="8" r="4.500"/><path d="M4 21c0-4.500 3.500-7.500 8-7.500s8 3 8 7.500z"/>'),
  home: svg('<path d="M12 3 2 11.500h3V21h5v-6h4v6h5v-9.500h3z"/>'),
  play: svg('<path d="M7 4.500v15a1 1 0 0 0 1.500.9l12-7.500a1 1 0 0 0 0-1.800l-12-7.500A1 1 0 0 0 7 4.500z"/>'),
  again: line('<path d="M20 12a8 8 0 1 1-2.500-5.800M19 2.500v4.500h-4.500"/>'),
  left: line('<path d="M15 4 7 12l8 8"/>'),
  right: line('<path d="m9 4 8 8-8 8"/>'),
  lock: svg('<path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zm2 0h6V7a3 3 0 0 0-6 0z" fill="#ffd84a"/>'),
};
