import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { AuthContextType, Company, Address } from '../../types';
import styles from './CompanySettingsPanel.module.css';
import Modal from '../common/Modal/Modal';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import Select from '../common/Select/Select';
import Tabs, { TabItem } from '../common/Tabs';
import api from '../../api';

interface NotificationState {
  isOpen: boolean;
  title: string;
  message: string;
}

interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

interface GeneralInfoSettingsProps {
  data: Company;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSave: (section: string) => void;
  isSaving: boolean;
  error: string | null;
  fetchCompanyData: () => Promise<void>;
  setNotification: React.Dispatch<React.SetStateAction<NotificationState>>;
}

interface AddressBlockProps {
  addressType: 'legalAddress' | 'actualAddress' | 'shippingAddress';
  addressData?: Address;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

interface AddressSettingsProps {
  data: Company;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSave: (section: string) => void;
  isSaving: boolean;
  error: string | null;
  setCompanyData: React.Dispatch<React.SetStateAction<Company>>;
  openConfirmation: (title: string, message: string, onConfirm: () => void) => void;
}

interface BankInfoSettingsProps {
  data: Company;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSave: (section: string) => void;
  isSaving: boolean;
  error: string | null;
}

interface TaxSettingsProps {
  data: Company;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleSave: (section: string) => void;
  isSaving: boolean;
  error: string | null;
}

interface PaymentSettingsProps {
  data: Company;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleSave: (section: string) => void;
  isSaving: boolean;
  error: string | null;
}

type SubTab = 'general' | 'addresses' | 'bank' | 'tax' | 'payments';

const GeneralInfoSettings: React.FC<GeneralInfoSettingsProps> = ({ 
  data, 
  handleChange, 
  handleSave, 
  isSaving, 
  error,
  fetchCompanyData,
  setNotification
}) => {
  const { t } = useTranslation();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(data.details?.logo?.url || null);
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    const url = data.details?.logo?.url || null;
    if (!url) { setLogoPreview(null); return; }
    // Switch to protected file endpoint when PUBLIC_UPLOADS is disabled
    const useProtected = true;
    if (useProtected && url.startsWith('/uploads/')) {
      const filename = url.split('/').pop();
      setLogoPreview(filename ? `/api/files/company_logos/${filename}` : url);
    } else {
      setLogoPreview(url);
    }
  }, [data.details?.logo?.url]);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = e.target.files;
    if (files && files[0]) {
      setLogoFile(files[0]);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(files[0]);
      setLogoError(null);
    }
  };

  const handleLogoUpload = async (): Promise<void> => {
    if (!logoFile) {
      setLogoError(t('company.pleaseSelectLogoFile'));
      return;
    }
    setIsUploadingLogo(true);
    setLogoError(null);
    const formData = new FormData();
    formData.append('logo', logoFile);

    try {
      await api.post('/company/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await fetchCompanyData();
      setLogoFile(null);
      setNotification({
        isOpen: true,
        title: t('common.success'),
        message: t('company.logoUploadedSuccessfully')
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setLogoError(error.response?.data?.message || t('company.failedToUploadLogo'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  return (
    <div className={styles.settingsPanelContent}>
      <h4 className={styles.settingsPanelContentH4}>{t('company.generalInformation')}</h4>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <form onSubmit={e => { e.preventDefault(); handleSave('general'); }}>
        <div className={styles.generalTwoColumn}>
          <div className={styles.generalCol}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="companyName">{t('company.companyName')}</label>
              <Input id="companyName" name="name" value={data.name || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="companyDescription">{t('company.description')}</label>
              <Input type="textarea" id="companyDescription" name="description" value={data.description || ''} onChange={handleChange} rows={3} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="detailsPhone">{t('company.phone')}</label>
              <Input type="tel" id="detailsPhone" name="details.phone" value={data.details?.phone || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="detailsEmail">{t('company.companyEmail')}</label>
              <Input type="email" id="detailsEmail" name="details.email" value={data.details?.email || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="detailsWebsite">{t('company.website')}</label>
              <Input type="url" id="detailsWebsite" name="details.website" value={data.details?.website || ''} onChange={handleChange} />
            </div>
          </div>
          <div className={styles.generalCol}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="detailsCompanyCountry">{t('company.companyCountry')}</label>
              <Input id="detailsCompanyCountry" name="details.companyCountry" value={data.details?.companyCountry || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="detailsTechnology">{t('company.technology')}</label>
              <Input id="detailsTechnology" name="details.technology" value={data.details?.technology || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>{t('company.companyRoles')}</label>
              <div className={styles.rolesDisplay}>
                {data.roles && data.roles.length > 0 ? (
                  data.roles.map((role, index) => (
                    <span key={index} className={styles.roleTag}>
                      {role === 'seller' ? t('company.seller') : 
                       role === 'buyer' ? t('company.buyer') : 
                       role === 'both' ? t('company.both') : role}
                    </span>
                  ))
                ) : (
                  <span className={styles.roleTag}>{t('company.seller')}</span>
                )}
              </div>
              <p className={styles.rolesNote}>
                {t('company.companyRolesNote')}
              </p>
            </div>
            <div className={styles.logoUploadSection}>
              <h5 className={styles.settingsPanelContentH5}>{t('company.companyLogo')}</h5>
              {logoError && <p className={styles.errorMessage}>{logoError}</p>}
              <div className={styles.logoPreviewContainer}>
                {logoPreview ? (
                  <img src={logoPreview} alt={t('company.logoPreview')} className={styles.logoPreviewImage} />
                ) : (
                  <p className={styles.logoPreviewPlaceholder}>{t('company.noLogoUploaded')}</p>
                )}
              </div>
              <div className={styles.logoFileInputContainer}>
                <input type="file" id="logo-file" className={styles.logoFileInput} accept="image/png, image/jpeg, image/gif" onChange={handleLogoFileChange} disabled={isUploadingLogo}/>
                <label htmlFor="logo-file" className={styles.logoFileInputLabel}>
                  <i className="fas fa-upload"></i>
                  {logoFile ? logoFile.name : t('company.chooseFile')}
                </label>
              </div>
              <Button type="button" onClick={handleLogoUpload} loading={isUploadingLogo} disabled={!logoFile} fullWidth>
                {t('company.uploadNewLogo')}
              </Button>
            </div>
          </div>
        </div>
        <div className={styles.centerRow}>
            <Button type="submit" loading={isSaving} disabled={isUploadingLogo} size="lg">
            {t('company.saveGeneralInfo')}
            </Button>
        </div>
      </form>
    </div>
  );
};

const AddressBlock: React.FC<AddressBlockProps> = ({ addressType, addressData, handleChange }) => {
  const { t } = useTranslation();
  const basePath = `details.${addressType}`;
  const getAddressTypeLabel = (): string => {
    if (addressType === 'legalAddress') return t('company.legalAddress');
    if (addressType === 'actualAddress') return t('company.actualAddress');
    if (addressType === 'shippingAddress') return t('company.shippingAddress');
    return addressType;
  };

  return (
    <div className={styles.addressBlock}>
      <h5 className={styles.settingsPanelContentH5}>{getAddressTypeLabel()}</h5>
      <div className={styles.formGroup}>
        <label className={styles.formLabel} htmlFor={`${basePath}.country`}>{t('company.country')}</label>
        <Input id={`${basePath}.country`} name={`${basePath}.country`} value={addressData?.country || ''} onChange={handleChange} />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel} htmlFor={`${basePath}.addressLine1`}>{t('company.addressLine1')}</label>
        <Input id={`${basePath}.addressLine1`} name={`${basePath}.addressLine1`} value={addressData?.addressLine1 || ''} onChange={handleChange} />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel} htmlFor={`${basePath}.addressLine2`}>{t('company.addressLine2')}</label>
        <Input id={`${basePath}.addressLine2`} name={`${basePath}.addressLine2`} value={addressData?.addressLine2 || ''} onChange={handleChange} />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel} htmlFor={`${basePath}.city`}>{t('company.city')}</label>
        <Input id={`${basePath}.city`} name={`${basePath}.city`} value={addressData?.city || ''} onChange={handleChange} />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel} htmlFor={`${basePath}.stateProvinceRegion`}>{t('company.stateProvinceRegion')}</label>
        <Input id={`${basePath}.stateProvinceRegion`} name={`${basePath}.stateProvinceRegion`} value={addressData?.stateProvinceRegion || ''} onChange={handleChange} />
      </div>
      <div className={styles.formGroup}>
        <label className={styles.formLabel} htmlFor={`${basePath}.postalCode`}>{t('company.postalCode')}</label>
        <Input id={`${basePath}.postalCode`} name={`${basePath}.postalCode`} value={addressData?.postalCode || ''} onChange={handleChange} />
      </div>
    </div>
  );
};

const AddressSettings: React.FC<AddressSettingsProps> = ({ 
  data, 
  handleChange, 
  handleSave, 
  isSaving, 
  error, 
  setCompanyData,
  openConfirmation
}) => {
  const { t } = useTranslation();

  const handleSetAllAddresses = (): void => {
    const confirmAction = () => {
      const legalAddress = data.details?.legalAddress;
      if (legalAddress) {
        setCompanyData(prev => {
          const newDetails = { ...(prev.details || {}) };
          newDetails.actualAddress = { ...(newDetails.actualAddress || {}), ...legalAddress };
          newDetails.shippingAddress = { ...(newDetails.shippingAddress || {}), ...legalAddress };
          return { ...prev, details: newDetails };
        });
      }
    };

    openConfirmation(
      t('company.confirmAddressCopy'),
      t('company.confirmAddressCopyMessage'),
      confirmAction
    );
  };

  return (
    <div className={styles.settingsPanelContent}>
      <h4 className={styles.settingsPanelContentH4}>{t('company.addressSettings')}</h4>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <form onSubmit={e => { e.preventDefault(); handleSave('addresses'); }}>
        <div className={styles.addressColumnsContainer}>
            <AddressBlock addressType="legalAddress" addressData={data.details?.legalAddress} handleChange={handleChange} />
            <AddressBlock addressType="actualAddress" addressData={data.details?.actualAddress} handleChange={handleChange} />
            <AddressBlock addressType="shippingAddress" addressData={data.details?.shippingAddress} handleChange={handleChange} />
        </div>
        <div className={styles.centerRowMdGap}>
          <Button type="button" onClick={handleSetAllAddresses} disabled={isSaving} variant="secondary">
            {t('company.setLegalAddressForAll')}
          </Button>
          <Button type="submit" loading={isSaving} size="lg">
            {t('company.saveAddresses')}
          </Button>
        </div>
      </form>
    </div>
  );
};

const BankInfoSettings: React.FC<BankInfoSettingsProps> = ({ data, handleChange, handleSave, isSaving, error }) => {
  const { t } = useTranslation();
  const bankInfo = data.details?.bankInformation || {};
  const correspondentBankInfo = bankInfo.correspondentBank || {};

  return (
    <div className={styles.settingsPanelContent}>
      <h4 className={styles.settingsPanelContentH4}>{t('company.bankInformation')}</h4>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <form onSubmit={e => { e.preventDefault(); handleSave('bank'); }}>
        <div className={styles.bankInfoColumnsContainer}>
          <div className={styles.bankInfoColumn}>
            <h5 className={styles.settingsPanelContentH5}>{t('company.mainBankAccount')}</h5>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="bankInfo.accountName">{t('company.bankAccountName')}</label>
              <Input id="bankInfo.accountName" name="details.bankInformation.accountName" value={bankInfo.accountName || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="bankInfo.bankName">{t('company.bankName')}</label>
              <Input id="bankInfo.bankName" name="details.bankInformation.bankName" value={bankInfo.bankName || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="bankInfo.accountNumber">{t('company.bankAccountNumber')}</label>
              <Input id="bankInfo.accountNumber" name="details.bankInformation.accountNumber" value={bankInfo.accountNumber || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="bankInfo.routingNumber">{t('company.abaRoutingNumber')}</label>
              <Input id="bankInfo.routingNumber" name="details.bankInformation.routingNumber" value={bankInfo.routingNumber || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="bankInfo.swiftCode">{t('company.swiftCode')}</label>
              <Input id="bankInfo.swiftCode" name="details.bankInformation.swiftCode" value={bankInfo.swiftCode || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="bankInfo.bankAddress">{t('company.bankAddress')}</label>
              <Input id="bankInfo.bankAddress" name="details.bankInformation.bankAddress" value={bankInfo.bankAddress || ''} onChange={handleChange} />
            </div>
          </div>
          <div className={styles.bankInfoColumn}>
            <h5 className={styles.settingsPanelContentH5}>{t('company.correspondentBankOptional')}</h5>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="corrBank.accountName">{t('company.correspondentBankAccountName')}</label>
              <Input id="corrBank.accountName" name="details.bankInformation.correspondentBank.accountName" value={correspondentBankInfo.accountName || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="corrBank.bankName">{t('company.correspondentBankName')}</label>
              <Input id="corrBank.bankName" name="details.bankInformation.correspondentBank.bankName" value={correspondentBankInfo.bankName || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="corrBank.accountNumber">{t('company.correspondentBankAccountNumber')}</label>
              <Input id="corrBank.accountNumber" name="details.bankInformation.correspondentBank.accountNumber" value={correspondentBankInfo.accountNumber || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="corrBank.swiftCode">{t('company.correspondentBankSwiftCode')}</label>
              <Input id="corrBank.swiftCode" name="details.bankInformation.correspondentBank.swiftCode" value={correspondentBankInfo.swiftCode || ''} onChange={handleChange} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="corrBank.bankAddress">{t('company.correspondentBankAddress')}</label>
              <Input id="corrBank.bankAddress" name="details.bankInformation.correspondentBank.bankAddress" value={correspondentBankInfo.bankAddress || ''} onChange={handleChange} />
            </div>
          </div>
        </div>
        <div className={styles.centerRowSm}>
            <Button type="submit" loading={isSaving} size="lg">
            {t('company.saveBankInformation')}
            </Button>
        </div>
      </form>
    </div>
  );
};

const TaxSettings: React.FC<TaxSettingsProps> = ({ data, handleChange, handleSave, isSaving, error }) => {
  const { t } = useTranslation();
  const taxInfo = data.details?.taxInformation || {};

  return (
    <div className={styles.settingsPanelContent}>
      <h4 className={styles.settingsPanelContentH4}>{t('company.taxInformation')}</h4>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <form onSubmit={e => { e.preventDefault(); handleSave('tax'); }}>
        <div className={styles.fixedFormWidth}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="taxInfo.taxId">{t('company.taxId')}</label>
            <Input id="taxInfo.taxId" name="details.taxInformation.taxId" value={taxInfo.taxId || ''} onChange={handleChange} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="taxInfo.vatNumber">{t('company.vatNumber')}</label>
            <Input id="taxInfo.vatNumber" name="details.taxInformation.vatNumber" value={taxInfo.vatNumber || ''} onChange={handleChange} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="taxInfo.worksWithVat">{t('company.worksWithVat')}</label>
            <Select
              id="taxInfo.worksWithVat"
              name="details.taxInformation.worksWithVat"
              value={taxInfo.worksWithVat ? 'true' : 'false'}
              onChange={handleChange}
              options={[
                { value: 'true', label: t('common.yes') },
                { value: 'false', label: t('common.no') },
              ]}
            />
          </div>
        </div>
        <div className={styles.leftRowLg}>
            <Button type="submit" loading={isSaving} size="lg">
            {t('company.saveTaxInformation')}
            </Button>
        </div>
      </form>
    </div>
  );
};

const PaymentSettings: React.FC<PaymentSettingsProps> = ({ data, handleChange, handleSave, isSaving, error }) => {
  const { t } = useTranslation();
  // Default: Stripe enabled unless the server explicitly returned `false`.
  const stripeEnabled = data.paymentSettings?.stripeEnabled !== false;

  return (
    <div className={styles.settingsPanelContent}>
      <h4 className={styles.settingsPanelContentH4}>{t('company.paymentSettings')}</h4>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <form onSubmit={e => { e.preventDefault(); handleSave('payments'); }}>
        <div className={styles.fixedFormWidth}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="paymentSettings.stripeEnabled">
              {t('company.stripePayments')}
            </label>
            <Select
              id="paymentSettings.stripeEnabled"
              name="paymentSettings.stripeEnabled"
              value={stripeEnabled ? 'true' : 'false'}
              onChange={handleChange}
              options={[
                { value: 'true', label: t('company.stripePaymentsEnabled') },
                { value: 'false', label: t('company.stripePaymentsDisabled') },
              ]}
            />
            <p className={styles.rolesNote}>
              {t('company.stripePaymentsNote')}
            </p>
          </div>
        </div>
        <div className={styles.leftRowLg}>
          <Button type="submit" loading={isSaving} size="lg">
            {t('company.savePaymentSettings')}
          </Button>
        </div>
      </form>
    </div>
  );
};

const CompanySettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth() as AuthContextType;
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('general');
  const [companyData, setCompanyData] = useState<Company>({ _id: '', name: '' });
  const [loading, setLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { /* Default empty handler */ },
  });

  const fetchCompanyData = useCallback(async (): Promise<void> => {
    if (!user || !user.company) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<Company>('/company/profile');
      setCompanyData(response.data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || t('company.failedToLoadCompanyData'));
    } finally {
      setLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    fetchCompanyData();
  }, [fetchCompanyData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
    const { name, value, type } = e.target;
    
    const inputValue = (type === 'checkbox') 
      ? (e.target as HTMLInputElement).checked
      : (type === 'select-one' && (value === 'true' || value === 'false')) 
        ? value === 'true'
        : value;
    
    const nameParts = name.split('.');
    setCompanyData(prevData => {
      const newData = JSON.parse(JSON.stringify(prevData));
      
      let currentLevel = newData;
      for (let i = 0; i < nameParts.length - 1; i++) {
        const part = nameParts[i];
        if (!currentLevel[part] || typeof currentLevel[part] !== 'object') {
          currentLevel[part] = {};
        }
        currentLevel = currentLevel[part];
      }
      
      const finalKey = nameParts[nameParts.length - 1];
      currentLevel[finalKey] = inputValue;
      
      return newData;
    });
  };

  const handleSaveData = async (section = 'all'): Promise<void> => {
    setIsSaving(true);
    setError(null);
    
    let dataToSave: Partial<Company> = {};
    
    if (section === 'general' || section === 'all') {
      dataToSave = {
        name: companyData.name,
        description: companyData.description,
        details: {
          ...companyData.details,
          phone: companyData.details?.phone,
          email: companyData.details?.email,
          website: companyData.details?.website,
          companyCountry: companyData.details?.companyCountry,
          technology: companyData.details?.technology
        }
      };
    }
    
    if (section === 'addresses' || section === 'all') {
      dataToSave.details = {
        ...dataToSave.details,
        legalAddress: companyData.details?.legalAddress,
        actualAddress: companyData.details?.actualAddress,
        shippingAddress: companyData.details?.shippingAddress
      };
    }
    
    if (section === 'bank' || section === 'all') {
      dataToSave.details = {
        ...dataToSave.details,
        bankInformation: companyData.details?.bankInformation
      };
    }
    
    if (section === 'tax' || section === 'all') {
      dataToSave.details = {
        ...dataToSave.details,
        taxInformation: companyData.details?.taxInformation
      };
    }

    if (section === 'payments' || section === 'all') {
      dataToSave.paymentSettings = {
        stripeEnabled: companyData.paymentSettings?.stripeEnabled !== false
      };
    }

    try {
      await api.put('/company/profile', dataToSave);
      setNotification({
        isOpen: true,
        title: t('common.success'),
        message: t('company.companyUpdatedSuccessfully', { section: section === 'all' ? t('company.profile') : section })
      });
      await fetchCompanyData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      setError(error.response?.data?.message || t('company.companyUpdateFailed', { section }));
    } finally {
      setIsSaving(false);
    }
  };

  const openConfirmationModal = (title: string, message: string, onConfirm: () => void) => {
    setConfirmation({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirmationModal = () => {
    setConfirmation({ isOpen: false, title: '', message: '', onConfirm: () => { /* Default empty handler */ } });
  };

  const handleConfirm = () => {
    confirmation.onConfirm();
    closeConfirmationModal();
  };

  const tabs: TabItem[] = [
    { key: 'general', label: t('company.general'), icon: 'fas fa-info-circle' },
    { key: 'addresses', label: t('company.addresses'), icon: 'fas fa-map-marker-alt' },
    { key: 'bank', label: t('company.bankInfo'), icon: 'fas fa-university' },
    { key: 'tax', label: t('company.tax'), icon: 'fas fa-receipt' },
    { key: 'payments', label: t('company.payments'), icon: 'fas fa-credit-card' },
  ];

  const renderSubTabContent = (): React.ReactNode => {
    switch (activeSubTab) {
      case 'general':
        return <GeneralInfoSettings data={companyData} handleChange={handleInputChange} handleSave={() => handleSaveData('general')} isSaving={isSaving} error={error} fetchCompanyData={fetchCompanyData} setNotification={setNotification} />;
      case 'addresses':
        return <AddressSettings data={companyData} handleChange={handleInputChange} handleSave={() => handleSaveData('addresses')} isSaving={isSaving} error={error} setCompanyData={setCompanyData} openConfirmation={openConfirmationModal} />;
      case 'bank':
        return <BankInfoSettings data={companyData} handleChange={handleInputChange} handleSave={() => handleSaveData('bank')} isSaving={isSaving} error={error} />;
      case 'tax':
        return <TaxSettings data={companyData} handleChange={handleInputChange} handleSave={() => handleSaveData('tax')} isSaving={isSaving} error={error} />;
      case 'payments':
        return <PaymentSettings data={companyData} handleChange={handleInputChange} handleSave={() => handleSaveData('payments')} isSaving={isSaving} error={error} />;
      default:
        return null;
    }
  };

  if (loading) {
    return <div className="loading-container">{t('company.loadingCompanyInformation')}</div>;
  }
  
  if (error && !companyData._id) {
    return <div className="error-container">{error}</div>;
  }

  return (
    <div className={styles.companySettingsPanelContainer}>
      <div className={styles.settingsPanelHeader}>
        <Tabs
          tabs={tabs}
          activeTab={activeSubTab}
          onTabChange={(tabKey) => setActiveSubTab(tabKey as SubTab)}
          className={styles.settingsPanelTabs}
        />
      </div>
      
      {loading && <p>{t('company.loadingCompanyData')}</p>}
      {error && <p className={styles.errorMessage}>{error}</p>}
      
      {!loading && !error && companyData && (
        <div>
          {renderSubTabContent()}
        </div>
      )}

      <Modal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        footer={<Button onClick={() => setNotification({ ...notification, isOpen: false })}>{t('common.close')}</Button>}
      >
        <p>{notification.message}</p>
      </Modal>

      <Modal
        isOpen={confirmation.isOpen}
        onClose={closeConfirmationModal}
        title={confirmation.title}
        footer={
          <>
            <Button onClick={closeConfirmationModal} variant="neutral">{t('common.cancel')}</Button>
            <Button onClick={handleConfirm} variant="primary">{t('company.confirm')}</Button>
          </>
        }
      >
        <p>{confirmation.message}</p>
      </Modal>

    </div>
  );
};

export default CompanySettingsPanel; 