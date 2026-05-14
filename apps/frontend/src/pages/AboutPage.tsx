import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Eye, Flower2, Globe, ShieldCheck, Target, Users } from '../components/icons';
import BrandMark from '../components/BrandMark';
import Seo from '../components/Seo';

const AboutPage: React.FC = () => {
  const { t } = useTranslation();
  const cards = useMemo(
    () => [
      {
        icon: Cpu,
        title: t('about.card1Title'),
        description: t('about.card1Desc'),
        iconBg: 'bg-blush-50 border-blush-200',
        iconColor: 'text-rose-gold-deep',
      },
      {
        icon: Globe,
        title: t('about.card2Title'),
        description: t('about.card2Desc'),
        iconBg: 'bg-cream-100 border-cream-200',
        iconColor: 'text-mauve',
      },
      {
        icon: ShieldCheck,
        title: t('about.card3Title'),
        description: t('about.card3Desc'),
        iconBg: 'bg-blush-100 border-blush-200',
        iconColor: 'text-emerald-700',
      },
    ],
    [t],
  );

  return (
    <div className="pt-28 pb-16 px-4 relative z-10">
      <Seo
        title={`${t('about.badge')} — Stonee`}
        description={t('about.intro')}
        path="/about"
      />
      <div className="max-w-6xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-20 animate-fade-in-up">
          <div className="flex justify-center mb-5">
            <BrandMark size={104} />
          </div>
          <div className="inline-flex items-center gap-2 bg-blush-50 border border-blush-200 px-4 py-1.5 rounded-full text-xs mb-6">
            <Flower2 size={14} className="text-rose-gold-deep" />
            <span className="text-ink-soft font-medium uppercase tracking-[0.22em]">{t('about.badge')}</span>
          </div>
          <h1 className="font-serif text-6xl md:text-7xl font-light tracking-tight mb-6 text-ink">
            {t('about.titleLine1')}
            <br />
            <span className="text-gradient italic">{t('about.titleItalic')}</span>
          </h1>
          <p className="text-base text-ink-soft max-w-2xl mx-auto leading-relaxed">{t('about.intro')}</p>
        </div>

        {/* Mission & Vision */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
          <div className="glass-card p-10 animate-fade-in-up animate-delay-100">
            <div className="w-14 h-14 rounded-2xl bg-blush-50 border border-blush-200 flex items-center justify-center mb-6 text-rose-gold-deep">
              <Target size={28} />
            </div>
            <h2 className="font-serif text-3xl text-ink mb-3">{t('about.missionTitle')}</h2>
            <p className="text-ink-soft leading-relaxed">{t('about.missionBody')}</p>
          </div>

          <div className="glass-card p-10 animate-fade-in-up animate-delay-200">
            <div className="w-14 h-14 rounded-2xl bg-cream-100 border border-cream-200 flex items-center justify-center mb-6 text-mauve">
              <Eye size={28} />
            </div>
            <h2 className="font-serif text-3xl text-ink mb-3">{t('about.visionTitle')}</h2>
            <p className="text-ink-soft leading-relaxed">{t('about.visionBody')}</p>
          </div>
        </div>

        {/* Differences */}
        <div className="mb-20">
          <div className="text-center mb-10 animate-fade-in-up">
            <h2 className="font-serif text-5xl font-light tracking-tight mb-3 text-ink">
              {t('about.diffTitle1')} <span className="text-gradient-gold italic">{t('about.diffTitle2')}</span>
            </h2>
            <p className="text-ink-soft max-w-xl mx-auto">{t('about.diffSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {cards.map(card => (
              <div
                key={card.title}
                className="glass-card p-7 animate-fade-in-up"
              >
                <div
                  className={`w-12 h-12 rounded-2xl ${card.iconBg} border flex items-center justify-center ${card.iconColor} mb-5`}
                >
                  <card.icon size={22} />
                </div>
                <h3 className="font-serif text-xl text-ink mb-2">{card.title}</h3>
                <p className="text-ink-soft text-sm leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="glass-card p-12 md:p-16 text-center mb-20 animate-fade-in-up">
          <Users size={36} className="text-rose-gold-deep mx-auto mb-5" />
          <h2 className="font-serif text-5xl font-light text-ink mb-5">
            {t('about.teamTitle1')} <span className="text-gradient italic">{t('about.teamTitle2')}</span>
          </h2>
          <p className="text-ink-soft max-w-2xl mx-auto leading-relaxed mb-8">{t('about.teamBody')}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            {[
              { number: '15+', label: t('about.statTeam') },
              { number: '3', label: t('about.statContinents') },
              { number: '50K+', label: t('about.statDiamonds') },
              { number: '$2M+', label: t('about.statSavings') },
            ].map(stat => (
              <div key={stat.label}>
                <div className="font-serif text-4xl font-light text-gradient">{stat.number}</div>
                <div className="text-[10px] text-ash uppercase tracking-[0.22em] mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center animate-fade-in-up">
          <h2 className="font-serif text-3xl text-ink mb-2">{t('about.ctaTitle')}</h2>
          <p className="text-ink-soft mb-7">{t('about.ctaSubtitle')}</p>
          <button
            type="button"
            className="btn-primary px-10 py-4 text-sm font-medium uppercase tracking-[0.22em]"
          >
            {t('about.ctaButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
