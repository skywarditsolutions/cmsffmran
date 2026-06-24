export type NotificationChannel = "sms" | "email" | "push";
export type ConsumerContactMethod = "Phone" | "Email";
export type PhoneType = "Mobile" | "Home" | "Work";

export interface AdminMessage {
  id: string;
  from: string;
  message: string;
  sentAt: string;
  channel: NotificationChannel;
}

export interface AvailabilityWindow {
  // 0 = Sunday ... 6 = Saturday
  day: number;
  start: string; // "HH:MM" 24h
  end: string; // "HH:MM" 24h
}

// Temporary override of standard hours for the current day (HOD "Today's
// Availability"): accept referrals outside the regular schedule until a stop
// timestamp, with no penalty if ignored.
export interface TodayAvailability {
  accepting: boolean;
  stopReferralsAt: string | null; // ISO timestamp
}

export interface AgentBroker {
  npn: string; // National Producer Number (unique)
  name: string;
  email: string;
  phone: string;
  // CMS-licensed states (deselectable by agent, not addable beyond this set).
  licensedStates: string[];
  activeStates: string[];
  // Languages are sourced from the MLMS profile and are NOT editable in-app.
  languages: string[];
  notificationPrefs: NotificationChannel[];
  availability: AvailabilityWindow[];
  todayAvailability: TodayAvailability | null;
  outOfOfficeUntil: string | null; // ISO timestamp; null = no OOO
  outOfOfficeFrom: string | null; // ISO timestamp; when OOO starts
  trainingCurrent: boolean; // annual CMS training contingency
  passwordUpdatedAt: string; // for 180-day rotation rule
  status: "online" | "offline";
  currentLoad: number;
  maxLoad: number;
  missedReferralCount: number; // timeouts -> deactivation risk
  lastAssignedAt: string | null;
  lat: number;
  lng: number;
  adminMessages?: AdminMessage[];
}

export type RequestStatus =
  | "Submitted"
  | "Matching"
  | "Notified"
  | "Accepted"
  | "InProgress"
  | "Completed"
  | "NotGoodReferral"
  | "Queued"
  | "SafetyNet";

export interface RoutingAttempt {
  npn: string;
  notifiedAt: string;
  outcome: "notified" | "accepted" | "rejected" | "timeout";
  resolvedAt?: string;
  safetyNet?: boolean; // true if this was a safety-net broadcast notification
}

// Consumer PII is stored encrypted; this is the decrypted shape.
export interface ConsumerPII {
  firstName: string;
  lastName: string;
  phone: string;
  phoneType: PhoneType;
  email?: string;
  preferredContactMethod: ConsumerContactMethod;
}

export interface AssistanceRequest {
  requestId: string;
  status: RequestStatus;
  zip: string;
  city: string;
  state: string;
  language: string;
  lat: number;
  lng: number;
  piiEncrypted: string; // base64 KMS ciphertext of ConsumerPII
  consentTcpa: boolean;
  safetyNet: boolean; // true once routed to the after-hours safety-net broadcast
  assignedNpn: string | null;
  routingHistory: RoutingAttempt[];
  taskToken: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  firstNotifiedAt?: string;
  completedAt?: string;
}
