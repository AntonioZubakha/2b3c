import React, { useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n';
import Button from '../../../components/common/Button/Button';
import styles from './InvoiceUploadPanel.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';
import { Deal } from '../../../types';
import GenerateInvoiceModal from './GenerateInvoiceModal';

interface InvoiceUploadPanelProps {
  onUploadInvoice: (file: File) => Promise<void> | void;
  isLoading: boolean;
  deal: Deal;
}

const InvoiceUploadPanel: React.FC<InvoiceUploadPanelProps> = ({ onUploadInvoice, isLoading, deal }) => {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const generatedInvoiceFilename = useMemo(() => {
    const safeDealNumber = (deal.dealNumber || 'invoice').replace(/[^\w-]+/g, '_');
    return `invoice-${safeDealNumber}.pdf`;
  }, [deal.dealNumber]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedFile) {
      onUploadInvoice(selectedFile);
    }
  };

  return (
    <div className={styles.uploadPanel}>
      <h5><i className={`fas fa-file-invoice-dollar ${dealIconStyles.iconMarginEnd}`}></i>{t('invoiceUpload.actionRequired')}</h5>
      <p>{t('invoiceUpload.description')}</p>
      <p className={styles.fileInfo}>{t('invoiceUpload.supportedFormats')}</p>
      <div className={styles.actions}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input 
            type="file" 
            onChange={handleFileChange} 
            className={styles.fileInput}
            accept=".pdf,.doc,.docx,.jpg,.png"
            required 
          />
          <Button 
            type="submit" 
            variant="primary" 
            size="sm"
            disabled={!selectedFile || isLoading}
            className={styles.uploadButton}
          >
            {isLoading ? t('invoiceUpload.uploading') : t('invoiceUpload.upload')}
          </Button>
        </form>

        <div className={styles.generateRow}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoading || isGenerating}
            onClick={() => setIsGenerateOpen(true)}
            className={styles.generateButton}
          >
            <i className={`fas fa-magic ${dealIconStyles.iconMarginEnd}`} />
            Generate Invoice
          </Button>
        </div>
      </div>

      <GenerateInvoiceModal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        deal={deal}
        generatedInvoiceFilename={generatedInvoiceFilename}
        onUploadGeneratedInvoice={async (file) => {
          setIsGenerating(true);
          try {
            await onUploadInvoice(file);
            setIsGenerateOpen(false);
          } finally {
            setIsGenerating(false);
          }
        }}
      />
    </div>
  );
};

export default InvoiceUploadPanel; 