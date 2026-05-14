import React from 'react';
import { Outlet, useLocation, Navigate } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner/LoadingSpinner';

const AuthenticatedRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Checking authentication..." />;
  }

  if (!isAuthenticated) {
    // Перенаправляем на страницу входа, если пользователь не аутентифицирован
    // Сохраняем текущий маршрут, чтобы вернуться после авторизации
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Отображаем дочерний маршрут, если пользователь аутентифицирован
  return <Outlet />;
};

export default AuthenticatedRoute; 