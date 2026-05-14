import React, { memo, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import type { GeoPath } from 'd3-geo';
import countriesTopology from 'world-atlas/countries-110m.json';
import styles from './GlobalTradingNetworkSection.module.css';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';

type City = {
  id: string;
  name: string;
  /** [longitude, latitude] WGS84 */
  coord: [number, number];
  transform?: string;
};

type Route = {
  id: string;
  from: string;
  to: string;
  durationMs: number;
  delayMs: number;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 520;

const ROUTE_GLOW_TIMING: Record<string, string> = {
  r1: styles.routeGlowR1,
  r2: styles.routeGlowR2,
  r3: styles.routeGlowR3,
  r4: styles.routeGlowR4,
  r5: styles.routeGlowR5,
  r6: styles.routeGlowR6,
  r7: styles.routeGlowR7,
  r8: styles.routeGlowR8,
  r9: styles.routeGlowR9,
  r10: styles.routeGlowR10,
  r11: styles.routeGlowR11,
  r12: styles.routeGlowR12,
  r13: styles.routeGlowR13,
};

/** Spherical linear interpolation along a great circle (accurate flight arcs). */
function greatCircleCoordinates(
  start: [number, number],
  end: [number, number],
  segments = 56
): [number, number][] {
  const lon1 = (start[0] * Math.PI) / 180;
  const lat1 = (start[1] * Math.PI) / 180;
  const lon2 = (end[0] * Math.PI) / 180;
  const lat2 = (end[1] * Math.PI) / 180;

  const cosLat1 = Math.cos(lat1);
  const x1 = cosLat1 * Math.cos(lon1);
  const y1 = cosLat1 * Math.sin(lon1);
  const z1 = Math.sin(lat1);

  const cosLat2 = Math.cos(lat2);
  const x2 = cosLat2 * Math.cos(lon2);
  const y2 = cosLat2 * Math.sin(lon2);
  const z2 = Math.sin(lat2);

  let dot = x1 * x2 + y1 * y2 + z1 * z2;
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);

  if (!Number.isFinite(omega) || omega < 1e-8) {
    return [start, end];
  }

  const sinOmega = Math.sin(omega);
  const out: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const s0 = Math.sin((1 - t) * omega) / sinOmega;
    const s1 = Math.sin(t * omega) / sinOmega;
    const x = s0 * x1 + s1 * x2;
    const y = s0 * y1 + s1 * y2;
    const z = s0 * z1 + s1 * z2;
    const lat = Math.atan2(z, Math.hypot(x, y));
    const lon = Math.atan2(y, x);
    out.push([(lon * 180) / Math.PI, (lat * 180) / Math.PI]);
  }
  return out;
}

function routePathD(path: GeoPath, coords: [number, number][]): string {
  const d = path({
    type: 'LineString',
    coordinates: coords,
  });
  return typeof d === 'string' ? d : '';
}

