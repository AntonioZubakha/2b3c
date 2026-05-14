import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import ProductCard from '../../components/ProductCard';
import { createMockProduct } from '../setup';

// Mock useAuth hook
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', role: 'user' },
    isAuthenticated: true,
  }),
}));

// Mock API calls
jest.mock('../../services/api', () => ({
  addToWishlist: jest.fn(),
  removeFromWishlist: jest.fn(),
  addToCart: jest.fn(),
}));

describe('ProductCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render product information correctly', () => {
    const mockProduct = createMockProduct({
      certificateNumber: 'TEST001',
      shape: 'Round',
      carat: 1.0,
      color: 'D',
      clarity: 'FL',
      cut: 'Excellent',
      price: 10000
    });

    render(<ProductCard product={mockProduct} />);

    expect(screen.getByText('TEST001')).toBeInTheDocument();
    expect(screen.getByText('Round')).toBeInTheDocument();
    expect(screen.getByText('1.0 ct')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('FL')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('$10,000')).toBeInTheDocument();
  });

  it('should handle wishlist toggle', async () => {
    const mockProduct = createMockProduct();
    const mockApi = require('../../services/api');
    mockApi.addToWishlist.mockResolvedValue({ success: true });

    render(<ProductCard product={mockProduct} />);

    const wishlistButton = screen.getByRole('button', { name: /add to wishlist/i });
    fireEvent.click(wishlistButton);

    expect(mockApi.addToWishlist).toHaveBeenCalledWith(mockProduct._id);
  });

  it('should handle add to cart', async () => {
    const mockProduct = createMockProduct();
    const mockApi = require('../../services/api');
    mockApi.addToCart.mockResolvedValue({ success: true });

    render(<ProductCard product={mockProduct} />);

    const cartButton = screen.getByRole('button', { name: /add to cart/i });
    fireEvent.click(cartButton);

    expect(mockApi.addToCart).toHaveBeenCalledWith(mockProduct._id);
  });

  it('should show different status for different product statuses', () => {
    const availableProduct = createMockProduct({ status: 'available' });
    const soldProduct = createMockProduct({ status: 'sold' });
    const reservedProduct = createMockProduct({ status: 'reserved' });

    const { rerender } = render(<ProductCard product={availableProduct} />);
    expect(screen.getByText(/available/i)).toBeInTheDocument();

    rerender(<ProductCard product={soldProduct} />);
    expect(screen.getByText(/sold/i)).toBeInTheDocument();

    rerender(<ProductCard product={reservedProduct} />);
    expect(screen.getByText(/reserved/i)).toBeInTheDocument();
  });

  it('should format price correctly', () => {
    const productWithHighPrice = createMockProduct({ price: 1234567 });
    const productWithLowPrice = createMockProduct({ price: 123 });

    const { rerender } = render(<ProductCard product={productWithHighPrice} />);
    expect(screen.getByText('$1,234,567')).toBeInTheDocument();

    rerender(<ProductCard product={productWithLowPrice} />);
    expect(screen.getByText('$123')).toBeInTheDocument();
  });

  it('should handle API errors gracefully', async () => {
    const mockProduct = createMockProduct();
    const mockApi = require('../../services/api');
    mockApi.addToWishlist.mockRejectedValue(new Error('API Error'));

    render(<ProductCard product={mockProduct} />);

    const wishlistButton = screen.getByRole('button', { name: /add to wishlist/i });
    fireEvent.click(wishlistButton);

    // Should not crash and should show error state
    await screen.findByText(/error/i);
  });
});
