import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import { useParams, Link, useNavigate } from '../../routes';
import styles from './ApiConfigurationEditPage.module.css';
import { Company } from '../../types';
import Modal from '../../components/common/Modal/Modal';
import Button from '../../components/common/Button/Button';
import api from '../../api';

// Interface for URL parameters
interface ApiConfigurationParams {
  companyId: string;
  [key: string]: string;
}

// Types for API configuration
interface SyncSchedule {
  frequency: 'daily' | 'hourly' | 'manual';
  timeOfDay: string;
}

interface TokenAuthConfig {
  enabled: boolean;
  url: string;
  requestType: 'post' | 'get';
  params: string | Record<string, unknown>;
  headers: string | Record<string, unknown>;
  bodyPayload: string | Record<string, unknown>;
  bodyEncodeType: 'json' | 'form' | 'string';
  tokensPathInResponse: string;
  tokenUsage: string | unknown[];
}

interface ApiConfigBase {
  url: string;
  requestType: 'get' | 'post';
  headers: string | Record<string, unknown>;
  params: string | Record<string, unknown>;
  dataKey: string;
  totalCountPath?: string;
  filter: string | Record<string, unknown>;
  baseBodyPayload: string | Record<string, unknown>;
}

interface ApiConfigFormData {
  isActive: boolean;
  allowMissingMedia: boolean;
  config: ApiConfigBase;
  syncSchedule: SyncSchedule;
  tokenAuthConfig: TokenAuthConfig;
}

interface NotificationState {
  isOpen: boolean;
  title: string;
  message: string;
}

const initialFormData: ApiConfigFormData = {
  isActive: true,
  allowMissingMedia: false,
  config: {
    url: '',
    requestType: 'get',
    headers: '{}', // Will be a string representation of JSON in the textarea
    params: '{}',  // Will be a string representation of JSON in the textarea
    dataKey: 'data',
    totalCountPath: '', // Optional: path in response to total count for pagination (e.g. data.totalCount)
    filter: '{}',   // Will be a string representation of JSON in the textarea for ease of initial setup
    baseBodyPayload: '{}' // Initialize as an empty object
  },
  syncSchedule: {
    frequency: 'daily',
    timeOfDay: '00:00'
  },
  tokenAuthConfig: {
    enabled: false,
    url: '',
    requestType: 'post',
    params: '{}', // string representation of JSON
    headers: '{}', // string representation of JSON
    bodyPayload: '{}', // string representation of JSON
    bodyEncodeType: 'json',
    tokensPathInResponse: 'token', // Can be a string or a string representation of JSON for an object
    tokenUsage: '[]' // Array of complex objects: processing will be handled later
  }
};

