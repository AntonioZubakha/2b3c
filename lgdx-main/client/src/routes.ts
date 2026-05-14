import { useCallback } from "react";
import {
  // eslint-disable-next-line no-restricted-imports
  useNavigate as useRRNavigate,
  // eslint-disable-next-line no-restricted-imports
  // eslint-disable-next-line no-restricted-imports
  NavLink as RRNavLink,
  // eslint-disable-next-line no-restricted-imports
  Link as RRLink,
  // eslint-disable-next-line no-restricted-imports
  Route as RRRoute,
  // eslint-disable-next-line no-restricted-imports
  Navigate as RRNavigate,
  // eslint-disable-next-line no-restricted-imports
  useSearchParams as useRRSearchParams,
  // eslint-disable-next-line no-restricted-imports
  useLocation as useRRLocation,
  // eslint-disable-next-line no-restricted-imports
  useParams as useRRParams,
  // eslint-disable-next-line no-restricted-imports
  Outlet as RROutlet,
  // eslint-disable-next-line no-restricted-imports
  Routes as RRRoutes,
  // eslint-disable-next-line no-restricted-imports
  BrowserRouter as RRBrowserRouter,
  LinkProps as RRLinkProps,
} from "react-router-dom";
import { NavigateOptions } from "react-router";
import { ComponentProps, FC } from "react";

type Routes = {
  "/": undefined;
  "/about-us": undefined;
  "/for-experts": undefined;
  "/for-experts/color-grading": undefined;
  "/for-experts/colors-of-lab-grown-diamonds": undefined;
  "/for-experts/differences": undefined;
  "/accept-invite": undefined;
  "/admin-panel": undefined;
  "/cart": undefined;
  "/catalog": undefined;
  "/category-stats": undefined;
  "/login": undefined;
  "/logist-dashboard": undefined;
  "/market-overview": undefined;
  "/my-company": undefined;
  "/my-deals": undefined;
  "/notifications": undefined;
  "/privacy-policy": undefined;
  "/faq": undefined;
  "/for-suppliers": undefined;
  "/for-buyers": undefined;
  "/register": undefined;
  "/reset-password": undefined;
  "/terms-of-use": undefined;
  "/verify-email": undefined;
  "/verify-phone": { phone: string };
};

type RoutesWithParams = {
  "/admin-panel/configure-api": undefined;
  "/deal": undefined;
};

// NOTE: `*` is used only in <Route path="*"> for catch-all (404) routes.
export type Path = keyof Routes | `${keyof RoutesWithParams}/${string}` | "*";

type PathObj<T extends Path = Path> = {
  pathname: T;
  params: T extends keyof Routes
    ? Routes[T]
    : T extends keyof RoutesWithParams
      ? RoutesWithParams[T]
      : never;
  hash: string;
};

export function useNavigate() {
  const navigate = useRRNavigate();
  // Wrap in useCallback so the returned function has a stable reference across renders.
  // Without this, any useEffect that lists `navigate` as a dependency would re-fire
  // on every render (because a plain inline arrow function is a new object each time),
  // causing infinite fetch loops in pages like CartPage.
  return useCallback(
    (to: Path | Partial<PathObj>, options?: NavigateOptions) => {
      if (typeof to !== "string") {
        const { params, ...rest } = to;
        const search = params
          ? `?${new URLSearchParams(params).toString()}`
          : "";
        return navigate(
          {
            ...rest,
            search,
          },
          options,
        );
      }
      return navigate(to, options);
    },
    [navigate],
  );
}

export const NavLink = RRNavLink as FC<
  { to: Path } & ComponentProps<typeof RRNavLink>
>;
export const Link = RRLink as FC<{ to: Path } & ComponentProps<typeof RRLink>>;
export const Route = RRRoute as FC<
  { path?: Path } & ComponentProps<typeof RRRoute>
>;
export const Navigate = RRNavigate as FC<
  { to: Path } & ComponentProps<typeof RRNavigate>
>;

// Re-export hooks and components that don't need path typing
export const useSearchParams = useRRSearchParams;
export const useLocation = useRRLocation;
export const useParams = useRRParams;
export const Outlet = RROutlet;
export const Routes = RRRoutes;
export const BrowserRouter = RRBrowserRouter;

export type LinkProps = RRLinkProps & { to: Path };
