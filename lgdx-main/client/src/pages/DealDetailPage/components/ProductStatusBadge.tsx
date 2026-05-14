import React from 'react';
import { useTranslation } from '../../../i18n';

interface ProductStatus {
  canSelect: boolean;
  status: string;
  displayStatus: string;
}

interface ProductStatusBadgeProps {
  productStatus: ProductStatus;
}

const ProductStatusBadge: React.FC<ProductStatusBadgeProps> = ({
  productStatus
}) => {
  const { t } = useTranslation();

  const getTranslatedStatus = (): string => {
    // Map displayStatus to translation keys
    const statusMap: Record<string, string> = {
      'Selected Alternative': t('dealDetail.productStatusSelectedAlternative'),
      'Pending': t('dealDetail.productStatusPending'),
      'Main Product': t('dealDetail.productStatusMainProduct'),
      'Available': t('dealDetail.productStatusAvailable'),
      'Not Available': t('dealDetail.productStatusNotAvailable'),
      'Pending Approval': t('dealDetail.productStatusPendingApproval'),
      'Error': t('dealDetail.productStatusError'),
    };

    return statusMap[productStatus.displayStatus] || productStatus.displayStatus;
  };

  const getBadgeClass = () => {
    switch (productStatus.status) {
      case 'selected':
        return productStatus.displayStatus === 'Selected Alternative' ? 'badge-primary' : 'badge-success';
      case 'available':
        return 'badge-success';
      case 'pending_approval':
        return 'badge-warning';
      case 'pending':
        return 'badge-info';
      case 'not_available':
        return 'badge-danger';
      case 'error':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  const getIcon = () => {
    switch (productStatus.status) {
      case 'selected':
        return productStatus.displayStatus === 'Selected Alternative' ? 'fas fa-star' : 'fas fa-check-circle';
      case 'available':
        return 'fas fa-check-circle';
      case 'pending_approval':
        return 'fas fa-hourglass-half';
      case 'pending':
        return 'fas fa-clock';
      case 'not_available':
        return 'fas fa-times-circle';
      case 'error':
        return 'fas fa-exclamation-triangle';
      default:
        return 'fas fa-building';
    }
  };

  return (
    <span className={`badge ${getBadgeClass()}`}>
      <i className={getIcon()}></i> {getTranslatedStatus()}
    </span>
  );
};

export default ProductStatusBadge; 