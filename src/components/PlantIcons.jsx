// Built-in stylized plant icons — soft matte "3D-ish" SVG in the app palette.
// Used as the default icon for every catalog plant; a Gemini-generated image
// replaces them when the user generates one (Account > Gemini API key).

const P = {
  deep: '#1B4332', olive: '#40916C', mint: '#74C69D', beige: '#D8F3DC',
  pot: '#E8A464', potDark: '#D18C4B', potLight: '#F2BE85',
  soil: '#EFD3A7', soilDark: '#DDB77E',
  rose: '#E5476B', roseLight: '#F27E9B',
  pink: '#F3C9D3', white: '#FDFEFD', yellow: '#F5CE42',
  blue: '#A8CDEB', blueDark: '#7Fb2DC',
}

// Shared soft gradients; ids are prefixed to avoid collisions across icons.
function Defs({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={P.mint} /><stop offset="1" stopColor={P.olive} />
      </linearGradient>
      <linearGradient id={`${id}-leafD`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={P.olive} /><stop offset="1" stopColor={P.deep} />
      </linearGradient>
      <linearGradient id={`${id}-pot`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={P.potLight} /><stop offset="1" stopColor={P.potDark} />
      </linearGradient>
      <linearGradient id={`${id}-soil`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={P.soil} /><stop offset="1" stopColor={P.soilDark} />
      </linearGradient>
      <linearGradient id={`${id}-rose`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={P.roseLight} /><stop offset="1" stopColor={P.rose} />
      </linearGradient>
      <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={P.blue} /><stop offset="1" stopColor={P.blueDark} />
      </linearGradient>
    </defs>
  )
}

function Pot({ id, x = 20, y = 40, w = 24, h = 16 }) {
  const lip = 4
  return (
    <g>
      <rect x={x - 2} y={y} width={w + 4} height={lip + 2} rx={2.5} fill={`url(#${id}-pot)`} />
      <path d={`M ${x + 2} ${y + lip + 2} L ${x + w - 2} ${y + lip + 2} L ${x + w - 5} ${y + h} Q ${x + w / 2} ${y + h + 3} ${x + 5} ${y + h} Z`} fill={`url(#${id}-pot)`} />
      <ellipse cx={x + w * 0.32} cy={y + lip + 6} rx={3} ry={4.5} fill={P.potLight} opacity="0.5" />
    </g>
  )
}

const wrap = (id, children) => (props) => (
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" {...props}>
    <Defs id={id} />
    {children(id)}
  </svg>
)

export const Sprout = wrap('spr', id => (
  <g>
    <path d="M20 46 Q32 40 44 46 L41 54 Q32 58 23 54 Z" fill={`url(#${id}-soil)`} />
    <ellipse cx="32" cy="46" rx="12" ry="4" fill={P.soil} />
    <path d="M31 46 L31 32 Q31 28 34 26" stroke={P.olive} strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M32 30 Q22 30 20 20 Q31 19 34 28 Z" fill={`url(#${id}-leaf)`} />
    <path d="M33 28 Q35 18 46 18 Q45 29 35 30 Z" fill={`url(#${id}-leafD)`} />
  </g>
))

export const Monstera = wrap('mon', id => (
  <g>
    <Pot id={id} x={22} y={42} w={20} h={14} />
    <path d="M32 42 L30 32 M32 42 L38 30 M32 42 L24 30" stroke={P.deep} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    <path d="M24 31 Q12 28 14 16 Q28 15 28 28 Q28 31 24 31 Z" fill={`url(#${id}-leaf)`} />
    <circle cx="20" cy="23" r="2.2" fill={P.beige} />
    <circle cx="24" cy="20" r="1.6" fill={P.beige} />
    <path d="M38 29 Q50 26 50 14 Q36 13 35 26 Q35 29 38 29 Z" fill={`url(#${id}-leafD)`} />
    <circle cx="44" cy="21" r="2.2" fill={P.beige} />
    <circle cx="41" cy="18" r="1.5" fill={P.beige} />
    <path d="M30 32 Q24 22 32 14 Q40 22 33 32 Z" fill={`url(#${id}-leaf)`} />
    <circle cx="32" cy="22" r="2" fill={P.beige} />
  </g>
))

export const PeaceLily = wrap('pl', id => (
  <g>
    <Pot id={id} x={22} y={42} w={20} h={14} />
    <path d="M32 42 Q22 34 20 22 Q32 24 33 40 Z" fill={`url(#${id}-leafD)`} />
    <path d="M33 42 Q44 36 46 24 Q33 25 32 40 Z" fill={`url(#${id}-leaf)`} />
    <path d="M32 40 L34 20" stroke={P.olive} strokeWidth="2.2" strokeLinecap="round" />
    <path d="M34 22 Q26 16 31 8 Q42 10 38 20 Q36 23 34 22 Z" fill={P.white} />
    <ellipse cx="35.5" cy="16" rx="1.8" ry="3.4" fill={P.yellow} />
  </g>
))

export const SnakePlant = wrap('sp', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    <path d="M28 44 Q24 30 27 16 Q31 30 31 44 Z" fill={`url(#${id}-leafD)`} />
    <path d="M32 44 Q31 26 35 10 Q38 28 35 44 Z" fill={`url(#${id}-leaf)`} />
    <path d="M37 44 Q40 32 44 22 Q43 36 40 44 Z" fill={`url(#${id}-leafD)`} />
    <path d="M24 44 Q21 36 20 28 Q25 36 27 44 Z" fill={`url(#${id}-leaf)`} />
    <path d="M34.6 14 Q37 26 35.3 40" stroke={P.yellow} strokeWidth="1.3" fill="none" opacity="0.7" />
  </g>
))

export const Cactus = wrap('cac', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    <rect x="28" y="16" width="9" height="30" rx="4.5" fill={`url(#${id}-leaf)`} />
    <path d="M24 26 q-5 0 -5 -5 q0 -3 3 -3 q4 0 4 5 l0 5 q0 3 3 3 l1 0" fill="none" stroke={`url(#${id}-leafD)`} strokeWidth="5" strokeLinecap="round" />
    <path d="M41 22 q5 0 5 -4 q0 -3 -3 -3 q-4 0 -4 5 l0 6 q0 3 -3 3 l-1 0" fill="none" stroke={`url(#${id}-leafD)`} strokeWidth="5" strokeLinecap="round" />
    {[20, 26, 32, 38].map(y => <circle key={y} cx={32.5 + (y % 12 === 2 ? 2 : -1)} cy={y} r="0.9" fill={P.beige} />)}
  </g>
))

export const Succulent = wrap('suc', id => (
  <g>
    <Pot id={id} x={21} y={43} w={22} h={14} />
    <ellipse cx="32" cy="40" rx="13" ry="6" fill={`url(#${id}-leafD)`} />
    <path d="M32 43 Q18 40 22 28 Q31 30 32 41 Z" fill={`url(#${id}-leaf)`} />
    <path d="M32 43 Q46 40 42 28 Q33 30 32 41 Z" fill={`url(#${id}-leaf)`} />
    <path d="M32 42 Q25 32 32 24 Q39 32 32 42 Z" fill={`url(#${id}-leafD)`} />
    <ellipse cx="32" cy="36" rx="4" ry="5" fill={P.mint} />
  </g>
))

export const Bonsai = wrap('bon', id => (
  <g>
    <path d="M20 48 L44 48 L41 56 Q32 58 23 56 Z" fill={`url(#${id}-pot)`} />
    <rect x="18" y="45" width="28" height="5" rx="2.5" fill={`url(#${id}-pot)`} />
    <path d="M31 45 Q30 36 26 32 M31 45 Q33 34 39 28" stroke="#7A5236" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    <ellipse cx="24" cy="28" rx="8" ry="6" fill={`url(#${id}-leaf)`} />
    <ellipse cx="40" cy="22" rx="9" ry="7" fill={`url(#${id}-leafD)`} />
    <ellipse cx="32" cy="16" rx="6" ry="4.5" fill={`url(#${id}-leaf)`} />
  </g>
))

export const Tree = wrap('tr', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    <path d="M32 44 L32 28" stroke="#7A5236" strokeWidth="3.5" strokeLinecap="round" />
    <ellipse cx="32" cy="20" rx="13" ry="12" fill={`url(#${id}-leafD)`} />
    <ellipse cx="26" cy="17" rx="6" ry="5" fill={`url(#${id}-leaf)`} opacity="0.9" />
  </g>
))

export const Fern = wrap('fer', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    {[-40, -20, 0, 20, 40].map((a, i) => (
      <g key={a} transform={`rotate(${a} 32 44)`}>
        <path d="M32 44 Q32 28 32 18" stroke={i % 2 ? P.olive : P.mint} strokeWidth="2" fill="none" strokeLinecap="round" />
        {[24, 30, 36].map(y => (
          <g key={y}>
            <ellipse cx="29" cy={y} rx="3.4" ry="1.8" fill={i % 2 ? `url(#${id}-leaf)` : `url(#${id}-leafD)`} />
            <ellipse cx="35" cy={y - 3} rx="3.4" ry="1.8" fill={i % 2 ? `url(#${id}-leaf)` : `url(#${id}-leafD)`} />
          </g>
        ))}
      </g>
    ))}
  </g>
))

