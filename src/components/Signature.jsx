/* ============================================================================
   SIGNATURE — the shared footer mark.
   ============================================================================
   Both source apps end their account screen with the same pixel critter at 46px
   above "made with the loving help of Claude" — but each keeps its own copy
   (Budget in components/ClaudeCritter.jsx, Plant inlined in pages/Account.jsx),
   and the two had already drifted in how the caption was styled. One copy here.

   Deliberately not themed: the critter's blue and terracotta are the signature,
   not the app's brand, so they stay literal in every theme.
   ========================================================================== */

export function ClaudeCritter(props) {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         shapeRendering="crispEdges" aria-hidden="true" {...props}>
      <g fill="#2293F5">
        <rect x="52" y="0"  width="16" height="40" />
        <rect x="40" y="12" width="40" height="16" />
        <rect x="97" y="9"  width="10" height="27" />
        <rect x="89" y="17" width="26" height="10" />
        <rect x="77" y="30" width="9"  height="9"  />
      </g>
      <g fill="#CC785C">
        <rect x="15"  y="45"  width="90" height="60" />
        <rect x="0"   y="82"  width="15" height="16" />
        <rect x="105" y="82"  width="15" height="16" />
        <rect x="23"  y="105" width="8"  height="15" />
        <rect x="38"  y="105" width="8"  height="15" />
        <rect x="74"  y="105" width="8"  height="15" />
        <rect x="89"  y="105" width="8"  height="15" />
      </g>
      <rect x="30" y="59" width="8" height="16" fill="#000" />
      <rect x="82" y="59" width="8" height="16" fill="#000" />
    </svg>
  )
}

/** Footer mark + caption. Pass the build stamp as children. */
export function Signature({ children }) {
  return (
    <footer className="signature">
      <ClaudeCritter width={46} height={46} />
      <p>made with the loving help of Claude</p>
      {children && <p className="signature-build">{children}</p>}
    </footer>
  )
}
