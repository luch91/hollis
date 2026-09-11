export type PendingWelcomeEmailDelivery = {
  deliveryId: string;
  recipientEmail: string;
};

export interface WelcomeEmailDeliveryStore {
  claimPending(userId: string): Promise<PendingWelcomeEmailDelivery | null>;
  markFailed(deliveryId: string): Promise<void>;
  markSent(deliveryId: string, providerMessageId: string): Promise<void>;
  recordNewUser(userId: string): Promise<void>;
}