export const Bamboo = wrap('bam', id => (
  <g>
    {[[24, 18, 40], [33, 10, 46], [42, 22, 40]].map(([x, top, h]) => (
      <g key={x}>
        <rect x={x - 3.5} y={top} width="7" height={h} rx="3.5" fill={`url(#${id}-leaf)`} />
        {[top + h * 0.33, top + h * 0.66].map(y => <rect key={y} x={x - 3.5} y={y} width="7" height="2" rx="1" fill={P.olive} />)}
      </g>
    ))}
    <path d="M27 26 Q20 22 16 26 Q21 31 27 28 Z" fill={`url(#${id}-leafD)`} />
    <path d="M37 18 Q44 13 49 17 Q44 23 37 21 Z" fill={`url(#${id}-leafD)`} />
    <ellipse cx="33" cy="58" rx="15" ry="3" fill={P.beige} />
  </g>
))

export const Rose = wrap('ros', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    <path d="M32 44 L31 26" stroke={P.olive} strokeWidth="2.5" strokeLinecap="round" />
    <path d="M31 36 Q24 34 22 28 Q29 28 32 33 Z" fill={`url(#${id}-leaf)`} />
    <path d="M32 39 Q39 37 41 31 Q34 31 31 36 Z" fill={`url(#${id}-leafD)`} />
    <circle cx="31" cy="19" r="8.5" fill={`url(#${id}-rose)`} />
    <path d="M31 12 Q37 15 36 21 Q34 26 28 25 Q24 22 26 17 Q28 13 31 12" fill="none" stroke={P.rose} strokeWidth="1.6" opacity="0.65" />
    <circle cx="31" cy="19" r="3" fill={P.pink} />
  </g>
))

