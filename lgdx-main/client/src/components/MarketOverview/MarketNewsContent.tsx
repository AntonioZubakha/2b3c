import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import type { TranslationKey } from '../../i18n/types';
import { useAuth } from '../../context/AuthContext';
import {
  getMarketNewsList,
  createMarketNews,
  updateMarketNews,
  deleteMarketNews,
  uploadMarketNewsImage,
  type MarketNewsItem
} from '../../api/marketNewsApi';
import Modal from '../common/Modal/Modal';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import { IconTrendUp, IconTrendDown, IconChart, IconEdit, IconTrash } from './SupplyInsightsIcons';
import styles from './MarketOverviewTabs.module.css';

const CATEGORIES = ['Market Growth', 'Product Trends', 'Operations', 'Pricing', 'Consumer Behavior'] as const;
const IMPACTS = ['positive', 'negative', 'neutral'] as const;

const MarketNewsContent: React.FC = () => {
  const { t } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const [list, setList] = useState<MarketNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingItem, setEditingItem] = useState<MarketNewsItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    summary: string;
    body: string;
    imageUrl: string;
    imageCredit: string;
    date: string;
    category: string;
    impact: 'positive' | 'negative' | 'neutral';
  }>({
    title: '',
    summary: '',
    body: '',
    imageUrl: '',
    imageCredit: '',
    date: new Date().toISOString().split('T')[0],
    category: CATEGORIES[0],
    impact: IMPACTS[0]
  });
  const [articleModalItem, setArticleModalItem] = useState<MarketNewsItem | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMarketNewsList();
      setList(data);
    } catch {
      setError('Failed to load market news');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openAdd = () => {
    setModalMode('add');
    setEditingItem(null);
    setForm({
      title: '',
      summary: '',
      body: '',
      imageUrl: '',
      imageCredit: '',
      date: new Date().toISOString().split('T')[0],
      category: CATEGORIES[0],
      impact: 'neutral'
    });
    setModalOpen(true);
  };

  const openEdit = (item: MarketNewsItem) => {
    setModalMode('edit');
    setEditingItem(item);
    setForm({
      title: item.title,
      summary: item.summary,
      body: item.body ?? '',
      imageUrl: item.imageUrl ?? '',
      imageCredit: item.imageCredit ?? '',
      date: item.date,
      category: item.category,
      impact: item.impact as 'positive' | 'negative' | 'neutral'
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.summary.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        date: form.date,
        category: form.category,
        impact: form.impact,
        body: form.body.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        imageCredit: form.imageCredit.trim() || undefined
      };
      if (modalMode === 'add') {
        await createMarketNews(payload);
      } else if (editingItem) {
        await updateMarketNews(editingItem.id, payload);
      }
      setModalOpen(false);
      await fetchList();
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MarketNewsItem) => {
    if (!window.confirm(t('marketOverview.marketNews.confirmDeleteNews'))) return;
    try {
      await deleteMarketNews(item.id);
      await fetchList();
    } catch {
      setError('Failed to delete');
    }
  };

  const categoryLabel = (category: string) => {
    const key = category === 'Market Growth' ? 'marketGrowth' :
      category === 'Product Trends' ? 'productTrends' :
      category === 'Operations' ? 'operations' :
      category === 'Pricing' ? 'pricing' :
      category === 'Consumer Behavior' ? 'consumerBehavior' : category;
    return t(`marketOverview.marketNews.categories.${key}` as TranslationKey);
  };

  if (loading) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.loadingContainer}>
          <div className={styles.spinner}></div>
          <p>Loading market news...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.insightsHeader}>
        <h2>{t('marketOverview.marketNews.title')}</h2>
        <p>{t('marketOverview.marketNews.subtitle')}</p>
        {isLgdealSupervisor && (
          <div className={styles.insightsHeaderActions}>
            <Button variant="primary" onClick={openAdd}>
              {t('marketOverview.marketNews.addNews')}
            </Button>
          </div>
        )}
      </div>

      {error && <p className={styles.errorMessageBlock}>{error}</p>}

      <div className={styles.newsGrid}>
        {list.map((news, index) => (
          <div
            key={news.id}
            className={`${styles.newsCard} ${styles[news.impact]}`}
            style={{ '--animation-delay': `${index * 0.1}s` } as React.CSSProperties}
          >
            {isLgdealSupervisor && (
              <div className={styles.newsCardActions}>
                <button
                  type="button"
                  className={styles.newsCardActionBtn}
                  onClick={() => openEdit(news)}
                  aria-label={t('marketOverview.marketNews.editNews')}
                >
                  <IconEdit className={styles.newsCardActionIcon} />
                </button>
                <button
                  type="button"
                  className={styles.newsCardActionBtn}
                  onClick={() => handleDelete(news)}
                  aria-label={t('marketOverview.marketNews.deleteNews')}
                >
                  <IconTrash className={styles.newsCardActionIcon} />
                </button>
              </div>
            )}
            <div className={styles.newsHeader}>
              <div className={styles.newsCategory}>{categoryLabel(news.category)}</div>
              <div className={styles.newsDate}>{new Date(news.date).toLocaleDateString()}</div>
            </div>
            <h3 className={styles.newsTitle}>{news.title}</h3>
            <p className={styles.newsSummary}>{news.summary}</p>
            {(news.body || news.imageUrl) && (
              <button
                type="button"
                className={styles.readMoreBtn}
                onClick={() => setArticleModalItem(news)}
              >
                {t('marketOverview.marketNews.readMore')}
              </button>
            )}
            <div className={`${styles.newsImpact} ${styles[news.impact]}`}>
              {news.impact === 'positive' && <IconTrendUp className={styles.newsImpactIcon} aria-hidden />}
              {news.impact === 'negative' && <IconTrendDown className={styles.newsImpactIcon} aria-hidden />}
              {news.impact === 'neutral' && <IconChart className={styles.newsImpactIcon} aria-hidden />}
              <span>
                {news.impact === 'positive' ? t('marketOverview.marketNews.positiveImpact') :
                 news.impact === 'negative' ? t('marketOverview.marketNews.negativeImpact') : t('marketOverview.marketNews.marketNeutral')}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.newsDisclaimer}>
        <p><strong>{t('marketOverview.marketNews.note')}</strong> {t('marketOverview.marketNews.disclaimer')}</p>
      </div>

      {articleModalItem && (
        <Modal
          isOpen={!!articleModalItem}
          onClose={() => setArticleModalItem(null)}
          title={articleModalItem.title}
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setArticleModalItem(null)}>
              {t('marketOverview.marketNews.cancel')}
            </Button>
          }
        >
          <div className={styles.articleModalContent}>
            <div className={styles.newsHeader}>
              <div className={styles.newsCategory}>{categoryLabel(articleModalItem.category)}</div>
              <div className={styles.newsDate}>{new Date(articleModalItem.date).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
            </div>
            {articleModalItem.imageUrl && (
              <div className={styles.articleImageWrap}>
                <img src={articleModalItem.imageUrl} alt="" className={styles.articleImage} />
                {articleModalItem.imageCredit && (
                  <p className={styles.articleImageCredit}>{t('marketOverview.marketNews.credit')}: {articleModalItem.imageCredit}</p>
                )}
              </div>
            )}
            {articleModalItem.body ? (
              <div className={styles.articleBody}>
                {articleModalItem.body.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <p className={styles.newsSummary}>{articleModalItem.summary}</p>
            )}
          </div>
        </Modal>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === 'add' ? t('marketOverview.marketNews.addNews') : t('marketOverview.marketNews.editNews')}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              {t('marketOverview.marketNews.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || !form.title.trim() || !form.summary.trim()}>
              {saving ? '...' : t('marketOverview.marketNews.save')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
          <Input
            label="Title"
            value={form.title}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={300}
          />
          <Input
            type="textarea"
            label="Summary"
            value={form.summary}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, summary: e.target.value }))}
            rows={4}
            maxLength={2000}
          />
          <Input
            type="textarea"
            label={t('marketOverview.marketNews.body')}
            value={form.body}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={12}
            placeholder="Full article text (optional)"
          />
          <div>
            <label className={styles.formLabel}>{t('marketOverview.marketNews.imageUrl')}</label>
            <div className={styles.imageUploadRow}>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className={styles.imageFileInput}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImageUploading(true);
                  try {
                    const { url } = await uploadMarketNewsImage(file);
                    setForm((f) => ({ ...f, imageUrl: url }));
                  } catch {
                    setError('Failed to upload image');
                  } finally {
                    setImageUploading(false);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                className={styles.uploadImageBtn}
                onClick={() => imageInputRef.current?.click()}
                disabled={imageUploading || saving}
              >
                {imageUploading ? '...' : t('marketOverview.marketNews.uploadFromPc')}
              </button>
              {form.imageUrl && <span className={styles.imageUrlHint}>{form.imageUrl}</span>}
            </div>
            <p className={styles.imageUrlOr}>{t('marketOverview.marketNews.orPasteUrl')}</p>
            <Input
              value={form.imageUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              placeholder={t('marketOverview.marketNews.imageUrlPlaceholder')}
            />
          </div>
          <Input
            label={t('marketOverview.marketNews.imageCredit')}
            value={form.imageCredit}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, imageCredit: e.target.value }))}
            placeholder="Flickr/The White House"
          />
          <Input
            type="date"
            label="Date"
            value={form.date}
            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
          <div>
            <label className={styles.formLabel}>Category</label>
            <select
              value={form.category}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, category: e.target.value }))}
              className={styles.formSelect}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={styles.formLabel}>Impact</label>
            <select
              value={form.impact}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, impact: e.target.value as 'positive' | 'negative' | 'neutral' }))}
              className={styles.formSelect}
            >
              <option value="positive">{t('marketOverview.marketNews.positiveImpact')}</option>
              <option value="negative">{t('marketOverview.marketNews.negativeImpact')}</option>
              <option value="neutral">{t('marketOverview.marketNews.marketNeutral')}</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default MarketNewsContent;