const GlobalTradingNetworkSection: React.FC = memo(() => {
  const cities = useMemo<City[]>(
    () => [
      { id: 'new_york', name: 'New York', coord: [-74.006, 40.7128], transform: 'translate(0 30)' },
      { id: 'antwerp', name: 'Antwerp', coord: [4.4024, 51.2194], transform: 'translate(0 32)' },
      { id: 'tel_aviv', name: 'Tel Aviv', coord: [34.7818, 32.0853], transform: 'translate(-40 26)' },
      { id: 'dubai', name: 'Dubai', coord: [55.2708, 25.2048], transform: 'translate(-25 40)' },
      { id: 'mumbai', name: 'Mumbai', coord: [72.8777, 19.076], transform: 'translate(0 46)' },
      { id: 'singapore', name: 'Singapore', coord: [103.8198, 1.3521], transform: 'translate(0 26)' },
      { id: 'los_angeles', name: 'Los Angeles', coord: [-118.2437, 34.0522], transform: 'translate(0 35)' },
      { id: 'shanghai', name: 'Shanghai', coord: [121.4737, 31.2304], transform: 'translate(0 26)' },
      { id: 'beijing', name: 'Beijing', coord: [116.4074, 39.9042], transform: 'translate(0 -22)' },
    ],
    []
  );

  const cityById = useMemo(() => new Map(cities.map((c) => [c.id, c])), [cities]);

  const routes = useMemo<Route[]>(
    () => [
      // Stones flow from Mumbai to key hubs
      { id: 'r1', from: 'mumbai', to: 'new_york', durationMs: 5600, delayMs: 0 },
      { id: 'r2', from: 'mumbai', to: 'antwerp', durationMs: 5200, delayMs: 700 },
      { id: 'r3', from: 'mumbai', to: 'singapore', durationMs: 4200, delayMs: 1100 },
      { id: 'r4', from: 'mumbai', to: 'dubai', durationMs: 3600, delayMs: 1500 },
      { id: 'r5', from: 'mumbai', to: 'tel_aviv', durationMs: 4400, delayMs: 1800 },
      { id: 'r6', from: 'mumbai', to: 'los_angeles', durationMs: 4800, delayMs: 2200 },
      { id: 'r7', from: 'mumbai', to: 'shanghai', durationMs: 5000, delayMs: 2900 },
      { id: 'r8', from: 'mumbai', to: 'beijing', durationMs: 5100, delayMs: 3200 },
      { id: 'r9', from: 'mumbai', to: 'london', durationMs: 5200, delayMs: 4100 },
    ],
    []
  );

  const geoStyle = useMemo(
    () => ({
      default: {
        fill: 'rgba(30, 41, 59, 0.72)',
        stroke: 'rgba(34, 211, 238, 0.22)',
        strokeWidth: 0.45,
        outline: 'none',
      },
      hover: {
        fill: 'rgba(30, 41, 59, 0.72)',
        stroke: 'rgba(34, 211, 238, 0.22)',
        strokeWidth: 0.45,
        outline: 'none',
      },
      pressed: {
        fill: 'rgba(30, 41, 59, 0.72)',
        stroke: 'rgba(34, 211, 238, 0.22)',
        strokeWidth: 0.45,
        outline: 'none',
      },
    }),
    []
  );

  return (
    <section className={styles.section} aria-label="Global Trading Network">
      <div className={styles.inner}>
        <div className="animateOnScroll">
          <HomeSectionHeader
            title={
              <>
                Global Trading <span className="homeAccent">Network</span>
              </>
            }
            subtitle={
              <>
              </>
            }
          />
        </div>

        <div className={styles.card} role="img" aria-label="World map with animated routes between trading hubs">
          <div className={styles.cardTopGlow} aria-hidden="true" />
          <ComposableMap
            className={styles.mapSvg}
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            projection="geoEqualEarth"
            projectionConfig={{
              scale: 168,
              center: [12, 4],
            }}
          >
            <defs>
              <linearGradient id="gtnRouteGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(34, 211, 238, 0.0)" />
                <stop offset="35%" stopColor="rgba(34, 211, 238, 0.95)" />
                <stop offset="65%" stopColor="rgba(129, 140, 248, 0.9)" />
                <stop offset="100%" stopColor="rgba(167, 139, 250, 0.0)" />
              </linearGradient>
              <radialGradient id="gtnCityGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                <stop offset="28%" stopColor="rgba(34,211,238,0.9)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.0)" />
              </radialGradient>
            </defs>
            <Geographies
              geography={countriesTopology as object}
              parseGeographies={(geos) =>
                (geos as { properties?: { name?: string } }[]).filter(
                  (g) => g.properties?.name !== 'Antarctica'
                )
              }
            >
              {({ geographies, path }) => (
                <>
                  <g className={styles.landmasses} aria-hidden="true">
                    {geographies.map((geo) => {
                      const g = geo as { rsmKey: string };
                      return <Geography key={g.rsmKey} geography={geo} style={geoStyle} />;
                    })}
                  </g>

                  <g className={styles.routes} aria-hidden="true">
                    {routes.map((r) => {
                      const a = cityById.get(r.from)?.coord;
                      const b = cityById.get(r.to)?.coord;
                      if (!a || !b) return null;
                      const coords = greatCircleCoordinates(a, b, 64);
                      const d = routePathD(path, coords);
                      if (!d) return null;
                      return (
                        <g key={r.id}>
                          <path d={d} className={styles.routeBase} fill="none" />
                          <path
                            d={d}
                            className={`${styles.routeGlow} ${ROUTE_GLOW_TIMING[r.id] ?? ''}`}
                            fill="none"
                          />
                          <circle className={styles.flightDot} r={3.5}>
                            <animateMotion
                              dur={`${r.durationMs}ms`}
                              begin={`${r.delayMs}ms`}
                              repeatCount="indefinite"
                              path={d}
                              keyTimes="0;1"
                              keySplines="0.2 0.9 0.2 1"
                              calcMode="spline"
                            />
                          </circle>
                        </g>
                      );
                    })}
                  </g>

                  <g className={styles.markers} aria-hidden="true">
                    {cities.map((city) => (
                      <Marker key={city.id} coordinates={city.coord}>
                        <g className={styles.cityMarker}>
                          <circle className={styles.cityPulse} r={14} />
                          <circle className={styles.cityDotOuter} r={7} />
                          <circle className={styles.cityDotInner} r={3} />
                        </g>
                      </Marker>
                    ))}
                  </g>

                  <g className={styles.labels} aria-hidden="true">
                    {cities.map((city) => (
                      <Marker key={`${city.id}_label`} coordinates={city.coord}>
                        <g
                          className={styles.labelGroup}
                          transform={city.transform}
                        >
                          <rect
                            className={styles.labelPill}
                            x={-60}
                            y={-14}
                            rx={10}
                            ry={10}
                            width={120}
                            height={24}
                          />
                          <text className={styles.labelText} x={0} y={0} textAnchor="middle">
                            {city.name}
                          </text>
                        </g>
                      </Marker>
                    ))}
                  </g>

                </>
              )}
            </Geographies>
          </ComposableMap>
        </div>
      </div>
    </section>
  );
});

GlobalTradingNetworkSection.displayName = 'GlobalTradingNetworkSection';

export default GlobalTradingNetworkSection;
