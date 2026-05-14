import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal, Product, DealProduct } from '../../../types';
import { translateShape } from '../../../utils/shapeTranslations';
import styles from './AlternativeProductProposal.module.css';
import Button from '../../../components/common/Button/Button';

interface AlternativeProductProposalProps {
    deal: Deal;
    onAccept: () => void;
    onReject: (reason?: string) => void;
}

const AlternativeProductProposal: React.FC<AlternativeProductProposalProps> = ({ deal, onAccept, onReject }) => {
    const { t, formatCurrency } = useTranslation();
    const proposedItem = deal.products?.find((p: DealProduct) => p.selectedAlternativeProduct);
    
    if (!proposedItem || !proposedItem.originalProductDetailsBeforeSwap || !proposedItem.selectedAlternativeProduct) {
        return <div className="alert alert-warning">{t('dealDetail.alternativeProposalDataMissing')}</div>;
    }
    
    const originalProduct = proposedItem.originalProductDetailsBeforeSwap as Product;
    const alternativeProduct = proposedItem.selectedAlternativeProduct as Product;

    const originalProductPrice = proposedItem.originalPriceBeforeSwap || 0;
    const alternativeProductPrice = alternativeProduct.marketPrice || alternativeProduct.price || 0;
    
    const renderComparisonRow = (label: string, originalValue: unknown, alternativeValue: unknown, isPrice = false, unit = '') => {
        // Handle null/undefined values gracefully
        const ov = originalValue ?? t('deals.notAvailable');
        const av = alternativeValue ?? t('deals.notAvailable');

        const originalDisplay = isPrice ? formatCurrency(Number(ov)) : `${ov}${unit}`;
        const alternativeDisplay = isPrice ? formatCurrency(Number(av)) : `${av}${unit}`;
        
        const isDifferent = ov.toString() !== av.toString();

        let priceStyle = '';
        if (isPrice && isDifferent && typeof av === 'number' && typeof ov === 'number') {
            priceStyle = av > ov ? styles.priceIncrease : styles.priceDecrease;
        }

        return (
            <tr>
                <td>{label}</td>
                <td className={isDifferent ? styles.highlight : ''}>{originalDisplay}</td>
                <td className={`${isDifferent ? styles.highlight : ''} ${isPrice ? styles.priceHighlight : ''} ${priceStyle}`}>
                    {alternativeDisplay}
                    {isPrice && isDifferent && typeof av === 'number' && typeof ov === 'number' && (
                        <i className={`fas ${av > ov ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                    )}
                </td>
            </tr>
        );
    };

    return (
        <div className={styles.alternativeProposalContainer}>
            <h3 className={styles.title}>{t('dealDetail.alternativeProductProposed')}</h3>
            <p className={styles.introText}>{t('dealDetail.alternativeProposedMessage')}</p>
            
            <table className={styles.comparisonTable}>
                <thead>
                    <tr>
                        <th>{t('dealDetail.feature')}</th>
                        <th>{t('dealDetail.originalRequest')}</th>
                        <th>{t('dealDetail.proposedAlternative')}</th>
                    </tr>
                </thead>
                <tbody>
                    {renderComparisonRow(t('company.shape'), translateShape(originalProduct.shape, t), translateShape(alternativeProduct.shape, t))}
                    {renderComparisonRow(t('company.carat'), originalProduct.carat, alternativeProduct.carat, false, ' ct')}
                    {renderComparisonRow(t('company.color'), originalProduct.color, alternativeProduct.color)}
                    {renderComparisonRow(t('dealDetail.clarity'), originalProduct.clarity, alternativeProduct.clarity)}
                    {renderComparisonRow(t('catalog.cut'), originalProduct.cut, alternativeProduct.cut)}
                    {renderComparisonRow(t('dealDetail.polish'), originalProduct.polish, alternativeProduct.polish)}
                    {renderComparisonRow(t('dealDetail.symmetry'), originalProduct?.symmetry, alternativeProduct?.symmetry)}
                    {renderComparisonRow(t('company.lab'), originalProduct?.certificateInstitute, alternativeProduct?.certificateInstitute)}
                    <tr className={styles.spacerRow}><td colSpan={3}></td></tr>
                    {renderComparisonRow(t('dealDetail.measurements'), 
                        `${originalProduct?.measurement1 != null ? Number(originalProduct.measurement1).toFixed(2) : t('deals.notAvailable')} x ${originalProduct?.measurement2 != null ? Number(originalProduct.measurement2).toFixed(2) : t('deals.notAvailable')} x ${originalProduct?.measurement3 != null ? Number(originalProduct.measurement3).toFixed(2) : t('deals.notAvailable')} mm`,
                        `${alternativeProduct?.measurement1 != null ? Number(alternativeProduct.measurement1).toFixed(2) : t('deals.notAvailable')} x ${alternativeProduct?.measurement2 != null ? Number(alternativeProduct.measurement2).toFixed(2) : t('deals.notAvailable')} x ${alternativeProduct?.measurement3 != null ? Number(alternativeProduct.measurement3).toFixed(2) : t('deals.notAvailable')} mm`
                    )}
                    {renderComparisonRow(t('dealDetail.certificate'), originalProduct?.certificateNumber, alternativeProduct?.certificateNumber)}
                    <tr className={styles.spacerRow}><td colSpan={3}></td></tr>
                    {renderComparisonRow(t('dealDetail.productPrice'), originalProductPrice, alternativeProductPrice, true)}
                </tbody>
            </table>
            
            <div className={styles.proposalActions}>
                <Button variant="success" onClick={onAccept}>
                    <i className="fas fa-check"></i>&nbsp;{t('dealDetail.acceptAlternative')}
                </Button>
                <Button variant="danger" onClick={() => onReject()}>
                    <i className="fas fa-times"></i>&nbsp;{t('dealDetail.rejectAlternative')}
                </Button>
            </div>
        </div>
    );
};

export default AlternativeProductProposal; 