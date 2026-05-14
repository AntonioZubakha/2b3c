import React, { useState, useEffect, useCallback } from 'react';
import { isAxiosError } from 'axios';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { User, UserDto, userDtoToUser } from '../../types';
import styles from './TeamPanel.module.css';
import Button from '../common/Button/Button';
import Input from '../common/Input/Input';
import Modal from '../common/Modal/Modal';
import Select from '../common/Select/Select';
import api from '../../api';
import { logger } from '../../utils/logger';

type CompanyRoleOption = 'admin' | 'supervisor' | 'manager' | 'logist';

// ChangeRoleModal sub-component
const ChangeRoleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (newRole: string) => Promise<void>;
  isSaving: boolean;
  user: User | null;
  isLgdealCompany: boolean; // Whether the current user's company is LGDeal INC
  isFullAdmin: boolean; // Whether the current user can assign the admin role
}> = ({ isOpen, onClose, onSave, isSaving, user, isLgdealCompany, isFullAdmin }) => {
  const { t } = useTranslation();
  const getValidRole = useCallback((role: string | undefined): CompanyRoleOption => {
    if (role === 'admin' && isFullAdmin && isLgdealCompany) return 'admin';
    if (role === 'supervisor' || role === 'manager' || role === 'logist') {
      return role as CompanyRoleOption;
    }
    return 'manager';
  }, [isFullAdmin, isLgdealCompany]);

  const [newRole, setNewRole] = useState<CompanyRoleOption>(
    getValidRole(user?.role)
  );

  useEffect(() => {
    if (user) {
      setNewRole(getValidRole(user.role));
    }
  }, [user, getValidRole]);

  const handleSave = async () => {
    if (!user || !user._id) {
      logger.warn('Cannot save role: user or user._id is missing');
      return;
    }
    await onSave(newRole);
  };

  const roleOptions: { value: CompanyRoleOption; label: string }[] = [
    ...(isFullAdmin && isLgdealCompany ? [{ value: 'admin' as const, label: t('admin.admin') }] : []),
    { value: 'supervisor', label: t('company.supervisor') },
    { value: 'manager', label: t('company.manager') },
    ...(isLgdealCompany ? [{ value: 'logist' as const, label: t('company.logist') }] : [])
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('company.changeRole', { name: `${user?.firstName} ${user?.lastName}` })}
      footer={
        <>
          <Button onClick={onClose} variant="neutral" disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={isSaving} disabled={!user || !user._id || isSaving}>
            {t('company.saveChanges')}
          </Button>
        </>
      }
    >
      <p>{t('company.selectNewRole')}</p>
      <div className={styles.inputGroup}>
        <Select
          label={t('company.role')}
          id="role-select"
          options={roleOptions}
          value={newRole}
          onChange={(e) => setNewRole(e.target.value as CompanyRoleOption)}
          disabled={isSaving}
        />
      </div>
    </Modal>
  );
};

// InvitationModal sub-component
const InvitationModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSend: (email: string) => Promise<void>;
  isSending: boolean;
}> = ({ isOpen, onClose, onSend, isSending }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');

  const handleSend = async () => {
    await onSend(email);
    if (!isSending) {
       setEmail('');
       onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('company.inviteNewMember')}
      footer={
        <>
          <Button onClick={onClose} variant="neutral" disabled={isSending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSend} loading={isSending}>
            {t('company.sendInvitation')}
          </Button>
        </>
      }
    >
      <p>{t('company.inviteEmailDescription')}</p>
      <div className={styles.inputGroup}>
        <label htmlFor="invite-email" className={styles.inputGroupLabel}>{t('company.emailAddress')}</label>
        <Input
          type="email"
          id="invite-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('company.emailPlaceholder')}
          disabled={isSending}
        />
      </div>
    </Modal>
  );
};

type ConfirmationAction = 'resend' | 'revoke' | 'remove' | 'activate';

interface TeamPanelConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  action: ConfirmationAction | null;
  targetId: string | null; // For invitationId or memberId
  targetEmail?: string; // For resend email
}

interface NotificationState {
    isOpen: boolean;
    title: string;
    message: string;
}

