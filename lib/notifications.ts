export type AppNotification = {
  id: string;
  kind: string;
  entityId: string;
  title: string;
  body: string;
  actionUrl?: string;
  readAt?: string;
  createdAt: string;
};
