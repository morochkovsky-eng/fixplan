export type CleaningType = "standard" | "deep" | "post_renovation" | "turnover";
export type CleaningMode = "managed" | "record_only";
export type CleaningStatus = "draft" | "scheduled" | "in_progress" | "completed" | "accepted";
export type CleaningPhotoPhase = "before" | "after";

export type CleaningPhoto = {
  id: string;
  phase: CleaningPhotoPhase;
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
  checklist: string[];
  completedItems: string[];
  supplies: string[];
  scheduledFor: string;
  cleaner: string;
  cleanerPhone?: string;
  status: CleaningStatus;
  cost?: number;
  notes?: string;
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
  scheduled: "Запланирована",
  in_progress: "В процессе",
  completed: "Выполнена",
  accepted: "Принята",
};
