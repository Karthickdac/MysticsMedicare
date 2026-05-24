import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  boolean,
  jsonb,
  date,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  staffId: integer("staff_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  uhid: varchar("uhid", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  gender: text("gender").notNull(),
  dob: date("dob").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  bloodGroup: text("blood_group"),
  allergies: text("allergies"),
  emergencyContact: text("emergency_contact"),
  insuranceProvider: text("insurance_provider"),
  insuranceNumber: text("insurance_number"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  staffId: varchar("staff_id", { length: 20 }).notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  department: text("department").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  specialization: text("specialization"),
  avatarUrl: text("avatar_url"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appointmentsTable = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  doctorId: integer("doctor_id").notNull().references(() => staffTable.id),
  department: text("department").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  status: text("status").notNull().default("scheduled"),
  reason: text("reason"),
  tokenNumber: integer("token_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const encountersTable = pgTable("encounters", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  doctorId: integer("doctor_id").notNull().references(() => staffTable.id),
  status: text("status").notNull().default("active"),
  chiefComplaint: text("chief_complaint"),
  diagnosis: text("diagnosis"),
  notes: text("notes"),
  bedId: integer("bed_id"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bedsTable = pgTable("beds", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  ward: text("ward").notNull(),
  floor: text("floor"),
  bedType: text("bed_type"),
  genderPolicy: text("gender_policy"),
  // Age-band policy enforced on admit/transfer. NULL = no constraint on that
  // bound (e.g. pediatric ward = ageMaxYears=12, geriatric = ageMinYears=60).
  ageMinYears: integer("age_min_years"),
  ageMaxYears: integer("age_max_years"),
  dailyRate: numeric("daily_rate", { precision: 12, scale: 2 }).notNull().default("1000"),
  status: text("status").notNull().default("available"),
  patientId: integer("patient_id").references(() => patientsTable.id),
  admittedAt: timestamp("admitted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// IPD admissions — first-class table separate from encounters so a single
// inpatient stay can span multiple bed transfers, ward rounds, nursing notes,
// and MAR entries while still being linked to its driving clinical encounter.
export const admissionsTable = pgTable("admissions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  encounterId: integer("encounter_id").references(() => encountersTable.id),
  doctorId: integer("doctor_id").notNull().references(() => staffTable.id),
  bedId: integer("bed_id").references(() => bedsTable.id),
  ward: text("ward").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("active"),
  advanceAmount: numeric("advance_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  summary: text("summary"),
  admittedAt: timestamp("admitted_at").notNull().defaultNow(),
  dischargedAt: timestamp("discharged_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bedTransfersTable = pgTable("bed_transfers", {
  id: serial("id").primaryKey(),
  admissionId: integer("admission_id").notNull().references(() => admissionsTable.id, { onDelete: "cascade" }),
  fromBedId: integer("from_bed_id").references(() => bedsTable.id),
  toBedId: integer("to_bed_id").notNull().references(() => bedsTable.id),
  reason: text("reason"),
  transferredBy: text("transferred_by"),
  transferredAt: timestamp("transferred_at").notNull().defaultNow(),
});

export const wardRoundsTable = pgTable("ward_rounds", {
  id: serial("id").primaryKey(),
  admissionId: integer("admission_id").notNull().references(() => admissionsTable.id, { onDelete: "cascade" }),
  doctorId: integer("doctor_id").references(() => staffTable.id),
  note: text("note").notNull(),
  signedBy: text("signed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const nursingNotesTable = pgTable("nursing_notes", {
  id: serial("id").primaryKey(),
  admissionId: integer("admission_id").notNull().references(() => admissionsTable.id, { onDelete: "cascade" }),
  nurseId: integer("nurse_id").references(() => staffTable.id),
  category: text("category").notNull().default("general"),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Medication administration record — one row per scheduled dose. Doses are
// generated up-front when the prescription is added to MAR (or on-the-fly via
// GET expansion) and then updated to given / held / refused as nurses act.
export const marEntriesTable = pgTable(
  "mar_entries",
  {
    id: serial("id").primaryKey(),
    admissionId: integer("admission_id").notNull().references(() => admissionsTable.id, { onDelete: "cascade" }),
    prescriptionId: integer("prescription_id").notNull().references(() => prescriptionsTable.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at").notNull(),
    status: text("status").notNull().default("pending"),
    administeredBy: text("administered_by"),
    administeredAt: timestamp("administered_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // Atomic dedupe: ON CONFLICT in MAR POST relies on this constraint so
    // double-clicks/parallel writes cannot create duplicate dose rows.
    uniqDose: uniqueIndex("mar_entries_dose_uniq").on(t.admissionId, t.prescriptionId, t.scheduledAt),
  }),
);

export const labOrdersTable = pgTable("lab_orders", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  testName: text("test_name").notNull(),
  category: text("category"),
  status: text("status").notNull().default("pending"),
  result: text("result"),
  normalRange: text("normal_range"),
  notes: text("notes"),
  orderedBy: text("ordered_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const prescriptionsTable = pgTable("prescriptions", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  encounterId: integer("encounter_id").references(() => encountersTable.id),
  drug: text("drug").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency"),
  duration: text("duration"),
  instructions: text("instructions"),
  status: text("status").notNull().default("pending"),
  prescribedBy: text("prescribed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  dispensedAt: timestamp("dispensed_at"),
});

export const drugsTable = pgTable("drugs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  genericName: text("generic_name"),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  manufacturer: text("manufacturer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const billsTable = pgTable("bills", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  billNumber: varchar("bill_number", { length: 30 }).notNull().unique(),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  cgst: numeric("cgst", { precision: 12, scale: 2 }).notNull().default("0"),
  sgst: numeric("sgst", { precision: 12, scale: 2 }).notNull().default("0"),
  igst: numeric("igst", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("unpaid"),
  paymentMethod: text("payment_method"),
  insuranceProvider: text("insurance_provider"),
  items: jsonb("items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const inventoryTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  sku: text("sku"),
  quantity: integer("quantity").notNull().default(0),
  unit: text("unit").notNull(),
  reorderLevel: integer("reorder_level"),
  expiryDate: date("expiry_date"),
  location: text("location"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vitalsTable = pgTable("vitals", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  bp: text("bp"),
  pulse: integer("pulse"),
  temperature: numeric("temperature", { precision: 5, scale: 2 }),
  spo2: integer("spo2"),
  respiratoryRate: integer("respiratory_rate"),
  weight: numeric("weight", { precision: 6, scale: 2 }),
  height: numeric("height", { precision: 6, scale: 2 }),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  recordedBy: text("recorded_by"),
});

export const radiologyTable = pgTable("radiology_orders", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  modality: text("modality").notNull(),
  bodyPart: text("body_part").notNull(),
  status: text("status").notNull().default("pending"),
  findings: text("findings"),
  impression: text("impression"),
  radiologist: text("radiologist"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const otBookingsTable = pgTable("ot_bookings", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  procedure: text("procedure").notNull(),
  theatre: text("theatre").notNull(),
  surgeon: text("surgeon"),
  anesthetist: text("anesthetist"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes"),
  status: text("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const vaccinationsTable = pgTable("vaccinations", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  vaccineName: text("vaccine_name").notNull(),
  doseNumber: integer("dose_number").notNull(),
  batchNumber: text("batch_number"),
  administeredBy: text("administered_by"),
  nextDueDate: date("next_due_date"),
  administeredAt: timestamp("administered_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const consentFormsTable = pgTable("consent_forms", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  details: text("details"),
  signatureData: text("signature_data"),
  witness: text("witness"),
  signedAt: timestamp("signed_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const checkupPackagesTable = pgTable("checkup_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  tests: jsonb("tests").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rosterShiftsTable = pgTable("roster_shifts", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  department: text("department").notNull(),
  shift: text("shift").notNull(),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const queueTokensTable = pgTable("queue_tokens", {
  id: serial("id").primaryKey(),
  tokenNumber: integer("token_number").notNull(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  department: text("department").notNull(),
  doctorName: text("doctor_name"),
  status: text("status").notNull().default("waiting"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  calledAt: timestamp("called_at"),
});

export const videoRecordingsTable = pgTable("video_recordings", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  encounterId: integer("encounter_id").references(() => encountersTable.id),
  encounterType: text("encounter_type").notNull(),
  title: text("title"),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type").notNull(),
  durationSeconds: numeric("duration_seconds", { precision: 10, scale: 2 }).notNull(),
  fileSize: integer("file_size"),
  recordedBy: text("recorded_by"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationTemplatesTable = pgTable("notification_templates", {
  id: serial("id").primaryKey(),
  eventKey: text("event_key").notNull(),
  channel: text("channel").notNull(),
  language: text("language").notNull().default("en"),
  subject: text("subject"),
  bodyTemplate: text("body_template").notNull(),
  variables: jsonb("variables").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const notificationLogTable = pgTable("notification_log", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patientsTable.id, { onDelete: "set null" }),
  staffId: integer("staff_id").references(() => staffTable.id, { onDelete: "set null" }),
  eventKey: text("event_key").notNull(),
  channel: text("channel").notNull(),
  templateId: integer("template_id").references(() => notificationTemplatesTable.id),
  renderedBody: text("rendered_body").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  status: text("status").notNull().default("sent"),
  providerRef: text("provider_ref"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  ipAddress: text("ip_address"),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