export const Tulip = wrap('tul', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    <path d="M28 44 Q27 32 26 24 M36 44 Q37 34 38 26" stroke={P.olive} strokeWidth="2.2" fill="none" strokeLinecap="round" />
    <path d="M26 24 m-6 0 q0 -8 6 -9 q6 1 6 9 q-3 4 -6 4 q-3 0 -6 -4" fill={P.white} />
    <path d="M23 17 Q26 21 26 26 M29 17 Q26 21 26 26" stroke={P.pink} strokeWidth="1.4" fill="none" />
    <path d="M38 26 m-5.4 0 q0 -7 5.4 -8 q5.4 1 5.4 8 q-2.7 3.6 -5.4 3.6 q-2.7 0 -5.4 -3.6" fill={P.pink} />
    <path d="M30 40 Q24 38 23 33 Q29 33 31 38 Z" fill={`url(#${id}-leaf)`} />
  </g>
))

export const FlowerBunch = wrap('fb', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    <path d="M28 44 L26 30 M32 44 L32 26 M36 44 L38 30" stroke={P.olive} strokeWidth="2" fill="none" strokeLinecap="round" />
    {[[26, 27], [32, 22], [38, 27]].map(([x, y], i) => (
      <g key={i}>
        {[0, 72, 144, 216, 288].map(a => (
          <ellipse key={a} cx={x} cy={y - 4.2} rx="2.6" ry="4" fill={i === 1 ? P.white : P.pink} transform={`rotate(${a} ${x} ${y})`} />
        ))}
        <circle cx={x} cy={y} r="2.4" fill={P.yellow} />
      </g>
    ))}
  </g>
))

export const Daisy = wrap('dsy', id => (
  <g>
    <path d="M27 58 Q24 44 22 36 M32 58 Q33 42 34 30 M38 58 Q41 46 43 38" stroke={`url(#${id}-leaf)`} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    {[[22, 32], [34, 25], [43, 33]].map(([x, y], i) => (
      <g key={i}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
          <ellipse key={a} cx={x} cy={y - 5} rx="2.4" ry="4.6" fill={P.white} transform={`rotate(${a} ${x} ${y})`} />
        ))}
        <circle cx={x} cy={y} r="3" fill={P.yellow} />
      </g>
    ))}
  </g>
))

export const LeafVine = wrap('lv', id => (
  <g>
    <path d="M18 52 Q34 46 44 30" stroke={P.olive} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path d="M22 50 Q10 46 12 34 Q26 35 26 47 Q26 50 22 50 Z" fill={`url(#${id}-leaf)`} />
    <path d="M36 40 Q28 32 34 22 Q44 28 41 38 Q39 41 36 40 Z" fill={`url(#${id}-leafD)`} />
    <path d="M44 30 Q42 18 50 12 Q56 22 49 29 Q46 31 44 30 Z" fill={`url(#${id}-leaf)`} />
  </g>
))