const TeamPanel: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isChangeRoleModalOpen, setIsChangeRoleModalOpen] = useState<boolean>(false);
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [isSavingRole, setIsSavingRole] = useState<boolean>(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Check if current user's company is LGDeal INC
  const isLgdealCompany = companyName === 'LGDeal INC';

  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const [confirmation, setConfirmation] = useState<TeamPanelConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    action: null,
    targetId: null,
  });

  const fetchTeamMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Server returns UserDto[] with additional fields (status, invitationId)
      interface CompanyUsersResponse {
        companyName?: string;
        users: Array<UserDto & { status?: 'Active' | 'Pending' | 'Inactive'; invitationId?: string }>;
      }
      const response = await api.get<CompanyUsersResponse>('/company/users');
      
      // Transform DTOs to User objects and preserve additional fields
      const transformedUsers: User[] = response.data.users.map((dto) => {
        const user = userDtoToUser(dto);
        // Preserve status and invitationId from server response
        if (dto.status) {
          (user as User).status = dto.status;
        }
        if (dto.invitationId) {
          (user as User).invitationId = dto.invitationId;
        }
        return user;
      });
      
      setTeamMembers(transformedUsers);
    } catch (err: unknown) {
      const errorMessage = isAxiosError(err) 
        ? (err.response?.data?.message || t('company.failedToFetchTeam'))
        : t('company.failedToFetchTeam');
      setError(errorMessage);
      logger.error(
        '[TeamPanel] Failed to fetch team members',
        err instanceof Error ? err : new Error(String(err))
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Fetch company info to check if it's LGDeal INC
  const fetchCompanyInfo = useCallback(async () => {
    try {
      const response = await api.get<{ name: string }>('/company/profile');
      if (response.data?.name) {
        setCompanyName(response.data.name);
      } else if (user?.companyName) {
        setCompanyName(user.companyName);
      } else if (user?.company && typeof user.company === 'object' && 'name' in user.company) {
        setCompanyName(user.company.name);
      }
    } catch (err: unknown) {
      // Fallback to user.companyName if API fails
      if (user?.companyName) {
        setCompanyName(user.companyName);
      } else if (user?.company && typeof user.company === 'object' && 'name' in user.company) {
        setCompanyName(user.company.name);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchTeamMembers();
    fetchCompanyInfo();
  }, [fetchTeamMembers, fetchCompanyInfo]);


  const handleSendInvitation = async (email: string): Promise<void> => {
    setIsSending(true);
    try {
      await api.post('/company/invite', { email });
      setNotification({ isOpen: true, title: t('company.success'), message: t('company.invitationSent') });
      fetchTeamMembers(); // Refresh list after sending
    } catch (err: unknown) {
      setNotification({ isOpen: true, title: t('company.error'), message: t('company.invitationFailed', { message: isAxiosError(err) ? (err.response?.data?.message || t('common.unknownError')) : t('common.unknownError') }) });
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenChangeRoleModal = (member: User) => {
    if (!member || !member._id) {
      setNotification({ isOpen: true, title: t('company.error'), message: t('company.failedToFetchTeam') });
      return;
    }
    setSelectedMember(member);
    setIsChangeRoleModalOpen(true);
  };

  const handleCloseChangeRoleModal = () => {
    setIsChangeRoleModalOpen(false);
    setSelectedMember(null);
  };

  const handleChangeRole = async (newRole: string) => {
    if (!selectedMember || !selectedMember._id) {
      setNotification({ isOpen: true, title: t('company.error'), message: t('company.roleUpdateFailed', { message: t('common.unknownError') }) });
      return;
    }
    const userId = selectedMember._id; // Save ID before async operation
    setIsSavingRole(true);
    try {
      await api.put(`/company/users/${userId}/role`, { role: newRole });
      setNotification({ isOpen: true, title: t('company.success'), message: t('company.roleUpdated') });
      fetchTeamMembers(); // Refresh the list
      handleCloseChangeRoleModal();
    } catch (err: unknown) {
      setNotification({ isOpen: true, title: t('company.error'), message: t('company.roleUpdateFailed', { message: isAxiosError(err) ? (err.response?.data?.message || t('common.unknownError')) : t('common.unknownError') }) });
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleResendInvitation = async (email: string): Promise<void> => {
    await handleSendInvitation(email);
  };

  const handleRevokeInvitation = async (invitationId: string): Promise<void> => {
    try {
      await api.post(`/company/invitations/${invitationId}/revoke`);
      setNotification({ isOpen: true, title: t('company.success'), message: t('company.invitationRevoked') });
      fetchTeamMembers();
    } catch (err: unknown) {
      setNotification({ isOpen: true, title: t('company.error'), message: t('company.invitationRevokeFailed', { message: isAxiosError(err) ? (err.response?.data?.message || t('common.unknownError')) : t('common.unknownError') }) });
    }
  };

  const handleRemoveMember = async (memberId: string): Promise<void> => {
    try {
      await api.delete(`/company/users/${memberId}`);
      setNotification({ isOpen: true, title: t('company.success'), message: t('company.memberRemoved') });
      fetchTeamMembers();
    } catch (err: unknown) {
      setNotification({ isOpen: true, title: t('company.error'), message: t('company.removeMemberFailed', { message: isAxiosError(err) ? (err.response?.data?.message || t('common.unknownError')) : t('common.unknownError') }) });
    }
  };

  const handleActivateUser = async (userId: string): Promise<void> => {
    try {
      await api.put(`/company/users/${userId}/activate`);
      setNotification({ isOpen: true, title: t('company.success'), message: t('company.userActivated') });
      fetchTeamMembers();
    } catch (err: unknown) {
      setNotification({ isOpen: true, title: t('company.error'), message: t('company.activateUserFailed', { message: isAxiosError(err) ? (err.response?.data?.message || t('common.unknownError')) : t('common.unknownError') }) });
    }
  };

  const openConfirmationModal = (action: ConfirmationAction, targetId: string, message: string, title: string, targetEmail?: string) => {
    setConfirmation({
      isOpen: true,
      title,
      message,
      action,
      targetId,
      targetEmail,
    });
  };

  const closeConfirmationModal = () => {
    setConfirmation({ isOpen: false, title: '', message: '', action: null, targetId: null, targetEmail: undefined });
  };
  
  const handleConfirmation = async () => {
    if (!confirmation.action || !confirmation.targetId) return;

    if (confirmation.action === 'resend' && confirmation.targetEmail) {
      await handleResendInvitation(confirmation.targetEmail);
    } else if (confirmation.action === 'revoke') {
      await handleRevokeInvitation(confirmation.targetId);
    } else if (confirmation.action === 'remove') {
      await handleRemoveMember(confirmation.targetId);
    } else if (confirmation.action === 'activate') {
      await handleActivateUser(confirmation.targetId);
    }

    closeConfirmationModal();
  };

  return (
    <div className={styles.teamPanel}>
      <div className={styles.teamHeader}>
        <h3>{t('company.teamManagement')}</h3>
        <Button onClick={() => setIsInviteModalOpen(true)}>
          + {t('company.inviteMember')}
        </Button>
      </div>

      {loading && <p>{t('common.loading')}</p>}
      {error && <p className={styles.errorMessage}>{error}</p>}
      
      {!loading && !error && (
        <div className={styles.teamTableContainer}>
          <table className={styles.teamTable}>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('auth.email')}</th>
                <th>{t('company.role')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map(member => (
                <tr key={member._id}>
                  <td>{member.firstName} {member.lastName}</td>
                  <td>{member.email}</td>
                  <td>{member.role || t('company.member')}</td>
                  <td>
                    <span                     className={
                      `${styles.statusBadge} ${styles['statusbadge' + (member.status || 'pending').toLowerCase()]}`
                    }>
                      {member.status === 'Pending' ? t('company.pending') : 
                       member.status === 'Active' ? t('company.active') : 
                       member.status === 'Inactive' ? t('company.inactive') : 
                       member.status}
                    </span>
                  </td>
                  <td className={styles.actionsCell}>
                    {member.status === 'Pending' && member.invitationId
                      ? (() => {
                          const invitationId = member.invitationId;
                          return (
                            <>
                              <Button onClick={() => openConfirmationModal('resend', invitationId, t('company.confirmResendMessage', { email: member.email }), t('company.confirmResendInvitation'), member.email)} variant="secondary" size="sm">
                                {t('company.resendInvitation')}
                              </Button>
                              <Button onClick={() => openConfirmationModal('revoke', invitationId, t('company.confirmRevokeMessage', { email: member.email }), t('company.confirmRevokeInvitation'))} variant="danger" size="sm">
                                {t('company.revokeInvitation')}
                              </Button>
                            </>
                          );
                        })()
                      : null}
                    {member.status === 'Inactive' && (
                      <Button onClick={() => openConfirmationModal('activate', member._id, t('company.confirmActivateMessage', { name: `${member.firstName} ${member.lastName}` }), t('company.confirmActivateMember'))} variant="success" size="sm">
                        {t('company.activateMember')}
                      </Button>
                    )}
                    {member.status === 'Active' && user?._id !== member._id && (
                      <>
                        <Button onClick={() => handleOpenChangeRoleModal(member)} variant="secondary" size="sm">
                          {t('company.changeRoleButton')}
                        </Button>
                        <Button onClick={() => openConfirmationModal('remove', member._id, t('company.confirmRemoveMessage', { name: `${member.firstName} ${member.lastName}` }), t('company.confirmRemoveMember'))} variant="danger" size="sm">
                          {t('company.removeMember')}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InvitationModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSend={handleSendInvitation}
        isSending={isSending}
      />

      <ChangeRoleModal
        isOpen={isChangeRoleModalOpen}
        onClose={handleCloseChangeRoleModal}
        onSave={handleChangeRole}
        isSaving={isSavingRole}
        user={selectedMember}
        isLgdealCompany={isLgdealCompany}
        isFullAdmin={user?.role === 'admin'}
      />

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmation.isOpen}
        onClose={closeConfirmationModal}
        title={confirmation.title}
        footer={
          <>
            <Button onClick={closeConfirmationModal} variant="neutral">{t('common.cancel')}</Button>
            <Button onClick={handleConfirmation} variant="danger">
              {t('company.confirm')}
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
    </div>
  );
};

export default TeamPanel;