/**
 * Telegram Payment Service
 * Provides integration with Telegram Mini Apps JS SDK for payments
 */

import { getTelegramWebApp } from './telegramSDK';
import { transactionApi } from './api';

export interface PaymentOptions {
  amount: number;
  description: string;
  payload?: string;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export const telegramPaymentService = {
  /**
   * Check if payments are available in current environment
   */
  isPaymentAvailable(): boolean {
    const webApp = getTelegramWebApp();
    return !!webApp && typeof webApp.openInvoice === 'function';
  },

  /**
   * Create a payment link for Telegram Mini App
   * @param options Payment options
   * @returns Payment URL
   */
  createPaymentUrl(options: PaymentOptions): string {
    // In a real app, you would call your backend to create a payment URL
    // This is a mock implementation
    const { amount, description, payload = '' } = options;

    // Format amount in cents/kopecks (smallest currency unit)
    const amountInKopecks = Math.round(amount * 100);

    // TODO: In production, replace with actual API call to create payment URL
    // Example:
    // const response = await fetch('/api/create-payment', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ amount, description, payload })
    // });
    // const data = await response.json();
    // return data.paymentUrl;

    // Mock payment URL for development
    return `https://t.me/invoice/mock_payment_${Date.now()}?amount=${amountInKopecks}&description=${encodeURIComponent(description)}&payload=${encodeURIComponent(payload)}`;
  },

  /**
   * Open payment invoice in Telegram Mini App
   * @param options Payment options
   * @returns Promise with payment result
   */
  async openPayment(options: PaymentOptions): Promise<PaymentResult> {
    try {
      const webApp = getTelegramWebApp();

      if (!webApp || typeof webApp.openInvoice !== 'function') {
        throw new Error('Telegram payment is not available');
      }

      const paymentUrl = this.createPaymentUrl(options);

      return new Promise((resolve, reject) => {
        webApp.openInvoice(paymentUrl, status => {
          if (status === 'paid') {
            // Payment successful
            // In a real app, you would verify the payment with your backend
            const paymentId = `payment_${Date.now()}`;

            // Get user from Telegram WebApp
            const user = webApp.initDataUnsafe?.user;
            if (!user) {
              reject(new Error('User not found'));
              return;
            }

            // Record payment in backend
            transactionApi
              .processTelegramPayment(user.id, options.amount, paymentId)
              .then(() => {
                resolve({
                  success: true,
                  transactionId: paymentId,
                });
              })
              .catch(error => {
                reject(error);
              });
          } else if (status === 'failed') {
            // Payment failed
            reject(new Error('Payment failed'));
          } else if (status === 'cancelled') {
            // Payment cancelled
            reject(new Error('Payment cancelled'));
          }
        });
      });
    } catch (error) {
      console.error('Error in openPayment:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  /**
   * Buy Stars with Telegram payment
   * @param amount Amount of Stars to buy
   * @returns Promise with payment result
   */
  async buyStars(amount: number): Promise<PaymentResult> {
    // Calculate price (1 Star = 1 RUB in this example)
    const priceInRub = amount;

    return this.openPayment({
      amount: priceInRub,
      description: `${amount} Stars for Tap Battle game`,
      payload: `stars_purchase_${amount}`,
    });
  },
};

export default telegramPaymentService;
