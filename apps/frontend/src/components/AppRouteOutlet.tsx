import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isStoneeStaffRole, isSupplierRole } from '@stonee/shared-types';

/**
 * Role-based redirects: suppliers stay in `/supplier/*` (except auth); buyers cannot open `/merchant`.
 */
export default function AppRouteOutlet() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem('userRole') || '';
    const path = location.pathname;

    if (isSupplierRole(role)) {
      const allowed = path.startsWith('/supplier') || path === '/auth';
      if (!allowed) {
        navigate('/supplier/portal', { replace: true });
      }
      return;
    }

    if (!isStoneeStaffRole(role) && path.startsWith('/merchant')) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate]);

  return <Outlet />;
}
