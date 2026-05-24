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
import { sql } from "drizzle-orm";

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

// Lab test catalog — master list of tests. Each catalog row carries
// pricing/GST/HSN for auto-billing and a `parameters` jsonb that defines the
// per-parameter result grid (units, reference ranges, age/sex-aware variants).
export const labTestCatalogTable = pgTable("lab_test_catalog", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  sampleType: text("sample_type").notNull(),
  container: text("container"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  hsn: text("hsn"),
  turnaroundHours: integer("turnaround_hours").notNull().default(24),
  // parameters: [{ name, unit, refLow?, refHigh?, refText?,
  //   refByAgeSex?: [{ minAgeYears, maxAgeYears, sex: 'M'|'F'|'A', low, high }] }]
  parameters: jsonb("parameters").notNull().default(sql`'[]'::jsonb`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const labOrdersTable = pgTable("lab_orders", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  catalogId: integer("catalog_id").references(() => labTestCatalogTable.id),
  testName: text("test_name").notNull(),
  category: text("category"),
  priority: text("priority").notNull().default("routine"), // routine|urgent|stat
  // pending → collected → in_lab → resulted → verified → dispatched. Or 'rejected'.
  status: text("status").notNull().default("pending"),
  // Legacy single-result fields kept for back-compat; new structured results
  // live in resultsJson as [{ name, value, unit, flag, refRange, comment }].
  result: text("result"),
  normalRange: text("normal_range"),
  notes: text("notes"),
  orderedBy: text("ordered_by"),
  billId: integer("bill_id"),
  sampleId: text("sample_id"),
  barcode: text("barcode"),
  collectedBy: text("collected_by"),
  collectedAt: timestamp("collected_at"),
  rejectionReason: text("rejection_reason"),
  resultsJson: jsonb("results_json").notNull().default(sql`'[]'::jsonb`),
  attachmentUrl: text("attachment_url"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at"),
  reportPdfUrl: text("report_pdf_url"),
  dispatchedAt: timestamp("dispatched_at"),
  dispatchedVia: text("dispatched_via"),
  // Patient acknowledged receipt of report via portal (closes the loop after dispatch).
  patientAcknowledgedAt: timestamp("patient_acknowledged_at"),
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
  // Pharmacy formulary fields — needed for GST-compliant retail dispensing.
  strength: text("strength"),       // e.g. "500 mg", "5 mg/5 ml"
  form: text("form"),               // tablet | capsule | syrup | injection | ointment | drops
  schedule: text("schedule"),       // H | H1 | X | OTC — controls Rx-required logic
  hsn: text("hsn"),                 // HSN code for GST reporting
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("12"),
  mrp: numeric("mrp", { precision: 12, scale: 2 }),
  reorderLevel: integer("reorder_level").notNull().default(10),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Pharmacy: suppliers, batches (lot-level stock), purchase orders & GRNs, and
// sales (Rx dispense or OTC) with returns. Stock-on-hand lives on the batch
// row; mutations happen under SELECT ... FOR UPDATE to keep counts honest
// under concurrent dispense/receive traffic. Aligns with billsTable so a
// dispense settles through the same GST + payment pipeline as any other bill.
export const pharmacySuppliersTable = pgTable("pharmacy_suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  gstin: text("gstin"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pharmacyBatchesTable = pgTable("pharmacy_batches", {
  id: serial("id").primaryKey(),
  drugId: integer("drug_id").notNull().references(() => drugsTable.id),
  batchNo: text("batch_no").notNull(),
  expiry: date("expiry").notNull(),
  qtyOnHand: integer("qty_on_hand").notNull().default(0),
  costPerUnit: numeric("cost_per_unit", { precision: 12, scale: 2 }).notNull().default("0"),
  mrp: numeric("mrp", { precision: 12, scale: 2 }).notNull().default("0"),
  location: text("location"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  grnId: integer("grn_id"),
}, (t) => ({
  // Batch identity is (drug, batch_no, expiry); guarantees merge target uniqueness.
  drugBatchExpiryUnique: uniqueIndex("pharmacy_batches_drug_batch_expiry_idx").on(t.drugId, t.batchNo, t.expiry),
}));

export const pharmacyPurchaseOrdersTable = pgTable("pharmacy_purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  supplierId: integer("supplier_id").notNull().references(() => pharmacySuppliersTable.id),
  status: text("status").notNull().default("draft"), // draft | placed | received | cancelled
  notes: text("notes"),
  expectedAmount: numeric("expected_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  placedAt: timestamp("placed_at"),
});

export const pharmacyPurchaseOrderItemsTable = pgTable("pharmacy_purchase_order_items", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => pharmacyPurchaseOrdersTable.id, { onDelete: "cascade" }),
  drugId: integer("drug_id").notNull().references(() => drugsTable.id),
  qty: integer("qty").notNull(),
  costPerUnit: numeric("cost_per_unit", { precision: 12, scale: 2 }).notNull(),
});

export const pharmacyGrnsTable = pgTable("pharmacy_grns", {
  id: serial("id").primaryKey(),
  grnNumber: text("grn_number").notNull().unique(),
  supplierId: integer("supplier_id").notNull().references(() => pharmacySuppliersTable.id),
  poId: integer("po_id").references(() => pharmacyPurchaseOrdersTable.id),
  invoiceNumber: text("invoice_number"),
  invoiceDate: date("invoice_date"),
  landedCost: numeric("landed_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  receivedBy: text("received_by"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const pharmacyGrnItemsTable = pgTable("pharmacy_grn_items", {
  id: serial("id").primaryKey(),
  grnId: integer("grn_id").notNull().references(() => pharmacyGrnsTable.id, { onDelete: "cascade" }),
  drugId: integer("drug_id").notNull().references(() => drugsTable.id),
  batchId: integer("batch_id").references(() => pharmacyBatchesTable.id),
  batchNo: text("batch_no").notNull(),
  expiry: date("expiry").notNull(),
  qty: integer("qty").notNull(),
  costPerUnit: numeric("cost_per_unit", { precision: 12, scale: 2 }).notNull(),
  mrp: numeric("mrp", { precision: 12, scale: 2 }).notNull(),
});

export const pharmacySalesTable = pgTable("pharmacy_sales", {
  id: serial("id").primaryKey(),
  saleNumber: text("sale_number").notNull().unique(),
  kind: text("kind").notNull(), // 'rx' | 'otc'
  patientId: integer("patient_id").references(() => patientsTable.id),
  prescriptionId: integer("prescription_id").references(() => prescriptionsTable.id),
  billId: integer("bill_id").references(() => billsTable.id),
  walkInName: text("walk_in_name"),
  walkInPhone: text("walk_in_phone"),
  status: text("status").notNull().default("dispensed"), // dispensed | returned | partial_return
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  dispensedBy: text("dispensed_by"),
  dispensedAt: timestamp("dispensed_at").notNull().defaultNow(),
});

export const pharmacySaleItemsTable = pgTable("pharmacy_sale_items", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => pharmacySalesTable.id, { onDelete: "cascade" }),
  drugId: integer("drug_id").notNull().references(() => drugsTable.id),
  batchId: integer("batch_id").notNull().references(() => pharmacyBatchesTable.id),
  qty: integer("qty").notNull(),
  qtyReturned: integer("qty_returned").notNull().default(0),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(), // MRP at sale time
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(), // line total incl. GST
});

export const pharmacyReturnsTable = pgTable("pharmacy_returns", {
  id: serial("id").primaryKey(),
  returnNumber: text("return_number").notNull().unique(),
  saleId: integer("sale_id").notNull().references(() => pharmacySalesTable.id),
  reason: text("reason"),
  refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  approvedBy: text("approved_by"),
  returnedAt: timestamp("returned_at").notNull().defaultNow(),
});

export const pharmacyReturnItemsTable = pgTable("pharmacy_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull().references(() => pharmacyReturnsTable.id, { onDelete: "cascade" }),
  saleItemId: integer("sale_item_id").notNull().references(() => pharmacySaleItemsTable.id),
  qty: integer("qty").notNull(),
  restock: boolean("restock").notNull().default(true),
  refundLine: numeric("refund_line", { precision: 12, scale: 2 }).notNull(),
});

export const billsTable = pgTable("bills", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  doctorId: integer("doctor_id").references(() => staffTable.id),
  department: text("department"),
  billNumber: varchar("bill_number", { length: 30 }).notNull().unique(),
  // discount applied at line level is captured in items[]; this is the
  // optional bill-level (e.g. "promo / concession") discount applied AFTER
  // line totals — subtotal already nets line discounts; we then deduct
  // billDiscount before computing GST.
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  cgst: numeric("cgst", { precision: 12, scale: 2 }).notNull().default("0"),
  sgst: numeric("sgst", { precision: 12, scale: 2 }).notNull().default("0"),
  igst: numeric("igst", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  refundedAmount: numeric("refunded_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  // unpaid | partial | paid | refunded | void
  status: text("status").notNull().default("unpaid"),
  gstMode: text("gst_mode").notNull().default("intra"),
  paymentMethod: text("payment_method"),
  insuranceProvider: text("insurance_provider"),
  tpa: text("tpa"),
  policyNumber: text("policy_number"),
  preAuthCode: text("pre_auth_code"),
  // none | submitted | approved | rejected | settled
  claimStatus: text("claim_status").notNull().default("none"),
  claimAmount: numeric("claim_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  voidedBy: text("voided_by"),
  items: jsonb("items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const serviceCatalogTable = pgTable("service_catalog", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  department: text("department"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("18"),
  hsnSac: varchar("hsn_sac", { length: 12 }),
  isPackage: boolean("is_package").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per cashier-collected payment against a bill. Bills can have
// many partial payments across modes (cash/card/UPI/insurance/cheque/netbanking).
export const billPaymentsTable = pgTable("bill_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  receiptNumber: varchar("receipt_number", { length: 30 }).notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  // Cash drawer overpay support: tendered is what the customer handed over,
  // changeDue is what was returned. `amount` is what was applied to the bill.
  tenderedAmount: numeric("tendered_amount", { precision: 12, scale: 2 }),
  changeDue: numeric("change_due", { precision: 12, scale: 2 }),
  mode: text("mode").notNull(), // cash|card|upi|insurance|cheque|netbanking
  reference: text("reference"),
  receivedBy: text("received_by"),
  cashierSessionId: integer("cashier_session_id"),
  notes: text("notes"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const billRefundsTable = pgTable("bill_refunds", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").references(() => billPaymentsTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  mode: text("mode").notNull(),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by"),
  refundedAt: timestamp("refunded_at").notNull().defaultNow(),
});

// Cashier shift / day-end reconciliation. open one per cashier; closing
// captures counted cash and any variance vs system-recorded cash collections.
export const cashierSessionsTable = pgTable(
  "cashier_sessions",
  {
    id: serial("id").primaryKey(),
    cashierUserId: integer("cashier_user_id").notNull().references(() => usersTable.id),
    cashierName: text("cashier_name").notNull(),
    openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
    closingCash: numeric("closing_cash", { precision: 12, scale: 2 }),
    expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }),
    variance: numeric("variance", { precision: 12, scale: 2 }),
    status: text("status").notNull().default("open"), // open | closed
    notes: text("notes"),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (t) => ({
    // DB-level invariant: at most one open drawer per cashier. Protects against
    // racing "open session" requests that would both pass app-level checks and
    // break payment attribution / close reconciliation.
    oneOpenPerCashier: uniqueIndex("cashier_sessions_one_open_per_user")
      .on(t.cashierUserId)
      .where(sql`status = 'open'`),
  }),
);

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

// Radiology procedure catalog (X-Ray/CT/MRI/USG) used for auto-billing and
// scheduling defaults (duration, prep instructions).
export const radiologyCatalogTable = pgTable("radiology_catalog", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  modality: text("modality").notNull(),
  bodyPart: text("body_part").notNull(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  hsn: text("hsn"),
  durationMin: integer("duration_min").notNull().default(15),
  prepInstructions: text("prep_instructions"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const radiologyTable = pgTable("radiology_orders", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  catalogId: integer("catalog_id").references(() => radiologyCatalogTable.id),
  modality: text("modality").notNull(),
  bodyPart: text("body_part").notNull(),
  priority: text("priority").notNull().default("routine"),
  // pending → scheduled → captured → reported → verified → dispatched
  status: text("status").notNull().default("pending"),
  findings: text("findings"),
  impression: text("impression"),
  radiologist: text("radiologist"),
  imageUrl: text("image_url"),
  pacsUrl: text("pacs_url"),
  billId: integer("bill_id"),
  scheduledAt: timestamp("scheduled_at"),
  technologist: text("technologist"),
  capturedAt: timestamp("captured_at"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at"),
  reportPdfUrl: text("report_pdf_url"),
  dispatchedAt: timestamp("dispatched_at"),
  dispatchedVia: text("dispatched_via"),
  patientAcknowledgedAt: timestamp("patient_acknowledged_at"),
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

// Patient-portal OTP. One active row per patient at a time (older ones are
// left in place as an audit trail; lookup uses the latest non-consumed row).
// `attempts` is incremented on each /verify so we can lock out after 5 wrong
// guesses without invalidating the code (the next /request issues a new one).
export const patientOtpTable = pgTable("patient_otp", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Audit trail for self-service profile edits made from the patient portal.
// Kept separate from staff `audit_log` (which is keyed to a staff userId) so
// portal-initiated changes are clearly attributable to the patient themselves.
export const patientAuditLogTable = pgTable("patient_audit_log", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
