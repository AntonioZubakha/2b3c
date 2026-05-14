import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  X,
  type IconProps,
} from './icons';
import BrandMark from './BrandMark';

interface ConciergeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChannelEntry = {
  icon: React.FC<IconProps>;
  title: string;
  meta: string;
  accent: string;
};

const ConciergeModal: React.FC<ConciergeModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const channels: ChannelEntry[] = useMemo(
    () => [
      {
        icon: MessageCircle,
        title: t('concierge.ch1Title'),
        meta: t('concierge.ch1Meta'),
        accent: 'rose-gold',
      },
      {
        icon: Phone,
        title: t('concierge.ch2Title'),
        meta: t('concierge.ch2Meta'),
        accent: 'mauve',
      },
      {
        icon: Calendar,
        title: t('concierge.ch3Title'),
        meta: t('concierge.ch3Meta'),
        accent: 'champagne',
      },
    ],
    [t],
  );
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-ink/40 backdrop-blur-xl animate-fade-in">
      <div className="glass-card-premium max-w-xl w-full p-0 relative overflow-hidden flex flex-col md:flex-row min-h-[480px]">
        {/* Left – brand panel */}
        <div className="w-full md:w-1/3 p-8 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-[color:var(--rose-gold)] via-[color:var(--mauve)] to-[color:var(--rose-gold-deep)] text-white">
          <div className="absolute inset-0 opacity-20">
            <span className="absolute top-10 left-10 w-40 h-40 bg-white rounded-full blur-[60px]" />
            <span className="absolute bottom-10 right-10 w-40 h-40 bg-white rounded-full blur-[60px]" />
          </div>
          <div className="relative z-10">
            <BrandMark size={72} tone="contrast" className="mb-6 ring-1 ring-white/30" />
            <h2 className="font-serif text-3xl font-light leading-tight">
              {t('concierge.brandLine1')}
              <br />
              {t('concierge.brandLine2')}
            </h2>
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] opacity-90">
              <ShieldCheck size={14} /> {t('concierge.secureHub')}
            </div>
          </div>
        </div>

        {/* Right – actions */}
        <div className="flex-1 p-10 relative flex flex-col justify-center bg-surface-elev">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full glass text-ink-soft hover:text-rose-gold-deep transition-colors border-0 cursor-pointer"
            aria-label={t('concierge.closeAria')}
          >
            <X size={18} />
          </button>

          <div className="space-y-7">
            <div className="space-y-2">
              <h3 className="font-serif text-2xl text-ink">{t('concierge.helpTitle')}</h3>
              <p className="text-sm text-ink-soft">{t('concierge.helpSubtitle')}</p>
            </div>

            <div className="space-y-3">
              {channels.map(({ icon: Icon, title, meta, accent }) => (
                <button
                  key={title}
                  type="button"
                  className="w-full p-4 glass-card flex items-center justify-between group cursor-pointer text-left bg-transparent hover:bg-blush-50"
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`p-2.5 rounded-xl bg-blush-50 border border-blush-200 text-${accent === 'rose-gold' ? 'rose-gold-deep' : accent} transition-all`}
                      style={{ color: accent === 'rose-gold' ? 'var(--rose-gold-deep)' : `var(--${accent})` }}
                    >
                      <Icon size={18} />
                    </span>
                    <div>
                      <div className="text-sm font-medium text-ink">{title}</div>
                      <div className="text-[10px] text-ash uppercase tracking-[0.18em]">
                        {meta}
                      </div>
                    </div>
                  </div>
                  <Send size={14} className="text-ash group-hover:text-rose-gold-deep transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConciergeModal;
