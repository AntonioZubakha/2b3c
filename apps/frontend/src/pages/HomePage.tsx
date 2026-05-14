import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Flower2, Gem, Heart, Leaf, Receipt, Sparkles } from '../components/icons';
import BrandMark from '../components/BrandMark';
import Seo from '../components/Seo';

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const steps = useMemo(
    () => [
      { num: '01', icon: Flower2, title: t('home.step1Title'), desc: t('home.step1Desc') },
      { num: '02', icon: Gem, title: t('home.step2Title'), desc: t('home.step2Desc') },
      { num: '03', icon: Receipt, title: t('home.step3Title'), desc: t('home.step3Desc') },
    ],
    [t],
  );
  return (
    <>
      <Seo
        title={t('home.seoTitle')}
        description={t('home.subtitle')}
        path="/"
      />
      {/* Hero */}
      <main className="flex-grow flex flex-col items-center justify-center pt-32 pb-20 px-6 text-center">
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
          <div className="flex justify-center">
            <BrandMark size={160} />
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blush-50 border border-blush-200/60 text-rose-gold-deep text-xs font-medium tracking-[0.2em]">
            <Flower2 className="w-3.5 h-3.5" />
            <span className="uppercase">{t('home.badge')}</span>
          </div>

          <h1 className="font-serif font-light text-6xl md:text-8xl tracking-tight leading-[1.05] text-ink">
            {t('home.heroTitleBefore')} <br />
            {t('home.heroTitleWorn')} <span className="text-gradient italic">{t('home.heroTitleForever')}</span>.
          </h1>

          <p className="text-lg md:text-xl text-ink-soft max-w-2xl mx-auto font-light leading-relaxed">
            {t('home.subtitle')}
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-6">
            <Link
              to="/craft"
              className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-sm font-medium uppercase tracking-[0.22em] no-underline"
            >
              {t('home.beginPiece')} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/collections"
              className="glass-button px-8 py-4 text-sm font-medium uppercase tracking-[0.22em] no-underline inline-flex items-center gap-2"
            >
              {t('home.seeCollections')}
            </Link>
          </div>
        </div>
      </main>

      {/* The three steps — primary navigation of the brand */}
      <section className="py-20 px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14 animate-fade-in-up">
            <p className="text-xs uppercase tracking-[0.32em] text-rose-gold-deep mb-4">
              {t('home.howItWorks')}
            </p>
            <h2 className="font-serif text-5xl md:text-6xl font-light text-ink mb-4">
              {t('home.threeStepsTitle1')} <span className="text-gradient italic">{t('home.threeStepsTitle2')}</span>
            </h2>
            <p className="text-ink-soft max-w-xl mx-auto">{t('home.threeStepsSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((s, idx) => (
              <article
                key={s.num}
                className="glass-card p-8 group animate-fade-in-up"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="flex items-center justify-between mb-6">
                  <span className="font-serif text-5xl text-ink/15 group-hover:text-rose-gold/60 transition-colors">
                    {s.num}
                  </span>
                  <div className="w-12 h-12 rounded-full bg-blush-50 flex items-center justify-center">
                    <s.icon className="w-5 h-5 text-rose-gold-deep" />
                  </div>
                </div>
                <h3 className="font-serif text-2xl text-ink mb-3">{s.title}</h3>
                <p className="text-sm text-ink-soft leading-relaxed">{s.desc}</p>
              </article>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/craft"
              className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-sm font-medium uppercase tracking-[0.22em] no-underline"
            >
              {t('home.stepIntoAtelier1')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Quiet differentiators */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-[0.32em] text-rose-gold-deep mb-4">
              {t('home.quietlyDifferent')}
            </p>
            <h2 className="font-serif text-5xl md:text-6xl font-light text-ink">
              {t('home.whyStonee1')} <span className="text-gradient italic">{t('home.whyStonee2')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="glass-card p-8 group animate-fade-in-up">
              <div className="w-12 h-12 rounded-full bg-blush-50 flex items-center justify-center mb-6">
                <Sparkles className="w-5 h-5 text-rose-gold-deep" />
              </div>
              <h3 className="font-serif text-2xl text-ink mb-3">{t('home.scoreTitle')}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{t('home.scoreDesc')}</p>
            </article>

            <article className="glass-card p-8 group animate-fade-in-up animate-delay-100">
              <div className="w-12 h-12 rounded-full bg-blush-50 flex items-center justify-center mb-6">
                <Leaf className="w-5 h-5 text-rose-gold-deep" />
              </div>
              <h3 className="font-serif text-2xl text-ink mb-3">{t('home.ethicalTitle')}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{t('home.ethicalDesc')}</p>
            </article>

            <article className="glass-card p-8 group animate-fade-in-up animate-delay-200">
              <div className="w-12 h-12 rounded-full bg-blush-50 flex items-center justify-center mb-6">
                <Heart className="w-5 h-5 text-rose-gold-deep" />
              </div>
              <h3 className="font-serif text-2xl text-ink mb-3">{t('home.handSetTitle')}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{t('home.handSetDesc')}</p>
            </article>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="py-20 px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center glass-card-premium p-14">
          <h2 className="font-serif text-5xl md:text-6xl font-light text-ink mb-4">
            {t('home.ctaTitle1')} <span className="text-gradient italic">{t('home.ctaHeirloom')}</span>
          </h2>
          <p className="text-ink-soft mb-8 max-w-lg mx-auto">{t('home.ctaSubtitle')}</p>
          <Link
            to="/craft"
            className="btn-primary inline-flex items-center gap-2 px-10 py-4 text-sm font-medium uppercase tracking-[0.22em] no-underline"
          >
            {t('home.stepIntoAtelier2')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
};

export default HomePage;
