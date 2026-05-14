import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import styles from './CompaniesList.module.css';
import sharedStyles from './AdminShared.module.css';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { Company, User, CompanyRole } from '../../types';
import Modal from '../common/Modal/Modal';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import {
  getCompaniesAndUsers,
  impersonateUser,
  transferUser,
  changeUserRole,
  deleteUser,
  CompanyWithUsers,
  createCompanyWithUser,
  CreateCompanyWithUserData,
  hardDeleteCompany
} from '../../api/adminApi';
import { updateCompanyRoles } from '../../api/companyApi';

type ConfirmationAction = 'delete' | 'impersonate';

interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  action: ConfirmationAction | null;
  userId: string | null;
}

interface NotificationState {
    isOpen: boolean;
    title: string;
    message: string;
}

function CompaniesList(): React.ReactElement {
  const { t } = useTranslation();
  const [companies, setCompanies] = useState<CompanyWithUsers[]>([]);
  const [allCompaniesForTransfer, setAllCompaniesForTransfer] = useState<Company[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const { user: currentUser, impersonate } = useAuth();
  const isFullAdmin = currentUser?.role === 'admin';
  const [openActionsUserId, setOpenActionsUserId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  // Search/filter states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [modalSearchTerm, setModalSearchTerm] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const PAGE_SIZE = 10;

  // Modal states
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  const [isCompanyRoleModalOpen, setIsCompanyRoleModalOpen] = useState<boolean>(false);
  const [isCreateCompanyModalOpen, setIsCreateCompanyModalOpen] = useState<boolean>(false);
  const [selectedUserForAction, setSelectedUserForAction] = useState<User | null>(null);
  const [selectedCompanyForAction, setSelectedCompanyForAction] = useState<Company | null>(null);
  const [selectedCompanyForTransfer, setSelectedCompanyForTransfer] = useState<string>('');
  const [selectedRoleForChange, setSelectedRoleForChange] = useState<string>('');
  const [selectedCompanyRoles, setSelectedCompanyRoles] = useState<CompanyRole[]>([]);
  
  // Create company form state
  const [createCompanyForm, setCreateCompanyForm] = useState<CreateCompanyWithUserData>({
    name: '',
    description: '',
    userEmail: '',
    userPhone: '',
    userFirstName: '',
    userLastName: '',
    userPassword: '',
    userRole: 'manager',
    companyRoles: [CompanyRole.SELLER]
  });

  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    action: null,
    userId: null,
  });

  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const fetchCompaniesAndUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCompaniesAndUsers();
      setCompanies(data);
      setAllCompaniesForTransfer(data); // Also populate the list for the transfer modal
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || (err instanceof Error ? err.message : 'Failed to fetch companies.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompaniesAndUsers();
  }, [fetchCompaniesAndUsers]);

  const toggleCompanyUsers = (companyId: string) => {
    setExpandedCompanyId(expandedCompanyId === companyId ? null : companyId);
  };

  useEffect(() => {
    if (!openActionsUserId) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!actionsMenuRef.current) return;
      if (actionsMenuRef.current.contains(event.target as Node)) return;
      setOpenActionsUserId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenActionsUserId(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openActionsUserId]);

  const handleLoginAs = async (userIdToImpersonate: string) => {
      setActionLoading(true);
      try {
      await impersonateUser(userIdToImpersonate);
      await impersonate(userIdToImpersonate);
        setNotification({
            isOpen: true,
            title: t('common.success'),
            message: t('admin.impersonationSuccess')
        });
      } catch (err) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        setNotification({
            isOpen: true,
            title: t('admin.impersonationFailed'),
            message: t('admin.impersonationFailedMessage', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) })
        });
      }
      setActionLoading(false);
  };

  const openTransferModal = (user: User) => {
    setSelectedUserForAction(user);
    setSelectedCompanyForTransfer('');
    setIsTransferModalOpen(true);
  };

  const handleTransferUser = async () => {
    if (!selectedUserForAction || !selectedCompanyForTransfer) {
      setNotification({ isOpen: true, title: t('admin.inputRequired'), message: t('admin.pleaseSelectUserAndCompany') });
      return;
    }
    setActionLoading(true);
    try {
      await transferUser(selectedUserForAction._id, selectedCompanyForTransfer);
      setNotification({ isOpen: true, title: t('common.success'), message: t('admin.userTransferredSuccess') });
      setIsTransferModalOpen(false);
      fetchCompaniesAndUsers(); // Refresh list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({ isOpen: true, title: t('common.error'), message: t('admin.userTransferFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }) });
    }
    setActionLoading(false);
  };

  const openRoleModal = (user: User) => {
    setSelectedUserForAction(user);
    setSelectedRoleForChange(user.role); // Default to current role
    setIsRoleModalOpen(true);
  };

  const openCompanyRoleModal = (company: Company) => {
    setSelectedCompanyForAction(company);
    setSelectedCompanyRoles(company.roles || [CompanyRole.SELLER]);
    setIsCompanyRoleModalOpen(true);
  };

  const handleChangeUserRole = async () => {
    if (!selectedUserForAction || !selectedRoleForChange) {
      setNotification({ isOpen: true, title: t('admin.inputRequired'), message: t('admin.pleaseSelectUserAndRole') });
      return;
    }
    setActionLoading(true);
    try {
      await changeUserRole(selectedUserForAction._id, selectedRoleForChange);
      setNotification({ isOpen: true, title: t('common.success'), message: t('admin.userRoleChangedSuccess') });
      setIsRoleModalOpen(false);
      fetchCompaniesAndUsers(); // Refresh list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({ isOpen: true, title: t('common.error'), message: t('admin.userRoleChangeFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }) });
    }
    setActionLoading(false);
  };

  const handleChangeCompanyRoles = async () => {
    if (!selectedCompanyForAction || !selectedCompanyRoles.length) {
      setNotification({ isOpen: true, title: t('admin.inputRequired'), message: t('admin.pleaseSelectCompanyRoles') });
      return;
    }
    setActionLoading(true);
    try {
      await updateCompanyRoles({
        companyId: selectedCompanyForAction._id,
        roles: selectedCompanyRoles
      });
      setNotification({ isOpen: true, title: t('common.success'), message: t('admin.companyRolesUpdatedSuccess') });
      setIsCompanyRoleModalOpen(false);
      fetchCompaniesAndUsers(); // Refresh list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({ isOpen: true, title: t('common.error'), message: t('admin.companyRolesUpdateFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }) });
    }
    setActionLoading(false);
  };

  const handleCreateCompany = async () => {
    // Validation
    if (!createCompanyForm.name || !createCompanyForm.userEmail || !createCompanyForm.userPhone || 
        !createCompanyForm.userFirstName || !createCompanyForm.userLastName || !createCompanyForm.userPassword) {
      setNotification({ 
        isOpen: true, 
        title: t('admin.inputRequired'), 
        message: t('admin.pleaseFillAllFields') 
      });
      return;
    }

    setActionLoading(true);
    try {
      await createCompanyWithUser(createCompanyForm);
      setNotification({ 
        isOpen: true, 
        title: t('common.success'), 
        message: t('admin.companyCreatedSuccess') 
      });
      setIsCreateCompanyModalOpen(false);
      // Reset form
      setCreateCompanyForm({
        name: '',
        description: '',
        userEmail: '',
        userPhone: '',
        userFirstName: '',
        userLastName: '',
        userPassword: '',
        userRole: 'manager',
        companyRoles: [CompanyRole.SELLER]
      });
      fetchCompaniesAndUsers(); // Refresh list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({ 
        isOpen: true, 
        title: t('common.error'), 
        message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError'))
      });
    }
    setActionLoading(false);
  };

  const handleDeleteUser = async (userId: string) => {
      setActionLoading(true);
      try {
        await deleteUser(userId);
        setNotification({ isOpen: true, title: t('common.success'), message: t('admin.userDeletedSuccess') });
        fetchCompaniesAndUsers(); // Refresh list
      } catch (err) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        setNotification({ isOpen: true, title: t('common.error'), message: t('admin.userDeleteFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }) });
      }
      setActionLoading(false);
  };

  const handleHardDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(t('admin.hardDeleteCompanyConfirm', { name: companyName }))) {
      return;
    }
    
    setActionLoading(true);
    try {
      const result = await hardDeleteCompany(companyId);
      setNotification({ 
        isOpen: true, 
        title: t('common.success'), 
        message: t('admin.companyHardDeletedSuccess', { name: companyName, usersCount: result.deletedUsersCount }) 
      });
      fetchCompaniesAndUsers(); // Refresh list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({ 
        isOpen: true, 
        title: t('common.error'), 
        message: t('admin.companyHardDeletedFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }) 
      });
    }
    setActionLoading(false);
  };

  const openConfirmationModal = (action: ConfirmationAction, userId: string, message: string, title: string) => {
    setConfirmation({
      isOpen: true,
      title,
      message,
      action,
      userId,
    });
  };

  const closeConfirmationModal = () => {
    setConfirmation({ isOpen: false, title: '', message: '', action: null, userId: null });
  };
  
  const handleConfirmation = async () => {
    if (!confirmation.action || !confirmation.userId) return;

    if (confirmation.action === 'delete') {
      await handleDeleteUser(confirmation.userId);
    } else if (confirmation.action === 'impersonate') {
      await handleLoginAs(confirmation.userId);
    }
    closeConfirmationModal();
  };

  const filteredCompanies = useMemo(() =>
    companies.filter(company =>
      company.name.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [companies, searchTerm]
  );

  const getCompanyStatusTone = (status?: string): 'success' | 'warning' | 'danger' | 'neutral' => {
    const s = (status || '').toLowerCase();
    if (s === 'active' || s === 'approved') return 'success';
    if (s === 'pending' || s === 'requested') return 'warning';
    if (s === 'rejected' || s === 'blocked' || s === 'inactive') return 'danger';
    return 'neutral';
  };

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE));
  const paginatedCompanies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCompanies.slice(start, start + PAGE_SIZE);
  }, [filteredCompanies, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredCompaniesForModal = allCompaniesForTransfer.filter(company =>
    company.name.toLowerCase().includes(modalSearchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="admin-tab-content"><p>{t('admin.loadingCompanies')}</p></div>;
  }

  if (error) {
    return <div className="admin-tab-content error-message"><p>{t('admin.errorLoadingCompanies', { error })}</p></div>;
  }

  if (companies.length === 0 && !loading) {
    return <div className="admin-tab-content"><p>{t('admin.noCompaniesFound')}</p></div>;
  }

  return (
    <div className="admin-tab-content">
      <div className={styles.headerRow}>
        <div className={styles.headerTitleBlock}>
          <h3 className={styles.headerTitle}>{t('admin.companiesListTitle')}</h3>
          <div className={styles.headerSubtitle}>
            {t('admin.companies')}: <strong>{filteredCompanies.length}</strong>
          </div>
        </div>
        <Button 
          onClick={() => setIsCreateCompanyModalOpen(true)} 
          variant="primary" 
          disabled={actionLoading}
        >
          {t('admin.createCompanyWithUser')}
        </Button>
      </div>
      
      <div className={styles.listFilterContainer}>
        <Input 
          type="text"
          placeholder={t('admin.searchCompaniesPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {actionLoading && <p className={styles.processingMessage}>{t('admin.processingAction')}</p>}
      
      {filteredCompanies.length === 0 && !loading && searchTerm && (
        <p className={styles.emptyHint}>{t('admin.noCompaniesMatch', { term: searchTerm })}</p>
      )}
      
      <ul className={sharedStyles.adminListContainer}>
        {paginatedCompanies.map((company) => (
          <li key={company._id} className={`${sharedStyles.adminListItem} ${styles.companyListItem}`}>
            <button
              type="button"
              className={styles.companyHeader}
              onClick={() => toggleCompanyUsers(company._id)}
              aria-expanded={expandedCompanyId === company._id}
              aria-controls={`company-${company._id}-users`}
            >
              <div className={styles.companyTitleRow}>
                <div className={styles.companyName}>{company.name}</div>
                <div className={styles.companyMetaBadges}>
                  <span className={`${styles.badge} ${styles[`badgeTone_${getCompanyStatusTone(company.status)}`]}`}>
                    {company.status || t('admin.unknown')}
                  </span>
                  <span className={styles.badge}>
                    {(company.roles?.length ? company.roles : [CompanyRole.SELLER]).join(', ')}
                  </span>
                </div>
              </div>
              <div className={styles.companyExpandHint}>
                <span className={styles.chevron}>{expandedCompanyId === company._id ? '▼' : '▶'}</span>
                <span>
                  {t('admin.users')} <strong>({company.users ? company.users.length : 0})</strong>
                </span>
              </div>
            </button>
            {expandedCompanyId === company._id && (
              <div id={`company-${company._id}-users`} className={styles.companyBody}>
                <div className={styles.companyActions}>
                  <Button 
                    onClick={() => openCompanyRoleModal(company)} 
                    variant="neutral" 
                    size="sm" 
                    disabled={actionLoading}
                  >
                    {t('admin.changeCompanyRoles')}
                  </Button>
                  <Button 
                    onClick={() => handleHardDeleteCompany(company._id, company.name)} 
                    variant="danger" 
                    size="sm" 
                    disabled={actionLoading}
                  >
                    {t('admin.hardDeleteCompany')}
                  </Button>
                </div>
                <ul className={styles.companyUsersList}>
                  {company.users && company.users.length > 0 ? (
                    company.users.map((userEntry) => {
                      // Type guard to check if userEntry.user is a User object and not a string
                      const isUserObject = typeof userEntry.user !== 'string';
                      const user = isUserObject ? userEntry.user as User : null;
                      
                      return user ? (
                        <li key={user._id} className={`${sharedStyles.adminListItem} ${styles.userItemOverride}`}>
                          <div className={sharedStyles.adminItemDetails}>
                            <p><strong>{t('common.name')}:</strong> {user.firstName} {user.lastName}</p>
                            <p><strong>{t('auth.email')}:</strong> {user.email}</p>
                            <p><strong>{t('admin.role')}:</strong> {userEntry.role}</p>
                            <p><strong>{t('common.status')}:</strong> {userEntry.isActive ? t('admin.activeStatus') : t('admin.inactiveStatus')}</p>
                          </div>
                          <div className={styles.userActionsCell} ref={openActionsUserId === user._id ? actionsMenuRef : null}>
                            <button
                              type="button"
                              className={styles.actionsTrigger}
                              aria-haspopup="menu"
                              aria-expanded={openActionsUserId === user._id}
                              disabled={actionLoading}
                              onClick={() => setOpenActionsUserId(prev => (prev === user._id ? null : user._id))}
                              title={t('common.actions')}
                            >
                              <i className="fas fa-ellipsis-v" />
                            </button>

                            {openActionsUserId === user._id && (
                              <div className={styles.actionsMenu} role="menu">
                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  disabled={actionLoading}
                                  onClick={() => { setOpenActionsUserId(null); openConfirmationModal('impersonate', user._id, t('admin.confirmImpersonationMessage'), t('admin.confirmImpersonation')); }}
                                  role="menuitem"
                                >
                                  <i className="fas fa-user-secret" /> {t('admin.loginAs')}
                                </button>
                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  disabled={actionLoading}
                                  onClick={() => { setOpenActionsUserId(null); openTransferModal(user); }}
                                  role="menuitem"
                                >
                                  <i className="fas fa-exchange-alt" /> {t('admin.transfer')}
                                </button>
                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  disabled={actionLoading}
                                  onClick={() => { setOpenActionsUserId(null); openRoleModal(user); }}
                                  role="menuitem"
                                >
                                  <i className="fas fa-user-tag" /> {t('admin.changeUserRole')}
                                </button>
                                <div className={styles.menuDivider} role="separator" />
                                <button
                                  type="button"
                                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                  disabled={actionLoading}
                                  onClick={() => { setOpenActionsUserId(null); openConfirmationModal('delete', user._id, t('admin.confirmDeletionMessage'), t('admin.confirmDeletion')); }}
                                  role="menuitem"
                                >
                                  <i className="fas fa-trash" /> {t('common.delete')}
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      ) : (
                        <li key={userEntry._id || 'missing-id'} className={`${sharedStyles.adminListItem} ${styles.userItemOverride}`}><p>{t('admin.userDataMissing', { id: userEntry._id || 'unknown' })}</p></li>
                      );
                    })
                  ) : (
                    <li className={`${sharedStyles.adminListItem} ${styles.userItemOverride}`}><p>{t('admin.noUsersInCompany')}</p></li>
                  )}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className={styles.pageButton}
          >
            {t('admin.previous')}
          </button>
          <span className={styles.pageInfo}>
            {t('admin.page', { current: currentPage, total: totalPages })}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className={styles.pageButton}
          >
            {t('admin.next')}
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmation.isOpen}
        onClose={closeConfirmationModal}
        title={confirmation.title}
        footer={
          <>
            <Button onClick={closeConfirmationModal} variant="neutral">{t('common.cancel')}</Button>
            <Button onClick={handleConfirmation} variant={confirmation.action === 'delete' ? 'danger' : 'primary'}>
              {actionLoading ? t('admin.processingAction') : t('company.confirm')}
            </Button>
          </>
        }
      >
        <p>{confirmation.message}</p>
      </Modal>

      {/* Notification Modal */}
      <Modal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        footer={
          <Button onClick={() => setNotification({ ...notification, isOpen: false })}>{t('common.close')}</Button>
        }
      >
        <p>{notification.message}</p>
      </Modal>

      {/* Transfer User Modal */}
      <Modal 
        isOpen={isTransferModalOpen} 
        onClose={() => setIsTransferModalOpen(false)} 
        title={t('admin.transferUser')}
        footer={
          <Button onClick={handleTransferUser} disabled={actionLoading || !selectedCompanyForTransfer} variant="primary">
            {actionLoading ? t('admin.transferring') : t('admin.transferUser')}
          </Button>
        }
      >
        {selectedUserForAction && (
          <>
            <p>{t('admin.userTransferred', { name: `${selectedUserForAction.firstName} ${selectedUserForAction.lastName}`, email: selectedUserForAction.email })}</p>
            
            <div className={styles.modalFormGroup}>
              <Input 
                type="text"
                placeholder={t('admin.searchTargetCompany')}
                value={modalSearchTerm}
                onChange={(e) => setModalSearchTerm(e.target.value)}
                containerClassName={styles.modalSearchInput}
              />
            </div>

            <div className={styles.modalFormGroup}>
              <label htmlFor="targetCompany">{t('admin.newCompany')}</label>
              <select 
                id="targetCompany" 
                value={selectedCompanyForTransfer}
                onChange={(e) => setSelectedCompanyForTransfer(e.target.value)}
                disabled={actionLoading}
                className={styles.modalSelect}
                size={filteredCompaniesForModal.length > 5 ? 5 : filteredCompaniesForModal.length + 1} // Dynamic size
              >
                <option value="" disabled>{t('admin.selectCompany')}</option>
                {filteredCompaniesForModal.length === 0 && modalSearchTerm && (
                    <option value="" disabled>{t('admin.noCompaniesMatchModal', { term: modalSearchTerm })}</option>
                )}
                {filteredCompaniesForModal.map(comp => {
                  // Check if user already belongs to this company
                  const userCompany = selectedUserForAction.company;
                  const belongsToCompany = userCompany && 
                                          typeof userCompany === 'object' && 
                                          '_id' in userCompany && 
                                          userCompany._id === comp._id;
                  return !belongsToCompany ? (
                    <option key={comp._id} value={comp._id}>{comp.name}</option>
                  ) : null;
                })}
              </select>
            </div>
          </>
        )}
      </Modal>

      {/* Change Role Modal */}
      <Modal 
        isOpen={isRoleModalOpen} 
        onClose={() => setIsRoleModalOpen(false)} 
        title={t('admin.changeUserRole')}
        footer={
          <Button onClick={handleChangeUserRole} disabled={actionLoading || !selectedRoleForChange} variant="primary">
            {actionLoading ? t('admin.changing') : t('admin.changeUserRole')}
          </Button>
        }
      >
        {selectedUserForAction && (
          <>
            <p>{t('admin.changingRoleFor', { name: `${selectedUserForAction.firstName} ${selectedUserForAction.lastName}`, email: selectedUserForAction.email })}</p>
            <div className={styles.modalFormGroup}>
              <label htmlFor="newRole">{t('admin.newRole')}</label>
              <select 
                id="newRole" 
                value={selectedRoleForChange}
                onChange={(e) => setSelectedRoleForChange(e.target.value)}
                disabled={actionLoading}
                className={styles.modalSelect}
              >
                {isFullAdmin && <option value="admin">{t('admin.admin')}</option>}
                <option value="supervisor">{t('admin.supervisor')}</option>
                <option value="manager">{t('admin.manager')}</option>
                <option value="logist">{t('admin.logist')}</option>
              </select>
            </div>
          </>
        )}
      </Modal>

      {/* Change Company Roles Modal */}
      <Modal 
        isOpen={isCompanyRoleModalOpen} 
        onClose={() => setIsCompanyRoleModalOpen(false)} 
        title={t('admin.changeCompanyRoles')}
        footer={
          <Button onClick={handleChangeCompanyRoles} disabled={actionLoading || !selectedCompanyRoles.length} variant="primary">
            {actionLoading ? t('admin.changing') : t('admin.changingRolesFor', { name: selectedCompanyForAction?.name || '' })}
          </Button>
        }
      >
        {selectedCompanyForAction && (
          <>
            <p>{t('admin.changingRolesFor', { name: selectedCompanyForAction.name })}</p>
            <div className={styles.modalFormGroup}>
              <label>{t('admin.companyRoles')}</label>
              <div className={styles.modalChecksColumn}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={selectedCompanyRoles?.includes(CompanyRole.SELLER) || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCompanyRoles([...(selectedCompanyRoles || []), CompanyRole.SELLER]);
                      } else {
                        setSelectedCompanyRoles(selectedCompanyRoles?.filter(r => r !== CompanyRole.SELLER) || []);
                      }
                    }}
                  />
                  {t('admin.seller')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={selectedCompanyRoles?.includes(CompanyRole.BUYER) || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCompanyRoles([...(selectedCompanyRoles || []), CompanyRole.BUYER]);
                      } else {
                        setSelectedCompanyRoles(selectedCompanyRoles?.filter(r => r !== CompanyRole.BUYER) || []);
                      }
                    }}
                  />
                  {t('admin.buyer')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={selectedCompanyRoles?.includes(CompanyRole.BOTH) || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCompanyRoles([CompanyRole.BOTH]);
                      } else {
                        setSelectedCompanyRoles(selectedCompanyRoles?.filter(r => r !== CompanyRole.BOTH) || []);
                      }
                    }}
                  />
                  {t('admin.both')}
                </label>
              </div>
              <p className={styles.modalHint}>
                {t('admin.noteSelectingBoth')}
              </p>
            </div>
          </>
        )}
      </Modal>

      {/* Create Company with User Modal */}
      <Modal 
        isOpen={isCreateCompanyModalOpen} 
        onClose={() => setIsCreateCompanyModalOpen(false)} 
        title={t('admin.createCompanyWithUser')}
        size="lg"
        footer={
          <>
            <Button onClick={() => setIsCreateCompanyModalOpen(false)} variant="neutral" disabled={actionLoading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreateCompany} disabled={actionLoading} variant="primary">
              {actionLoading ? t('admin.creating') : t('admin.create')}
            </Button>
          </>
        }
      >
        <div className={styles.modalGrid}>
          <div className={styles.modalFormGroup}>
            <label htmlFor="companyName">{t('admin.companyName')} *</label>
            <Input
              id="companyName"
              type="text"
              value={createCompanyForm.name}
              onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, name: e.target.value })}
              placeholder={t('admin.companyNamePlaceholder')}
              disabled={actionLoading}
            />
          </div>

          <div className={styles.modalFormGroup}>
            <label htmlFor="userRole">{t('admin.role')}</label>
            <select
              id="userRole"
              value={createCompanyForm.userRole}
              onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, userRole: e.target.value as 'manager' | 'supervisor' })}
              disabled={actionLoading}
              className={styles.modalSelect}
            >
              <option value="manager">{t('admin.manager')}</option>
              <option value="supervisor">{t('admin.supervisor')}</option>
            </select>
          </div>
        </div>

        <div className={styles.modalFormGroup}>
          <label htmlFor="companyDescription">{t('admin.companyDescription')}</label>
          <Input
            id="companyDescription"
            type="text"
            value={createCompanyForm.description || ''}
            onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, description: e.target.value })}
            placeholder={t('admin.companyDescriptionPlaceholder')}
            disabled={actionLoading}
          />
        </div>

        <div className={styles.modalFormGroup}>
          <label htmlFor="companyRoles">{t('admin.companyRoles')}</label>
          <div className={styles.inlineChecks}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={createCompanyForm.companyRoles?.includes(CompanyRole.SELLER) || false}
                onChange={(e) => {
                  const roles = createCompanyForm.companyRoles || [];
                  if (e.target.checked) {
                    setCreateCompanyForm({ ...createCompanyForm, companyRoles: [...roles, CompanyRole.SELLER] });
                  } else {
                    setCreateCompanyForm({ ...createCompanyForm, companyRoles: roles.filter(r => r !== CompanyRole.SELLER) });
                  }
                }}
                disabled={actionLoading}
              />
              {t('admin.seller')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={createCompanyForm.companyRoles?.includes(CompanyRole.BUYER) || false}
                onChange={(e) => {
                  const roles = createCompanyForm.companyRoles || [];
                  if (e.target.checked) {
                    setCreateCompanyForm({ ...createCompanyForm, companyRoles: [...roles, CompanyRole.BUYER] });
                  } else {
                    setCreateCompanyForm({ ...createCompanyForm, companyRoles: roles.filter(r => r !== CompanyRole.BUYER) });
                  }
                }}
                disabled={actionLoading}
              />
              {t('admin.buyer')}
            </label>
          </div>
        </div>

        <hr className={styles.modalDivider} />

        <h4 className={styles.modalSectionTitle}>{t('admin.userInformation')}</h4>

        <div className={styles.modalGrid}>
          <div className={styles.modalFormGroup}>
            <label htmlFor="userFirstName">{t('admin.firstName')} *</label>
            <Input
              id="userFirstName"
              type="text"
              value={createCompanyForm.userFirstName}
              onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, userFirstName: e.target.value })}
              placeholder={t('admin.firstNamePlaceholder')}
              disabled={actionLoading}
            />
          </div>

          <div className={styles.modalFormGroup}>
            <label htmlFor="userLastName">{t('admin.lastName')} *</label>
            <Input
              id="userLastName"
              type="text"
              value={createCompanyForm.userLastName}
              onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, userLastName: e.target.value })}
              placeholder={t('admin.lastNamePlaceholder')}
              disabled={actionLoading}
            />
          </div>
        </div>

        <div className={styles.modalGrid}>
          <div className={styles.modalFormGroup}>
            <label htmlFor="userEmail">{t('auth.email')} *</label>
            <Input
              id="userEmail"
              type="email"
              value={createCompanyForm.userEmail}
              onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, userEmail: e.target.value })}
              placeholder={t('auth.emailPlaceholder')}
              disabled={actionLoading}
            />
            <p className={styles.modalHint}>
              {t('admin.emailWillBeVerified')}
            </p>
          </div>

          <div className={styles.modalFormGroup}>
            <label htmlFor="userPhone">{t('admin.phone')} *</label>
            <Input
              id="userPhone"
              type="tel"
              value={createCompanyForm.userPhone}
              onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, userPhone: e.target.value })}
              placeholder={t('admin.phonePlaceholder')}
              disabled={actionLoading}
            />
            <p className={styles.modalHint}>
              {t('admin.phoneWillBeVerified')}
            </p>
          </div>
        </div>

        <div className={styles.modalFormGroup}>
          <label htmlFor="userPassword">{t('auth.password')} *</label>
          <Input
            id="userPassword"
            type="password"
            value={createCompanyForm.userPassword}
            onChange={(e) => setCreateCompanyForm({ ...createCompanyForm, userPassword: e.target.value })}
            placeholder={t('auth.passwordPlaceholder')}
            disabled={actionLoading}
          />
        </div>
      </Modal>

    </div>
  );
}

export default CompaniesList; 