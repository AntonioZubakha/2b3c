import { Request, Response } from 'express';
import { emailService } from '../services/emailService';
import { sendDemoRequestNotification } from '../utils/telegramBot';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errorHelpers';

export interface DemoRequestBody {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  message?: string;
}

export const submitDemoRequest = async (req: Request<object, object, DemoRequestBody>, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, phone, company, message } = req.body;

    const data = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      company: company?.trim() || undefined,
      message: message?.trim() || undefined
    };

    // Send to Telegram (same channel as registrations)
    try {
      await sendDemoRequestNotification(data);
      logger.info('[DemoRequest] Telegram notification sent', { email: data.email });
    } catch (tgErr) {
      logger.error('[DemoRequest] Failed to send Telegram notification', { error: getErrorMessage(tgErr) });
      // Continue - don't fail the request if Telegram fails
    }

    // Send to email
    try {
      if (emailService.isAvailable()) {
        await emailService.sendDemoRequestEmail(data);
        logger.info('[DemoRequest] Email notification sent', { email: data.email });
      } else {
        logger.debug('[DemoRequest] Email service not available, skipping');
      }
    } catch (emailErr) {
      logger.error('[DemoRequest] Failed to send email notification', { error: getErrorMessage(emailErr) });
      res.status(500).json({ message: 'Failed to submit demo request. Please try again or contact us directly.' });
      return;
    }

    res.status(200).json({ message: 'Thank you! We will contact you soon.' });
  } catch (error) {
    logger.error('[DemoRequest] Error:', { error: getErrorMessage(error) });
    res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
  }
};
