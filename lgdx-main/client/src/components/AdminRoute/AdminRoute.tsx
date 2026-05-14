import React from 'react';
import { Outlet, useLocation, Navigate } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner/LoadingSpinner';

const AdminRoute: React.FC = () => {
  const { isAuthenticated, isLoading, isLgdealSupervisor } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Checking admin access..." />;
  }

  // Check if user is authorized (has admin privileges)
  if (!isAuthenticated || !isLgdealSupervisor) {
    // If the user is not an admin/LGDEAL supervisor, redirect to the login page
    // Save the current location to return here after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If authorized and has rights, render the child component (AdminPanelPage)
  return <Outlet />;
};

export default AdminRoute; 