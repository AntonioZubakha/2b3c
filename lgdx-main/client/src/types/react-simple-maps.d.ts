declare module 'react-simple-maps' {
  import type { GeoPath, GeoProjection } from 'd3-geo';
  import type { ReactNode, SVGAttributes } from 'react';

  export interface GeographyStyle {
    default?: React.CSSProperties;
    hover?: React.CSSProperties;
    pressed?: React.CSSProperties;
  }

  export interface GeographyProps extends SVGAttributes<SVGPathElement> {
    geography: unknown;
    style?: GeographyStyle;
  }

  export interface GeographiesRenderProps {
    geographies: unknown[];
    outline?: unknown;
    borders?: unknown[];
    path: GeoPath;
    projection: GeoProjection;
  }

  export interface GeographiesProps extends SVGAttributes<SVGGElement> {
    geography: string | object | unknown[];
    parseGeographies?: (geographies: unknown[]) => unknown[];
    children: (props: GeographiesRenderProps) => ReactNode;
  }

  export interface ComposableMapProps extends SVGAttributes<SVGSVGElement> {
    width?: number;
    height?: number;
    projection?: string | (() => GeoProjection);
    projectionConfig?: Record<string, unknown>;
  }

  export interface MarkerProps extends SVGAttributes<SVGGElement> {
    coordinates: [number, number];
  }

  export interface LineProps extends SVGAttributes<SVGPathElement> {
    from?: [number, number];
    to?: [number, number];
    coordinates?: [number, number][];
  }

  export const ComposableMap: React.ForwardRefExoticComponent<
    ComposableMapProps & React.RefAttributes<SVGSVGElement>
  >;
  export const Geographies: React.ForwardRefExoticComponent<
    GeographiesProps & React.RefAttributes<SVGGElement>
  >;
  export const Geography: React.ForwardRefExoticComponent<
    GeographyProps & React.RefAttributes<SVGPathElement>
  >;
  export const Marker: React.ForwardRefExoticComponent<
    MarkerProps & React.RefAttributes<SVGGElement>
  >;
  export const Line: React.ForwardRefExoticComponent<
    LineProps & React.RefAttributes<SVGPathElement>
  >;
}