export const Grassy = wrap('gr', id => (
  <g>
    <path d="M18 52 Q32 46 46 52 L43 58 Q32 61 21 58 Z" fill={`url(#${id}-soil)`} />
    <path d="M30 52 Q26 36 18 28 Q30 32 33 50 Z" fill={`url(#${id}-leafD)`} />
    <path d="M32 52 Q32 32 30 18 Q38 32 35 52 Z" fill={`url(#${id}-leaf)`} />
    <path d="M35 52 Q40 38 48 30 Q42 46 37 53 Z" fill={`url(#${id}-leafD)`} />
    <path d="M27 52 Q22 44 16 40 Q24 48 26 53 Z" fill={`url(#${id}-leaf)`} />
  </g>
))

export const Palm = wrap('pm', id => (
  <g>
    <Pot id={id} x={22} y={44} w={20} h={13} />
    <path d="M32 44 Q31 34 32 28" stroke="#7A5236" strokeWidth="3" fill="none" strokeLinecap="round" />
    {[[-70, 'leafD'], [-35, 'leaf'], [0, 'leafD'], [35, 'leaf'], [70, 'leafD']].map(([a, g]) => (
      <path key={a} d="M32 28 Q32 14 32 10 Q38 16 36 26 Z" fill={`url(#${id}-${g})`} transform={`rotate(${a} 32 28)`} />
    ))}
  </g>
))

export const WateringCan = wrap('wc', id => (
  <g>
    <path d="M22 26 L42 26 L40 48 Q31 51 24 48 Z" fill={`url(#${id}-blue)`} />
    <rect x="20" y="23" width="24" height="6" rx="3" fill={P.blue} />
    <path d="M24 32 Q12 34 12 26" stroke={P.blueDark} strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="12" cy="25" r="3.4" fill={P.white} />
    <path d="M42 30 Q52 26 54 36" stroke={P.white} strokeWidth="4.5" fill="none" strokeLinecap="round" />
    <ellipse cx="29" cy="34" rx="2.6" ry="5" fill={P.white} opacity="0.45" />
  </g>
))

export const SprayBottle = wrap('sb', id => (
  <g>
    <path d="M26 30 L38 30 L39 52 Q32 55 25 52 Z" fill={`url(#${id}-blue)`} />
    <rect x="28" y="22" width="8" height="9" rx="2" fill={P.white} />
    <path d="M28 22 L40 22 L40 17 L30 17 Q28 17 28 20 Z" fill={P.white} />
    <rect x="40" y="17.5" width="4" height="4" rx="1.4" fill={P.blueDark} />
    <rect x="27" y="36" width="10" height="10" rx="3" fill={P.white} opacity="0.75" />
    {[[48, 14], [51, 18], [48, 22]].map(([x, y]) => <circle key={y} cx={x} cy={y} r="1.4" fill={P.blueDark} opacity="0.7" />)}
  </g>
))

export const Avatar = wrap('av', id => (
  <g>
    <circle cx="32" cy="32" r="30" fill={P.beige} />
    <circle cx="32" cy="26" r="11" fill="#F2C9A8" />
    <path d="M21 26 Q20 12 32 12 Q44 12 43 26 Q43 18 32 17 Q21 18 21 26 Z" fill="#6B4A32" />
    <path d="M14 56 Q18 40 32 40 Q46 40 50 56 Q41 62 32 62 Q23 62 14 56 Z" fill={`url(#${id}-leafD)`} />
    <path d="M46 20 Q54 14 58 18 Q54 26 47 24 Z" fill={`url(#${id}-leaf)`} />
    <circle cx="28" cy="26" r="1.4" fill={P.deep} />
    <circle cx="36" cy="26" r="1.4" fill={P.deep} />
    <path d="M29 31 Q32 33 35 31" stroke={P.deep} strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </g>
))

const ICONS = {
  sprout: Sprout, monstera: Monstera, peaceLily: PeaceLily, snakePlant: SnakePlant,
  cactus: Cactus, succulent: Succulent, bonsai: Bonsai, tree: Tree, fern: Fern,
  bamboo: Bamboo, rose: Rose, tulip: Tulip, flowerBunch: FlowerBunch, daisy: Daisy,
  leafVine: LeafVine, grassy: Grassy, palm: Palm,
}

export function PlantIcon({ icon, ...props }) {
  const Cmp = ICONS[icon] || Sprout
  return <Cmp {...props} />
}
