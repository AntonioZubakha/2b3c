import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Ruler, ShieldCheck, Sparkles, Target } from './icons';

const EducationSection: React.FC = () => {
  const { t } = useTranslation();
  const qualities = useMemo(
    () => [
      {
        title: t('education.q1Title'),
        icon: <Ruler size={22} />,
        tone: 'rose-gold-deep',
        bg: 'bg-blush-50',
        desc: t('education.q1Desc'),
      },
      {
        title: t('education.q2Title'),
        icon: <Sparkles size={22} />,
        tone: 'champagne',
        bg: 'bg-cream-100',
        desc: t('education.q2Desc'),
      },
      {
        title: t('education.q3Title'),
        icon: <Target size={22} />,
        tone: 'mauve',
        bg: 'bg-blush-100',
        desc: t('education.q3Desc'),
      },
      {
        title: t('education.q4Title'),
        icon: <Award size={22} />,
        tone: 'emerald-700',
        bg: 'bg-cream-200',
        desc: t('education.q4Desc'),
      },
    ],
    [t],
  );

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
          <div className="lg:w-1/2 space-y-7">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blush-50 border border-blush-200 text-rose-gold-deep text-[10px] font-medium uppercase tracking-[0.22em]">
              <ShieldCheck size={14} /> {t('education.badge')}
            </div>
            <h2 className="font-serif text-5xl md:text-6xl font-light tracking-tight leading-tight text-ink">
              {t('education.title1')}
              <br />
              <span className="text-gradient italic">{t('education.title2')}</span>
            </h2>
            <p className="text-ink-soft text-base leading-relaxed max-w-xl">{t('education.intro')}</p>
          </div>

          <div className="lg:w-1/2 grid grid-cols-1 md:grid-cols-2 gap-5 w-full">
            {qualities.map((item, idx) => (
              <div key={idx} className="glass-card p-7 group">
                <div
                  className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center mb-5 transition-transform group-hover:scale-110`}
                  style={{ color: `var(--${item.tone.replace('emerald-700', 'rose-gold-deep')})` }}
                >
                  {item.icon}
                </div>
                <h3 className="font-serif text-2xl text-ink mb-2">{item.title}</h3>
                <p className="text-ink-soft text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default EducationSection;
