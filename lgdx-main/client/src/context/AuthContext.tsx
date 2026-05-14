import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { User, UserDto, AuthContextType, RegisterUserData, RegisterResult, AuthResponse, userDtoToUser } from '../types';
import { logger } from '../utils/logger';
import { analytics } from '../utils/analytics';
import api from '../api';
import { getCookie } from '../utils/cookies';

interface AuthProviderProps {
  children: ReactNode;
}

interface ImpersonationEventDetail {
  user: UserDto;
  token: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined || context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  
  const [user, setUser] = useState<User | null>(null);
  // JWT moves to HttpOnly cookie; keep token state only for backward compatibility during transition
  const [token, setToken] = useState<string | null>(null);
  // Flag impersonation explicitly instead of relying on deprecated token shadowing
  const [isImpersonating, setIsImpersonating] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start true to load user if token exists
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      logger.debug('AuthContext: Attempting to load user with cookie session...');
      const res = await api.get('/auth/me');
      const userData = userDtoToUser(res.data);
      setUser(userData);
      setIsAuthenticated(true);
      // Determine impersonation flag from any available source for backward compatibility
      const impersonationFlag = (res.data)?.isImpersonation
        || res.data?.user?.isImpersonation
        || userData?.isImpersonation
        || false;
      setIsImpersonating(Boolean(impersonationFlag));
      logger.setUserId(userData._id);
      analytics.setUserId(userData._id);
      if (userData.isImpersonation) {
        analytics.setGaUserId(null);
      } else {
        analytics.setGaUserId(userData._id);
      }
      logger.info('AuthContext: User loaded successfully', { userId: userData._id, email: userData.email });
    } catch (err: unknown) {
      // 401 on /auth/me is expected for anonymous users — no error log, no user-facing message
      if (isAxiosError(err) && err.response?.status === 401) {
        setUser(null);
        setIsAuthenticated(false);
        analytics.setUserId(undefined);
        analytics.setGaUserId(null);
        return;
      }
      // Check if it's a 503 error (Service Unavailable)
      if (isAxiosError(err) && err.response?.status === 503) {
        logger.warn('Auth service unavailable (503), not retrying immediately');
        setError('Service temporarily unavailable. Please try again in a few minutes.');
        return;
      }
      if (isAxiosError(err)) {
        logger.authError('load_user', err, { hasResponse: !!err.response, status: err.response?.status });
        setError(err.response?.data?.message || 'Failed to load user session.');
      } else {
        logger.authError('load_user', err instanceof Error ? err : new Error(String(err)));
        setError('Failed to load user session.');
      }
      setUser(null);
      setIsAuthenticated(false);
      analytics.setUserId(undefined);
      analytics.setGaUserId(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  // Global event bridge so any feature (adminApi) can trigger immediate impersonation state
  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<ImpersonationEventDetail>;
      try { localStorage.setItem('impersonation', '1'); document.cookie = `impersonation=1; path=/; SameSite=Lax`; } catch (error) { /* Silent fail */ }
      setIsImpersonating(true);
      if (customEvent.detail?.user) {
        setUser(userDtoToUser(customEvent.detail.user));
      }
    };
    window.addEventListener('lgdeal:impersonated', handler);
    return () => window.removeEventListener('lgdeal:impersonated', handler);
  }, []);

  // Keep UI banner in sync even if backend user DTO lacks the flag
  useEffect(() => {
    const marker = getCookie('impersonation');
    setIsImpersonating(marker === '1');
  }, [user]);


  const login = useCallback(async (loginValue: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/login', { login: loginValue, password });
      // Server sets HttpOnly cookie; we rely on /me to fetch user
      const userData = userDtoToUser(res.data.user);
      setUser(userData);
      setIsAuthenticated(true);
      setError(null);
      logger.setUserId(userData._id);
      analytics.setUserId(userData._id);
      analytics.setGaUserId(userData._id);
      analytics.trackLogin();
      logger.userAction('login_successful', { userId: userData._id, email: userData.email });
      return true;
    } catch (err: unknown) {
      const axiosErr = isAxiosError(err) ? err : undefined;
      logger.authError('login', err instanceof Error ? err : new Error(String(err)), {
        hasResponse: !!axiosErr?.response,
        status: axiosErr?.response?.status
      });
      const data = axiosErr?.response?.data as
        | { message?: string; error?: { message?: string } }
        | undefined;
      const errorMessage =
        (data?.error && typeof data.error.message === 'string' && data.error.message) ||
        (typeof data?.message === 'string' && data.message) ||
        'Login failed. Please check your credentials.';
      setError(errorMessage);
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      return false; // Indicate failure
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (userData: RegisterUserData): Promise<RegisterResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/register', userData);
      const transformedUserData = userDtoToUser(res.data.user);
      setUser(transformedUserData);
      setIsAuthenticated(true);
      setError(null);
      logger.setUserId(transformedUserData._id);
      analytics.setUserId(transformedUserData._id);
      analytics.setGaUserId(transformedUserData._id);
      analytics.trackSignUp();
      logger.userAction('registration_successful', { 
        userId: transformedUserData._id, 
        email: transformedUserData.email,
        companyName: transformedUserData.companyName 
      });
      return { success: true, user: transformedUserData };
    } catch (err) {
      let errorMessage = 'Registration failed. Please check your details and try again.';

      if (isAxiosError(err)) {
        logger.authError('registration', err, {
          email: userData.email,
          hasResponse: !!err.response,
          status: err.response?.status,
        })
        if (err.response && err.response.data) {
          const serverError = err.response.data as {
            message?: string;
            error?: { message?: string; code?: string };
          };

          const apiMessage =
            (serverError.error && typeof serverError.error.message === 'string' && serverError.error.message) ||
            (typeof serverError.message === 'string' && serverError.message) ||
            '';

          // Filter out technical error messages that shouldn't be shown to users
          if (apiMessage) {
            const technicalMessages = [
              'No token, authorization denied',
              'Authentication required'
            ];
            if (technicalMessages.some((msg) => apiMessage.includes(msg))) {
              errorMessage = 'Please log in to continue.';
            }
          }

          // Handle validation errors with better messages
          if (serverError.error && serverError.error.code === 'VALIDATION_ERROR') {
            const validationMessage = serverError.error.message ?? '';

            // Extract specific validation errors
            if (validationMessage.includes('password:')) {
              if (validationMessage.includes('at least 8 characters')) {
                errorMessage = 'Password must be at least 8 characters long.';
              } else if (validationMessage.includes('lowercase letter')) {
                errorMessage = 'Password must contain at least one lowercase letter.';
              } else if (validationMessage.includes('uppercase letter')) {
                errorMessage = 'Password must contain at least one uppercase letter.';
              } else if (validationMessage.includes('number')) {
                errorMessage = 'Password must contain at least one number.';
              } else {
                errorMessage = 'Password does not meet security requirements. Please ensure it contains at least 8 characters, one uppercase letter, one lowercase letter, and one number.';
              }
            } else if (validationMessage.includes('email:')) {
              errorMessage = 'Please enter a valid email address.';
            } else if (validationMessage.includes('phone:')) {
              errorMessage = 'Please enter a valid phone number in international format (e.g., +1234567890).';
            } else {
              errorMessage = validationMessage || apiMessage || errorMessage;
            }
          } else if (apiMessage) {
            const technicalMessages = [
              'No token, authorization denied',
              'Authentication required'
            ];
            if (!technicalMessages.some((msg) => apiMessage.includes(msg))) {
              errorMessage = apiMessage;
            }
          }
        }
      }

      setError(errorMessage);
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    logger.info('AuthContext: Logging out...');
    setIsLoading(true);
    try {
        // Clear HttpOnly cookies server-side
        await api.post('/auth/logout');
    } catch (err) {
        logger.error('AuthContext: Logout API call failed (continuing with client-side logout)', err as Error);
    } finally {
        const userId = user?._id;
        setUser(null);
        setIsAuthenticated(false);
        setError(null);
        setIsImpersonating(false);
        setIsLoading(false);
        analytics.setUserId(undefined);
        analytics.setGaUserId(null);
        logger.userAction('logout', { userId });
    }
  }, [user?._id]);

  const impersonate = useCallback(async (userId: string): Promise<void> => {
    // Use admin endpoint; server will set HttpOnly cookie
    try {
      const resp = await api.get<{ token: string; user: UserDto; isImpersonation?: boolean }>(`/admin/impersonate/${userId}`);
      // Local fallback marker in case cookie propagation is delayed
      try {
        localStorage.setItem('impersonation', '1');
        // Also set a non-HttpOnly cookie immediately for the banner
        document.cookie = `impersonation=1; path=/; SameSite=Lax`;
      } catch (error) { /* Silent fail */ }
      setIsImpersonating(true);
      // Optimistically update user in context to avoid waiting for extra /me roundtrip
      if (resp.data?.user) {
        const impersonatedUser = userDtoToUser(resp.data.user);
        setUser(impersonatedUser);
      }
      await loadUser();
    } catch (e) {
      logger.error('AuthContext: Impersonation failed', e as Error);
    }
  }, [loadUser]);

  const stopImpersonating = useCallback(async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
      // If server switched us back to admin, keep logged-in state and clear markers
      try { localStorage.removeItem('impersonation'); } catch (error) { /* Silent fail */ }
      try { document.cookie = `impersonation=; Max-Age=0; path=/; SameSite=Lax`; } catch (error) { /* Silent fail */ }
      setIsImpersonating(false);
      await loadUser();
    } catch (e) {
      logger.error('AuthContext: Stop impersonation failed', e as Error);
    }
  }, [loadUser]);

  // Function to manually set an error, e.g., from other parts of the app
  const setAuthError = useCallback((errorMessage: string): void => {
    setError(errorMessage);
  }, []);

  // LGDEAL supervisor access: derived only from company (LGDeal INC) + role (supervisor or admin), no stored flag
  const isLgdealSupervisor = useMemo(() => {
    if (!user) return false;
    const companyName = typeof user.company === 'object' && user.company && 'name' in user.company
      ? (user.company as { name: string }).name
      : undefined;
    return (user.role === 'admin' || user.role === 'supervisor') && companyName === 'LGDeal INC';
  }, [user]);

  const isLgdealIncStaff = useMemo(() => {
    if (!user) return false;
    if (typeof user.isLgdealIncStaff === 'boolean') return user.isLgdealIncStaff;
    const companyName = typeof user.company === 'object' && user.company && 'name' in user.company
      ? (user.company as { name: string }).name
      : undefined;
    return companyName === 'LGDeal INC';
  }, [user]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    token, // deprecated; kept for type compatibility
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    loadUser, // Expose loadUser if manual re-trigger is needed
    setAuthError, // Expose function to set error
    setUser, // Allow manual update of user if needed (e.g., profile update)
    isLgdealSupervisor,
    isLgdealIncStaff,
    impersonate,
    stopImpersonating,
    isImpersonating,
  }), [
    user,
    token,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    loadUser,
    setAuthError,
    setUser,
    isLgdealSupervisor,
    isLgdealIncStaff,
    impersonate,
    stopImpersonating,
    isImpersonating,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 