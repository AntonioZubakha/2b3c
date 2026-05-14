import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import styles from './UsersManagement.module.css';
import Modal from '../common/Modal/Modal';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import Badge from '../common/Badge/Badge';
import { getUsers, updateUserDetails, UserWithCompany, EditFormData, impersonateUser, activateUser, hardDeleteUser, forceVerifyPhone, forceVerifyEmail } from '../../api/adminApi';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from '../../routes';
import { useTranslation } from '../../i18n';
import { userDtoToUser } from '../../types';

interface NotificationState {
    isOpen: boolean;
    title: string;
    message: string;
}

function UsersManagement(): React.ReactElement {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserWithCompany[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [openActionsUserId, setOpenActionsUserId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  // Filter states
  const [emailFilter, setEmailFilter] = useState<string>('');
  const [companyFilter, setCompanyFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const PAGE_SIZE = 15;

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [currentUserToEdit, setCurrentUserToEdit] = useState<UserWithCompany | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({ firstName: '', lastName: '', email: '', phone: '' });
  const [showPasswordField, setShowPasswordField] = useState<boolean>(false);



  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const { impersonate, setUser } = useAuth();
  const navigate = useNavigate();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || (err instanceof Error ? err.message : 'Failed to fetch users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenEditModal = (user: UserWithCompany) => {
    setCurrentUserToEdit(user);
    setEditFormData({ 
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || ''
    });
    setShowPasswordField(false);
    setIsEditModalOpen(true);
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData({ ...editFormData, [name]: value });
  };

  const handleSaveUserDetails = async () => {
    if (!currentUserToEdit) return;
    setActionLoading(currentUserToEdit._id);
    try {
      // Only include password if it was provided
      const dataToSend = { ...editFormData };
      if (!dataToSend.newPassword || dataToSend.newPassword.trim() === '') {
        delete dataToSend.newPassword;
      }
      
      await updateUserDetails(currentUserToEdit._id, dataToSend);
      setNotification({ isOpen: true, title: t('common.success'), message: t('admin.userDetailsUpdatedSuccess') });
      setIsEditModalOpen(false);
      fetchUsers(); // Refresh the list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?:string } } };
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: t('admin.userUpdateFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }),
      });
    }
    setActionLoading(null);
  };



  const handleForceVerifyPhone = async (userId: string) => {
    setActionLoading(userId);
    try {
      await forceVerifyPhone(userId);
      setNotification({ isOpen: true, title: t('common.success'), message: t('admin.phoneVerificationForcedSuccess') });
      fetchUsers(); // Refresh the list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: t('admin.phoneVerificationForcedFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceVerifyEmail = async (userId: string) => {
    setActionLoading(userId);
    try {
      await forceVerifyEmail(userId);
      setNotification({ isOpen: true, title: t('common.success'), message: t('admin.emailVerificationForcedSuccess') });
      fetchUsers(); // Refresh the list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: t('admin.emailVerificationForcedFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActivate = async (userId: string, currentStatus: boolean) => {
    setActionLoading(userId);
    try {
      await activateUser(userId, !currentStatus);
      setNotification({ 
        isOpen: true, 
        title: t('common.success'), 
        message: !currentStatus ? t('admin.userActivatedSuccess') : t('admin.userDeactivatedSuccess') 
      });
      fetchUsers(); // Refresh the list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: !currentStatus 
          ? t('admin.userActivatedFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) })
          : t('admin.userDeactivatedFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleHardDeleteUser = async (userId: string) => {
    if (!confirm(t('admin.hardDeleteUserConfirm'))) {
      return;
    }
    
    setActionLoading(userId);
    try {
      await hardDeleteUser(userId);
      setNotification({ isOpen: true, title: t('common.success'), message: t('admin.userHardDeletedSuccess') });
      fetchUsers(); // Refresh the list
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setNotification({
        isOpen: true,
        title: t('common.error'),
        message: t('admin.userHardDeletedFailed', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleImpersonate = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { user } = await impersonateUser(userId);
      // Server will set HttpOnly cookie; call client impersonate to trigger /me reload
      await impersonate(userId);
      setUser(userDtoToUser(user));
      navigate('/my-deals'); // Redirect to a user-specific page
    } catch (err) {
      const axiosError = err as { response?: { data?: { message?:string } } };
      setNotification({
        isOpen: true,
        title: t('admin.impersonationFailedGeneric'),
        message: t('admin.impersonationFailedMessageGeneric', { message: axiosError.response?.data?.message || (err instanceof Error ? err.message : t('common.unknownError')) }),
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getCompanyName = useCallback((user: UserWithCompany): string => {
    if (!user.company) return t('deals.notAvailable');
    if (typeof user.company === 'string') return t('admin.unknown');
    return user.company.name || t('admin.unknown');
  }, [t]);

  const filteredUsers = useMemo(() =>
    users.filter(user => {
      const emailMatch = user.email.toLowerCase().includes(emailFilter.toLowerCase());
      const companyName = getCompanyName(user);
      const companyMatch = companyName.toLowerCase().includes(companyFilter.toLowerCase());
      return emailMatch && companyMatch;
    }),
    [users, emailFilter, companyFilter, getCompanyName]
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [emailFilter, companyFilter]);

  useEffect(() => {
    if (!openActionsUserId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(target)) {
        setOpenActionsUserId(null);
      }
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

  if (loading) {
    return <div className="admin-tab-content"><p>{t('admin.loadingUsers')}</p></div>;
  }

  if (error) {
    return <div className="admin-tab-content error-message"><p>{t('admin.errorLoadingUsers', { error })}</p></div>;
  }

  if (users.length === 0 && !loading) {
    return <div className="admin-tab-content"><p>{t('admin.noUsersFound')}</p></div>;
  }

  return (
    <div className={`admin-tab-content ${styles.usersManagementList}`}>
      <h3>{t('admin.usersManagementTitle')}</h3>
      
      <div className={styles.usersFilters}>
        <Input
          type="text"
          placeholder={t('admin.filterByEmail')}
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
        />
        <Input
          type="text"
          placeholder={t('admin.filterByCompany')}
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
        />
      </div>
      <div className={styles.usersTableContainer}>
        <table className={styles.usersTable}>
          <thead>
            <tr>
              <th>{t('admin.id')}</th>
              <th>{t('admin.firstName')}</th>
              <th>{t('admin.lastName')}</th>
              <th>{t('auth.email')}</th>
              <th>{t('admin.phone')}</th>
              <th>{t('admin.verification')}</th>
              <th>Company</th>
              <th>{t('admin.role')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedUsers.map((user) => (
              <tr key={user._id}>
                <td title={user._id}>{user._id.slice(-6)}</td>
                <td>{user.firstName}</td>
                <td>{user.lastName}</td>
                <td>
                  <span className={styles.emailCell} title={user.email}>
                    {user.email}
                  </span>
                </td>
                <td>{user.phone || t('deals.notAvailable')}</td>
                <td>
                  <div className={styles.verificationStatus}>
                    <div className={styles.verificationItem}>
                      <span className={styles.verificationLabel}>{t('admin.emailVerificationLabel')}</span>
                      <Badge variant={user.emailVerified ? 'success' : 'warning'}>
                        {user.emailVerified ? '✓' : '✗'}
                      </Badge>
                    </div>
                    <div className={styles.verificationItem}>
                      <span className={styles.verificationLabel}>{t('admin.phoneVerificationLabel')}</span>
                      <Badge variant={user.phoneVerified ? 'success' : 'warning'}>
                        {user.phoneVerified ? '✓' : '✗'}
                      </Badge>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={styles.companyCell} title={getCompanyName(user)}>
                    {getCompanyName(user)}
                  </span>
                </td>
                <td className={styles.roleCell} title={user.role}>{user.role}</td>
                <td>
                  <Badge variant={user.isActive ? 'success' : 'danger'}>
                    {user.isActive ? t('admin.activeStatus') : t('admin.inactiveStatus')}
                  </Badge>
                </td>
                <td>
                  <div className={styles.actionsCell} ref={openActionsUserId === user._id ? actionsMenuRef : null}>
                    <button
                      type="button"
                      className={styles.actionsTrigger}
                      aria-haspopup="menu"
                      aria-expanded={openActionsUserId === user._id}
                      disabled={!!actionLoading}
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
                          onClick={() => { setOpenActionsUserId(null); handleOpenEditModal(user); }}
                          disabled={!!actionLoading}
                          role="menuitem"
                        >
                          <i className="fas fa-edit" /> {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          className={styles.menuItem}
                          onClick={() => { setOpenActionsUserId(null); void handleImpersonate(user._id); }}
                          disabled={!!actionLoading}
                          role="menuitem"
                        >
                          <i className="fas fa-user-secret" /> {t('admin.impersonate')}
                        </button>

                        <div className={styles.menuDivider} role="separator" />

                        <button
                          type="button"
                          className={styles.menuItem}
                          onClick={() => { setOpenActionsUserId(null); void handleForceVerifyEmail(user._id); }}
                          disabled={!!actionLoading}
                          role="menuitem"
                        >
                          <i className="fas fa-envelope" /> {t('admin.emailVerificationLabel')} ✓
                        </button>
                        <button
                          type="button"
                          className={styles.menuItem}
                          onClick={() => { setOpenActionsUserId(null); void handleForceVerifyPhone(user._id); }}
                          disabled={!!actionLoading}
                          role="menuitem"
                        >
                          <i className="fas fa-phone" /> {t('admin.phoneVerificationLabel')} ✓
                        </button>

                        <div className={styles.menuDivider} role="separator" />

                        <button
                          type="button"
                          className={styles.menuItem}
                          onClick={() => { setOpenActionsUserId(null); void handleToggleActivate(user._id, user.isActive ?? false); }}
                          disabled={!!actionLoading}
                          role="menuitem"
                        >
                          <i className={user.isActive ? 'fas fa-user-slash' : 'fas fa-user-check'} />{' '}
                          {user.isActive ? t('admin.deactivate') : t('admin.activate')}
                        </button>

                        <button
                          type="button"
                          className={`${styles.menuItem} ${styles.menuItemDanger}`}
                          onClick={() => { setOpenActionsUserId(null); void handleHardDeleteUser(user._id); }}
                          disabled={!!actionLoading}
                          role="menuitem"
                        >
                          <i className="fas fa-trash" /> {t('admin.hardDelete')}
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredUsers.length === 0 && users.length > 0 && (
        <div className="admin-tab-content"><p>{t('admin.noUsersMatchFilters')}</p></div>
      )}

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

      {/* Edit User Modal */}
      <Modal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        title={t('admin.editUserDetails')}
        footer={
          <Button 
            type="submit" 
            form="edit-user-form" 
            variant="success"
            loading={!!actionLoading}
            fullWidth
          >
            {actionLoading ? t('admin.saving') : t('admin.saveChanges')}
          </Button>
        }
      >
        {currentUserToEdit && (
          <form id="edit-user-form" className={styles.editForm} onSubmit={(e) => { e.preventDefault(); handleSaveUserDetails(); }}>
            <div className={styles.formGroup}>
              <label htmlFor="firstName">{t('admin.firstName')}:</label>
              <Input 
                type="text" 
                id="firstName" 
                name="firstName" 
                value={editFormData.firstName}
                onChange={handleEditFormChange}
                disabled={!!actionLoading}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="lastName">{t('admin.lastName')}:</label>
              <Input 
                type="text" 
                id="lastName" 
                name="lastName" 
                value={editFormData.lastName}
                onChange={handleEditFormChange}
                disabled={!!actionLoading}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="email">{t('auth.email')}:</label>
              <Input 
                type="email" 
                id="email" 
                name="email" 
                value={editFormData.email}
                onChange={handleEditFormChange}
                disabled={!!actionLoading}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="phone">{t('admin.phone')}:</label>
              <Input 
                type="tel" 
                id="phone" 
                name="phone" 
                value={editFormData.phone}
                onChange={handleEditFormChange}
                disabled={!!actionLoading}
              />
            </div>
            <div className={styles.formGroup}>
              <div className={styles.passwordToggle}>
                <input
                  type="checkbox"
                  id="showPassword"
                  checked={showPasswordField}
                  onChange={(e) => setShowPasswordField(e.target.checked)}
                  disabled={!!actionLoading}
                />
                <label htmlFor="showPassword">
                  {t('admin.changePassword')}
                </label>
              </div>
              {showPasswordField && (
                <Input 
                  type="password" 
                  id="newPassword" 
                  name="newPassword" 
                  placeholder={t('admin.enterNewPassword')}
                  value={editFormData.newPassword || ''}
                  onChange={handleEditFormChange}
                  disabled={!!actionLoading}
                />
              )}
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default UsersManagement; 