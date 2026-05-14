import React, { memo } from 'react';
import { useTranslation } from '../../../i18n';
import styles from './TestimonialsSection.module.css';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';

interface Testimonial {
  quote: string;
  author: string;
  role: string;
}

const testimonials: Testimonial[] = [
  {
    quote: "LGDeal's AI-powered imaging technology revealed microscopic details I never thought possible. The precision and clarity gave me absolute confidence in my investment decision.",
    author: 'Michael Rodriguez',
    role: 'CEO, Luxury Jewelry House'
  },
  {
    quote: "The concierge team's expertise transformed what could have been overwhelming into an exceptional experience. They found perfection within my parameters – remarkable service.",
    author: 'Jennifer Thompson',
    role: 'Senior Buyer, Elite Diamonds'
  },
  {
    quote: 'Transparent market pricing with no hidden markups – finally, a platform that respects professional buyers. LGDeal has revolutionized our procurement process entirely.',
    author: 'David Morgan',
    role: 'Procurement Director'
  }
];

const TestimonialsSection: React.FC = memo(() => {
  const { t } = useTranslation();

  return (
    <section 
      className={styles.testimonialsSection} 
      aria-labelledby="testimonials-heading"
      role="region"
    >
      <div className="animateOnScroll">
        <HomeSectionHeader
          id="testimonials-heading"
          title={<span className="homeAccent">{t('testimonials.eliteTestimonials')}</span>}
          subtitle={t('testimonials.subheading')}
        />
      </div>
      <div className={`${styles.testimonialsGrid} animateOnScroll`} role="list">
        {testimonials.map((testimonial, index) => (
          <article 
            key={index}
            className={styles.testimonialCard} 
            role="listitem"
          >
            <blockquote className={styles.testimonialText}>
              {testimonial.quote}
            </blockquote>
            <div className={styles.testimonialAuthor}>
              <div className={styles.authorAvatar} aria-hidden="true">
                <span className={styles.authorInitials}>
                  {testimonial.author.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
              <div className={styles.authorInfo}>
                <h4 className={styles.authorName}>{testimonial.author}</h4>
                <p className={styles.authorRole}>{testimonial.role}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
});

TestimonialsSection.displayName = 'TestimonialsSection';

export default TestimonialsSection;