function ApiConfigurationEditPage(): React.ReactElement {
  const { t } = useTranslation();
  const { companyId } = useParams<ApiConfigurationParams>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState<ApiConfigFormData>(initialFormData);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const fetchConfig = useCallback(async () => {
    if (!companyId) return;
    
    setLoading(true);
    setError(null);
    try {
      const companyDetailsRes = await api.get<{company: Company}>(`/admin/companies/${companyId}`);
      setCompany(companyDetailsRes.data.company);

      try {
        const configRes = await api.get<ApiConfigFormData>(`/admin/company-api/${companyId}/config`);
        const existingConfig = configRes.data;

        const newFormData = { ...initialFormData, ...existingConfig };

        const configFromServer = existingConfig.config || {};
        newFormData.config = {
          ...initialFormData.config,
          ...configFromServer,
          totalCountPath: configFromServer.totalCountPath ?? initialFormData.config.totalCountPath ?? '',
          filter: (configFromServer.filter && typeof configFromServer.filter === 'object')
                    ? JSON.stringify(configFromServer.filter, null, 2)
                    : initialFormData.config.filter,
          baseBodyPayload: (configFromServer.baseBodyPayload && typeof configFromServer.baseBodyPayload === 'object')
                    ? JSON.stringify(configFromServer.baseBodyPayload, null, 2)
                    : initialFormData.config.baseBodyPayload
        };

        newFormData.syncSchedule = { ...initialFormData.syncSchedule, ...(existingConfig.syncSchedule || {}) };
        newFormData.tokenAuthConfig = { ...initialFormData.tokenAuthConfig, ...(existingConfig.tokenAuthConfig || {}) };
        
        // Convert objects to string representation of JSON for textarea fields
        newFormData.config.headers = typeof newFormData.config.headers === 'object' 
          ? JSON.stringify(newFormData.config.headers || {}, null, 2)
          : (newFormData.config.headers || '{}');
        
        newFormData.config.params = typeof newFormData.config.params === 'object'
          ? JSON.stringify(newFormData.config.params || {}, null, 2)
          : (newFormData.config.params || '{}');
        
        let filterForStringify = {};
        if (typeof newFormData.config.filter === 'object' && newFormData.config.filter !== null && Object.keys(newFormData.config.filter).length > 0) {
          filterForStringify = newFormData.config.filter;
        }
        newFormData.config.filter = typeof newFormData.config.filter === 'object'
          ? JSON.stringify(filterForStringify, null, 2)
          : (newFormData.config.filter || '{}');
        
        let baseBodyPayloadForStringify = {};
        if (typeof newFormData.config.baseBodyPayload === 'object' && newFormData.config.baseBodyPayload !== null && Object.keys(newFormData.config.baseBodyPayload).length > 0) {
          baseBodyPayloadForStringify = newFormData.config.baseBodyPayload;
        }
        newFormData.config.baseBodyPayload = typeof newFormData.config.baseBodyPayload === 'object'
          ? JSON.stringify(baseBodyPayloadForStringify, null, 2)
          : (newFormData.config.baseBodyPayload || '{}');
        
        newFormData.tokenAuthConfig.params = typeof newFormData.tokenAuthConfig.params === 'object'
          ? JSON.stringify(newFormData.tokenAuthConfig.params || {}, null, 2)
          : (newFormData.tokenAuthConfig.params || '{}');
        
        newFormData.tokenAuthConfig.headers = typeof newFormData.tokenAuthConfig.headers === 'object'
          ? JSON.stringify(newFormData.tokenAuthConfig.headers || {}, null, 2)
          : (newFormData.tokenAuthConfig.headers || '{}');
        
        newFormData.tokenAuthConfig.bodyPayload = typeof newFormData.tokenAuthConfig.bodyPayload === 'object'
          ? JSON.stringify(newFormData.tokenAuthConfig.bodyPayload || {}, null, 2)
          : (newFormData.tokenAuthConfig.bodyPayload || '{}');
        
        if (typeof newFormData.tokenAuthConfig.tokensPathInResponse === 'object') {
          newFormData.tokenAuthConfig.tokensPathInResponse = JSON.stringify(newFormData.tokenAuthConfig.tokensPathInResponse, null, 2);
        } else if (newFormData.tokenAuthConfig.tokensPathInResponse === undefined || newFormData.tokenAuthConfig.tokensPathInResponse === null) {
           newFormData.tokenAuthConfig.tokensPathInResponse = 'token'; // Revert to default value if it was null/undefined from the database
        }

        // Ensure tokenUsage is an array and convert it to a string for the textarea
        newFormData.tokenAuthConfig.tokenUsage = typeof newFormData.tokenAuthConfig.tokenUsage === 'object'
          ? JSON.stringify(Array.isArray(newFormData.tokenAuthConfig.tokenUsage) ? newFormData.tokenAuthConfig.tokenUsage : [], null, 2)
          : (newFormData.tokenAuthConfig.tokenUsage || '[]');
        
        setFormData(newFormData);
      } catch (configErr: unknown) {
        const err = configErr as { response?: { status?: number } };
        if (err.response && err.response.status === 404) {
          const resetData = JSON.parse(JSON.stringify(initialFormData)); // Deep clone of initial

          const initialConfigFilter = initialFormData.config.filter;
          resetData.config.filter = (initialConfigFilter && typeof initialConfigFilter === 'object')
                                      ? JSON.stringify(initialConfigFilter, null, 2)
                                      : initialConfigFilter;
                                      
          const initialBaseBodyPayload = initialFormData.config.baseBodyPayload;
          resetData.config.baseBodyPayload = (initialBaseBodyPayload && typeof initialBaseBodyPayload === 'object')
                                           ? JSON.stringify(initialBaseBodyPayload, null, 2)
                                           : initialBaseBodyPayload;

          resetData.config.headers = typeof resetData.config.headers === 'object'
            ? JSON.stringify(resetData.config.headers || {}, null, 2)
            : resetData.config.headers;
            
          resetData.config.params = typeof resetData.config.params === 'object'
            ? JSON.stringify(resetData.config.params || {}, null, 2)
            : resetData.config.params;
          
          let resetFilterForStringify = {};
          if (typeof resetData.config.filter === 'object' && resetData.config.filter !== null && Object.keys(resetData.config.filter).length > 0) {
            resetFilterForStringify = resetData.config.filter;
          }
          resetData.config.filter = typeof resetData.config.filter === 'object'
            ? JSON.stringify(resetFilterForStringify, null, 2)
            : resetData.config.filter;

          let resetBaseBodyPayloadForStringify = {};
          if (typeof resetData.config.baseBodyPayload === 'object' && resetData.config.baseBodyPayload !== null && Object.keys(resetData.config.baseBodyPayload).length > 0) {
            resetBaseBodyPayloadForStringify = resetData.config.baseBodyPayload;
          }
          resetData.config.baseBodyPayload = typeof resetData.config.baseBodyPayload === 'object'
            ? JSON.stringify(resetBaseBodyPayloadForStringify, null, 2)
            : resetData.config.baseBodyPayload;

          resetData.tokenAuthConfig.params = typeof resetData.tokenAuthConfig.params === 'object'
            ? JSON.stringify(resetData.tokenAuthConfig.params || {}, null, 2)
            : resetData.tokenAuthConfig.params;
            
          resetData.tokenAuthConfig.headers = typeof resetData.tokenAuthConfig.headers === 'object'
            ? JSON.stringify(resetData.tokenAuthConfig.headers, null, 2)
            : resetData.tokenAuthConfig.headers;
            
          resetData.tokenAuthConfig.bodyPayload = typeof resetData.tokenAuthConfig.bodyPayload === 'object'
            ? JSON.stringify(resetData.tokenAuthConfig.bodyPayload, null, 2)
            : resetData.tokenAuthConfig.bodyPayload;
            
          // Stringify tokenUsage for the resetData textarea
          resetData.tokenAuthConfig.tokenUsage = typeof resetData.tokenAuthConfig.tokenUsage === 'object'
            ? JSON.stringify(Array.isArray(resetData.tokenAuthConfig.tokenUsage) ? resetData.tokenAuthConfig.tokenUsage : [], null, 2)
            : resetData.tokenAuthConfig.tokenUsage;
            
          setFormData(resetData);
        } else {
          setError(t('apiConfig.failedToFetchApiConfiguration'));
        }
      }
    } catch (companyErr) {
      setError(t('apiConfig.failedToFetchCompanyDetails'));
    }
    setLoading(false);
  }, [companyId, t]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const parts = name.split('.');
  
    setFormData(prevData => {
      const newData = JSON.parse(JSON.stringify(prevData)); // Deep clone for safety
  
      let current = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {}; // Create the path if it doesn't exist
        }
        current = current[parts[i]];
      }
  
      current[parts[parts.length - 1]] = type === 'checkbox' ? checked : value;
      return newData;
    });
  };
  
  const handleJsonStringChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const parts = name.split('.');

    setFormData(prevData => {
      const newData = JSON.parse(JSON.stringify(prevData)); // Deep clone
      let current = newData;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value; // Value is the raw string from the textarea
      return newData;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const submissionData = JSON.parse(JSON.stringify(formData));

      const parseJsonField = (obj: Record<string, unknown>, path: string) => {
        const keys = path.split('.');
        let current: Record<string, unknown> = obj;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) return; // Path does not exist, nothing to parse
          current = current[keys[i]] as Record<string, unknown>;
        }
        const fieldName = keys[keys.length - 1];
        if (typeof current[fieldName] === 'string') {
            try {
                current[fieldName] = JSON.parse(current[fieldName]);
            } catch (parseError) {
                let errorMsg = `${t('apiConfig.invalidJsonInField')} ${path.replace('.', ' → ')}`;
                if (parseError instanceof Error && parseError.message) {
                  const match = parseError.message.match(/position\s+(\d+)/i);
                  if (match) {
                    const pos = parseInt(match[1], 10);
                    errorMsg += `. ${t('apiConfig.errorNearPosition')} ${pos}.`;
                  } else {
                    errorMsg += `: ${parseError.message}`;
                  }
                }
                setError(errorMsg);
                throw parseError; // Stop submission if critical JSON is incorrect
            }
        }
      };
      
      // Parse JSON fields of the general configuration
      parseJsonField(submissionData, 'config.headers');
      parseJsonField(submissionData, 'config.params');
      parseJsonField(submissionData, 'config.filter');
      parseJsonField(submissionData, 'config.baseBodyPayload');

      // Parse tokenAuthConfig JSON fields if tokenAuthConfig exists
      if (submissionData.tokenAuthConfig) {
        // These fields are JSON strings from textareas, parse them first
        parseJsonField(submissionData, 'tokenAuthConfig.params');
        parseJsonField(submissionData, 'tokenAuthConfig.headers');
        parseJsonField(submissionData, 'tokenAuthConfig.bodyPayload');
        parseJsonField(submissionData, 'tokenAuthConfig.tokenUsage'); // Ensure that the string "[]" becomes an array [], etc.

        if (submissionData.tokenAuthConfig.enabled) {
          // Special handling for tokensPathInResponse, as it can be a string or an object
          if (typeof submissionData.tokenAuthConfig.tokensPathInResponse === 'string' &&
              (submissionData.tokenAuthConfig.tokensPathInResponse.trim().startsWith('{') || submissionData.tokenAuthConfig.tokensPathInResponse.trim().startsWith('['))) {
            try {
              submissionData.tokenAuthConfig.tokensPathInResponse = JSON.parse(submissionData.tokenAuthConfig.tokensPathInResponse);
            } catch (parseError) {
              let errorMsg = `${t('apiConfig.invalidJsonInField')} Token Auth → Tokens Path In Response`;
              if (parseError instanceof Error && parseError.message) {
                const match = parseError.message.match(/position\s+(\d+)/i);
                if (match) {
                  const pos = parseInt(match[1], 10);
                  errorMsg += `. ${t('apiConfig.errorNearPosition')} ${pos}.`;
                } else {
                  errorMsg += `: ${parseError.message}`;
                }
              }
              setError(errorMsg);
              throw parseError;
            }
          }
        } else {
          // If token authentication is disabled, clear URL to avoid validation errors
          delete submissionData.tokenAuthConfig.url;
          // Ensure other optional fields are cleared or set to proper defaults
          submissionData.tokenAuthConfig.params = {};
          submissionData.tokenAuthConfig.headers = {};
          submissionData.tokenAuthConfig.bodyPayload = {};
          submissionData.tokenAuthConfig.tokensPathInResponse = '';
          submissionData.tokenAuthConfig.tokenUsage = [];
        }
      }

      if (companyId) {
        await api.put(`/admin/company-api/${companyId}/config`, submissionData);
        setNotification({
          isOpen: true,
          title: t('apiConfig.success'),
          message: t('apiConfig.apiConfigurationSavedSuccessfully'),
        });
        setTimeout(() => navigate('/admin-panel', { state: { activeTab: 'api-config' } }), 2000);
      }
    } catch (err) {
      // If the error came from parseJsonField, setError has already been called.
      if (!error) { // Avoid overwriting a specific JSON parsing error
        const errorMessage = err instanceof Error ? err.message : 'Failed to save configuration.';
        setError(errorMessage);
      }
      // Do not redirect after an error, so the user can fix the issue
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className={styles['loading-message']}>{t('apiConfig.loadingConfiguration')}</div>;
  }

  // Show retry only if the error is not related to the company not being found (company is null)
  if (error && company) { 
    return <div className={styles['error-message']}>{t('apiConfig.error')} {error} <button onClick={fetchConfig} className="btn btn-sm btn-secondary">{t('apiConfig.retry')}</button></div>;
  } else if (error && !company) {
     return <div className={styles['error-message']}>{t('apiConfig.error')} {error}. {t('apiConfig.companyDetailsCouldNotBeLoaded')} <Link to="/admin-panel" className={styles['back-button']}>{t('apiConfig.backToAdminPanel')}</Link></div>;
  }
  if (!company) { // Shouldn't happen if loading = false and there is no error, but as a safeguard
    return <div className={styles['loading-message']}>{t('apiConfig.companyDetailsNotAvailable')} <Link to="/admin-panel" className={styles['back-button']}>{t('apiConfig.backToAdminPanel')}</Link></div>;
  }

  return (
    <main className={styles['api-configuration-edit-page']}>
      <header className="page-header">
        <h1 className="page-title">{t('apiConfig.configureApiFor')} {company ? company.name : companyId}</h1>
      </header>
      
      {error && (
        <div className={styles['error-notification']}>
          <div className={styles['error-content']}>
            <span className={styles['error-icon']}>⚠️</span>
            <span className={styles['error-text']}>{t('apiConfig.error')} {error}</span>
            <button className={styles['error-close']} onClick={() => setError(null)}>×</button>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      <Modal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        footer={<Button onClick={() => setNotification({ ...notification, isOpen: false })}>{t('apiConfig.close')}</Button>}
      >
        <p>{notification.message}</p>
      </Modal>

      <form onSubmit={handleSubmit} className={styles['api-config-form']}>
        {/* Left column */}
        <div className={styles['api-config-column']}>
          {/* General Config Section */}
          <fieldset className={styles['api-config-fieldset']}>
            <legend className={styles['api-config-legend']}>{t('apiConfig.generalApiSettings')}</legend>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.url" className={styles['api-config-label']}>{t('apiConfig.apiUrl')}</label>
              <input type="url" id="config.url" name="config.url" value={formData.config.url} onChange={handleChange} required className={styles['api-config-input']} />
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.requestType" className={styles['api-config-label']}>{t('apiConfig.requestType')}</label>
              <select id="config.requestType" name="config.requestType" value={formData.config.requestType} onChange={handleChange} className={styles['api-config-select']}>
                <option value="get">{t('apiConfig.get')}</option>
                <option value="post">{t('apiConfig.post')}</option>
              </select>
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.headers" className={styles['api-config-label']}>{t('apiConfig.headersJson')}</label>
              <textarea id="config.headers" name="config.headers" value={typeof formData.config.headers === 'string' ? formData.config.headers : '{}'} onChange={handleJsonStringChange} rows={3} className={styles['api-config-textarea']} placeholder={t('apiConfig.headersPlaceholder')}></textarea>
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.params" className={styles['api-config-label']}>{t('apiConfig.parametersJson')}</label>
              <textarea id="config.params" name="config.params" value={typeof formData.config.params === 'string' ? formData.config.params : '{}'} onChange={handleJsonStringChange} rows={3} className={styles['api-config-textarea']} placeholder={t('apiConfig.parametersPlaceholder')}></textarea>
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.dataKey" className={styles['api-config-label']}>{t('apiConfig.dataKey')}</label>
              <input type="text" id="config.dataKey" name="config.dataKey" value={formData.config.dataKey} onChange={handleChange} className={styles['api-config-input']} />
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.totalCountPath" className={styles['api-config-label']}>{t('apiConfig.totalCountPath')}</label>
              <input type="text" id="config.totalCountPath" name="config.totalCountPath" value={formData.config.totalCountPath ?? ''} onChange={handleChange} className={styles['api-config-input']} placeholder={t('apiConfig.totalCountPathPlaceholder')} />
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.filter" className={styles['api-config-label']}>{t('apiConfig.apiLevelFilters')}</label>
              <textarea id="config.filter" name="config.filter" value={typeof formData.config.filter === 'string' ? formData.config.filter : '{}'} onChange={handleJsonStringChange} rows={3} className={styles['api-config-textarea']} placeholder={t('apiConfig.filtersPlaceholder')}></textarea>
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="config.baseBodyPayload" className={styles['api-config-label']}>{t('apiConfig.baseBodyPayload')}</label>
              <textarea id="config.baseBodyPayload" name="config.baseBodyPayload" value={typeof formData.config.baseBodyPayload === 'string' ? formData.config.baseBodyPayload : '{}'} onChange={handleJsonStringChange} rows={4} className={styles['api-config-textarea']} placeholder={t('apiConfig.baseBodyPayloadPlaceholder')}></textarea>
            </div>
          </fieldset>
        </div>
        
        {/* Right column */}
        <div className={styles['api-config-column']}>
          {/* Sync Schedule Section - moved to the right column */}
          <fieldset className={styles['api-config-fieldset']}>
            <legend className={styles['api-config-legend']}>{t('apiConfig.syncSettings')}</legend>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="syncSchedule.frequency" className={styles['api-config-label']}>{t('apiConfig.frequency')}</label>
              <select id="syncSchedule.frequency" name="syncSchedule.frequency" value={formData.syncSchedule.frequency} onChange={handleChange} className={styles['api-config-select']}>
                <option value="daily">{t('apiConfig.daily')}</option>
                <option value="hourly">{t('apiConfig.hourly')}</option>
                <option value="manual">{t('apiConfig.manual')}</option>
              </select>
            </div>
            <div className={styles['api-config-input-group']}>
              <label htmlFor="syncSchedule.timeOfDay" className={styles['api-config-label']}>{t('apiConfig.timeOfDay')}</label>
              <input type="text" id="syncSchedule.timeOfDay" name="syncSchedule.timeOfDay" value={formData.syncSchedule.timeOfDay} onChange={handleChange} pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" placeholder={t('apiConfig.timeOfDayPlaceholder')} className={styles['api-config-input']} />
            </div>
            <div className={`${styles['api-config-input-group']} ${styles['checkbox-group']}`}>
              <input type="checkbox" id="allowMissingMedia" name="allowMissingMedia" checked={formData.allowMissingMedia} onChange={handleChange} className={styles['api-config-checkbox']} />
              <label htmlFor="allowMissingMedia">{t('apiConfig.allowProductsWithoutPhotos')}</label>
            </div>
          </fieldset>

          {/* Token Authentication Section */}
          <fieldset className={styles['api-config-fieldset']}>
            <legend className={styles['api-config-legend']}>{t('apiConfig.tokenAuthentication')}</legend>
            <div className={styles['api-config-input-group']}>
              <input type="checkbox" id="tokenAuthConfig.enabled" name="tokenAuthConfig.enabled" checked={formData.tokenAuthConfig.enabled} onChange={handleChange} className={styles['api-config-checkbox']} />
              <label htmlFor="tokenAuthConfig.enabled">{t('apiConfig.enableTokenAuthentication')}</label>
            </div>

            {formData.tokenAuthConfig.enabled && (
              <>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.url" className={styles['api-config-label']}>{t('apiConfig.tokenApiUrl')}</label>
                  <input type="url" id="tokenAuthConfig.url" name="tokenAuthConfig.url" value={formData.tokenAuthConfig.url} onChange={handleChange} className={styles['api-config-input']} />
                </div>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.requestType" className={styles['api-config-label']}>{t('apiConfig.tokenRequestType')}</label>
                  <select id="tokenAuthConfig.requestType" name="tokenAuthConfig.requestType" value={formData.tokenAuthConfig.requestType} onChange={handleChange} className={styles['api-config-select']}>
                    <option value="post">{t('apiConfig.post')}</option>
                    <option value="get">{t('apiConfig.get')}</option>
                  </select>
                </div>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.headers" className={styles['api-config-label']}>{t('apiConfig.tokenRequestHeaders')}</label>
                  <textarea id="tokenAuthConfig.headers" name="tokenAuthConfig.headers" value={typeof formData.tokenAuthConfig.headers === 'string' ? formData.tokenAuthConfig.headers : '{}'} onChange={handleJsonStringChange} rows={3} className={styles['api-config-textarea']} placeholder={t('apiConfig.tokenRequestHeadersPlaceholder')}></textarea>
                </div>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.params" className={styles['api-config-label']}>{t('apiConfig.tokenRequestUrlParams')}</label>
                  <textarea id="tokenAuthConfig.params" name="tokenAuthConfig.params" value={typeof formData.tokenAuthConfig.params === 'string' ? formData.tokenAuthConfig.params : '{}'} onChange={handleJsonStringChange} rows={3} className={styles['api-config-textarea']} placeholder={t('apiConfig.tokenRequestUrlParamsPlaceholder')}></textarea>
                </div>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.bodyPayload" className={styles['api-config-label']}>{t('apiConfig.tokenRequestBodyPayload')}</label>
                  <textarea id="tokenAuthConfig.bodyPayload" name="tokenAuthConfig.bodyPayload" value={typeof formData.tokenAuthConfig.bodyPayload === 'string' ? formData.tokenAuthConfig.bodyPayload : '{}'} onChange={handleJsonStringChange} rows={3} className={styles['api-config-textarea']} placeholder={t('apiConfig.tokenRequestBodyPayloadPlaceholder')}></textarea>
                </div>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.bodyEncodeType" className={styles['api-config-label']}>{t('apiConfig.tokenRequestBodyEncodeType')}</label>
                  <select id="tokenAuthConfig.bodyEncodeType" name="tokenAuthConfig.bodyEncodeType" value={formData.tokenAuthConfig.bodyEncodeType} onChange={handleChange} className={styles['api-config-select']}>
                    <option value="json">{t('apiConfig.json')}</option>
                    <option value="form">{t('apiConfig.formUrlEncoded')}</option>
                    <option value="string">{t('apiConfig.string')}</option>
                  </select>
                </div>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.tokensPathInResponse" className={styles['api-config-label']}>{t('apiConfig.tokensPathInResponse')}</label>
                  <input type="text" id="tokenAuthConfig.tokensPathInResponse" name="tokenAuthConfig.tokensPathInResponse" value={formData.tokenAuthConfig.tokensPathInResponse} onChange={handleChange} className={styles['api-config-input']} placeholder={t('apiConfig.tokensPathInResponsePlaceholder')} />
                </div>
                <div className={styles['api-config-input-group']}>
                  <label htmlFor="tokenAuthConfig.tokenUsage" className={styles['api-config-label']}>{t('apiConfig.tokenUsageRules')}</label>
                  <textarea id="tokenAuthConfig.tokenUsage" name="tokenAuthConfig.tokenUsage" value={typeof formData.tokenAuthConfig.tokenUsage === 'string' ? formData.tokenAuthConfig.tokenUsage : '[]'} onChange={handleJsonStringChange} rows={5} className={styles['api-config-textarea']} placeholder={t('apiConfig.tokenUsageRulesPlaceholder')}></textarea>
                </div>
              </>
            )}
          </fieldset>
        </div>
        
        {/* Form actions - span full width */}
        <div className={styles['api-config-actions']}>
          <Link to="/admin-panel" state={{ activeTab: 'api-config' }} className={styles['back-button']}>&larr; {t('apiConfig.backToAdminPanel')}</Link>
          <button type="submit" disabled={isSaving || loading} className={styles['save-button']}>
            {isSaving ? t('apiConfig.saving') : t('apiConfig.saveConfiguration')}
          </button>
        </div>
      </form>
    </main>
  );
}

export default ApiConfigurationEditPage; 