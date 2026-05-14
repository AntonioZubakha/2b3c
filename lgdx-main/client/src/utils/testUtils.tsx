// ==========================================================================
// TESTING UTILITIES
// Утилиты для тестирования React компонентов
// ==========================================================================

import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from '../routes';
import { AuthProvider } from '../context/AuthContext';

// Jest globals are already available in test environment
// No need to redeclare them here

// ==========================================================================
// CUSTOM RENDER WITH PROVIDERS
// ==========================================================================

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  initialAuthState?: {
    user?: Record<string, unknown>;
    isAuthenticated?: boolean;
    token?: string;
  };
}

const AllTheProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <BrowserRouter>
      <AuthProvider>
        {children}
      </AuthProvider>
    </BrowserRouter>
  );
};

const customRender = (
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) => {
  const { route = '/', initialAuthState, ...renderOptions } = options;
  void initialAuthState; // Reserved for tests that will seed AuthProvider

  // Set up route if provided
  if (route !== '/') {
    window.history.pushState({}, 'Test page', route);
  }

  return render(ui, {
    wrapper: AllTheProviders,
    ...renderOptions,
  });
};

// ==========================================================================
// TEST HELPERS
// ==========================================================================

export const fireEvent = {
  click: (element: Element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  },
  change: (element: HTMLInputElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },
  submit: (element: HTMLFormElement) => {
    element.dispatchEvent(new Event('submit', { bubbles: true }));
  },
};

// ==========================================================================
// EXPORTS
// ==========================================================================

export * from '@testing-library/react';
export { customRender as render }; 