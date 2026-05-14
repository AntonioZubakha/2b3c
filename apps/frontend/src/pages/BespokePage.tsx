import React from 'react';
import { Navigate } from 'react-router-dom';

// The bespoke flow now lives at /craft and starts with the jewelry piece, not the diamond.
// This component preserves the old URL for any external links or bookmarks.
const BespokePage: React.FC = () => <Navigate to="/craft" replace />;

export default BespokePage;
