import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BrowserRouter } from 'react-router-dom';
import App from '../../App';
import { createMockUser, createMockProduct } from '../setup';

// Mock all API calls
jest.mock('../../services/api', () => ({
  login: jest.fn(),
  register: jest.fn(),
  getProducts: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
  addToWishlist: jest.fn(),
  addToCart: jest.fn(),
}));

// Mock useAuth hook
const mockLogin = jest.fn();
const mockLogout = jest.fn();

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    loading: false,
    login: mockLogin,
    logout: mockLogout,
  }),
}));

describe('App E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderApp = () => {
    return render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );
  };

  describe('Authentication Flow', () => {
    it('should complete full user journey from registration to product management', async () => {
      const mockUser = createMockUser();
      const mockProducts = [
        createMockProduct({ certificateNumber: 'E2E001' }),
        createMockProduct({ certificateNumber: 'E2E002' })
      ];

      // Mock API responses
      const mockApi = require('../../services/api');
      mockApi.register.mockResolvedValue({
        token: 'mock-token',
        user: mockUser
      });
      mockApi.login.mockResolvedValue({
        token: 'mock-token',
        user: mockUser
      });
      mockApi.getProducts.mockResolvedValue({
        products: mockProducts,
        total: 2
      });

      renderApp();

      // Start at login page
      expect(screen.getByText(/login/i)).toBeInTheDocument();

      // Navigate to registration
      const registerLink = screen.getByText(/register/i);
      fireEvent.click(registerLink);

      // Fill registration form
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const firstNameInput = screen.getByLabelText(/first name/i);
      const lastNameInput = screen.getByLabelText(/last name/i);
      const companyInput = screen.getByLabelText(/company/i);

      fireEvent.change(emailInput, { target: { value: 'e2e@test.com' } });
      fireEvent.change(passwordInput, { target: { value: 'TestPassword123!' } });
      fireEvent.change(firstNameInput, { target: { value: 'E2E' } });
      fireEvent.change(lastNameInput, { target: { value: 'Test' } });
      fireEvent.change(companyInput, { target: { value: 'E2E Company' } });

      // Submit registration
      const registerButton = screen.getByRole('button', { name: /register/i });
      fireEvent.click(registerButton);

      await waitFor(() => {
        expect(mockApi.register).toHaveBeenCalledWith({
          email: 'e2e@test.com',
          password: 'TestPassword123!',
          firstName: 'E2E',
          lastName: 'Test',
          companyName: 'E2E Company'
        });
      });

      // Should be redirected to dashboard after successful registration
      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('should handle login and product browsing flow', async () => {
      const mockUser = createMockUser();
      const mockProducts = [
        createMockProduct({ certificateNumber: 'BROWSE001' }),
        createMockProduct({ certificateNumber: 'BROWSE002' })
      ];

      // Mock API responses
      const mockApi = require('../../services/api');
      mockApi.login.mockResolvedValue({
        token: 'mock-token',
        user: mockUser
      });
      mockApi.getProducts.mockResolvedValue({
        products: mockProducts,
        total: 2
      });

      renderApp();

      // Login
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      fireEvent.change(emailInput, { target: { value: 'e2e@test.com' } });
      fireEvent.change(passwordInput, { target: { value: 'TestPassword123!' } });

      const loginButton = screen.getByRole('button', { name: /login/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(mockApi.login).toHaveBeenCalledWith({
          email: 'e2e@test.com',
          password: 'TestPassword123!'
        });
      });

      // Should be redirected to dashboard
      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Navigate to products
      const productsLink = screen.getByText(/products/i);
      fireEvent.click(productsLink);

      await waitFor(() => {
        expect(screen.getByText('BROWSE001')).toBeInTheDocument();
        expect(screen.getByText('BROWSE002')).toBeInTheDocument();
      });
    });
  });

  describe('Product Management Flow', () => {
    beforeEach(() => {
      // Mock authenticated user
      jest.doMock('../../hooks/useAuth', () => ({
        useAuth: () => ({
          user: createMockUser(),
          isAuthenticated: true,
          loading: false,
          login: mockLogin,
          logout: mockLogout,
        }),
      }));
    });

    it('should complete product CRUD operations', async () => {
      const mockApi = require('../../services/api');
      mockApi.getProducts.mockResolvedValue({
        products: [],
        total: 0
      });
      mockApi.createProduct.mockResolvedValue({
        _id: 'new-product-id',
        certificateNumber: 'CRUD001'
      });

      renderApp();

      // Navigate to products
      const productsLink = screen.getByText(/products/i);
      fireEvent.click(productsLink);

      // Add new product
      const addButton = screen.getByText(/add product/i);
      fireEvent.click(addButton);

      // Fill product form
      const certificateInput = screen.getByLabelText(/certificate number/i);
      const shapeSelect = screen.getByLabelText(/shape/i);
      const caratInput = screen.getByLabelText(/carat/i);
      const colorSelect = screen.getByLabelText(/color/i);
      const claritySelect = screen.getByLabelText(/clarity/i);
      const cutSelect = screen.getByLabelText(/cut/i);
      const priceInput = screen.getByLabelText(/price/i);

      fireEvent.change(certificateInput, { target: { value: 'CRUD001' } });
      fireEvent.change(shapeSelect, { target: { value: 'Round' } });
      fireEvent.change(caratInput, { target: { value: '1.0' } });
      fireEvent.change(colorSelect, { target: { value: 'D' } });
      fireEvent.change(claritySelect, { target: { value: 'FL' } });
      fireEvent.change(cutSelect, { target: { value: 'Excellent' } });
      fireEvent.change(priceInput, { target: { value: '10000' } });

      // Submit form
      const submitButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockApi.createProduct).toHaveBeenCalledWith({
          certificateNumber: 'CRUD001',
          shape: 'Round',
          carat: 1.0,
          color: 'D',
          clarity: 'FL',
          cut: 'Excellent',
          price: 10000,
          pricePerCarat: 10000
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockApi = require('../../services/api');
      mockApi.login.mockRejectedValue(new Error('Network error'));

      renderApp();

      // Try to login
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      fireEvent.change(emailInput, { target: { value: 'test@test.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password' } });

      const loginButton = screen.getByRole('button', { name: /login/i });
      fireEvent.click(loginButton);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });
  });
});
