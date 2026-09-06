export type CleaningType = "standard" | "deep" | "post_renovation" | "turnover";
export type CleaningMode = "managed" | "record_only";
export type CleaningStatus = "draft" | "offered" | "scheduled" | "in_progress" | "completed" | "revision_requested" | "accepted" | "declined";
export type CleaningPhotoPhase = "before" | "after";
export type CleaningZoneStatus = "pending" | "done" | "issue";
export type CleaningRecurrence = "none" | "weekly" | "biweekly" | "monthly";

export type CleaningZoneResult = {
  zone: string;
  status: CleaningZoneStatus;
  comment: string;
};

export type CleaningPhoto = {
  id: string;
  phase: CleaningPhotoPhase;
  zone?: string;
  url: string;
  filename: string;
  createdAt?: string;
};

export type Cleaning = {
  id: string;
  title: string;
  type: CleaningType;
  mode: CleaningMode;
  zones: string[];
  zoneResults: CleaningZoneResult[];
  checklist: string[];
  completedItems: string[];
  supplies: string[];
  scheduledFor: string;
  scheduledAt?: string;
  recurrence: CleaningRecurrence;
  cleaner: string;
  cleanerPhone?: string;
  status: CleaningStatus;
  cost?: number;
  notes?: string;
  ownerFeedback?: string;
  requirePhotoBefore: boolean;
  requirePhotoAfter: boolean;
  link?: string;
  createdAt: string;
  completedAt?: string;
  photos: CleaningPhoto[];
};

export const cleaningTypeLabels: Record<CleaningType, string> = {
  standard: "Поддерживающая",
  deep: "Генеральная",
  post_renovation: "После ремонта",
  turnover: "Между жильцами",
};

export const cleaningModeLabels: Record<CleaningMode, string> = {
  managed: "Передать клинеру по ссылке",
  record_only: "Только записать результат",
};

export const cleaningStatusLabels: Record<CleaningStatus, string> = {
  draft: "Черновик",
  offered: "Ожидает ответа",
  scheduled: "Запланирована",
  in_progress: "В процессе",
  completed: "Выполнена",
  revision_requested: "На доработке",
  accepted: "Принята",
  declined: "Отклонена",
};

export const cleaningRecurrenceLabels: Record<CleaningRecurrence, string> = {
  none: "Не повторять",
  weekly: "Каждую неделю",
  biweekly: "Раз в две недели",
  monthly: "Каждый месяц",
};
