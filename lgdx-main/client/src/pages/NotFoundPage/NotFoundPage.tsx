import React from 'react';
import { Link } from '../../routes';
import SEO from '../../components/common/SEO/SEO';
import styles from './NotFoundPage.module.css';

const NotFoundPage: React.FC = () => {
  return (
    <main className={styles.container}>
      <SEO title="Page not found" description="Page not found." noindex nofollow />
      <h1>Page not found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
      <p>
        <Link to="/">Go to home</Link> · <Link to="/catalog">Open catalog</Link> ·{' '}
        <Link to="/faq">FAQ</Link>
      </p>
    </main>
  );
};

export default NotFoundPage;
