import { db } from "@workspace/db";
import {
  usersTable,
  patientsTable,
  staffTable,
  appointmentsTable,
  bedsTable,
  drugsTable,
  inventoryTable,
  encountersTable,
  labOrdersTable,
  prescriptionsTable,
  vitalsTable,
  radiologyTable,
  otBookingsTable,
  vaccinationsTable,
  checkupPackagesTable,
  rosterShiftsTable,
  queueTokensTable,
  billsTable,
  notificationTemplatesTable,
} from "@workspace/db";
import { NOTIFICATION_EVENTS } from "../lib/notifications";

async function main() {
  console.log("Seeding database...");

  await db.delete(notificationTemplatesTable);
  await db.delete(queueTokensTable);
  await db.delete(rosterShiftsTable);
  await db.delete(checkupPackagesTable);
  await db.delete(vaccinationsTable);
  await db.delete(otBookingsTable);
  await db.delete(radiologyTable);
  await db.delete(vitalsTable);
  await db.delete(prescriptionsTable);
  await db.delete(labOrdersTable);
  await db.delete(billsTable);
  await db.delete(encountersTable);
  await db.delete(bedsTable);
  await db.delete(appointmentsTable);
  await db.delete(patientsTable);
  await db.delete(usersTable);
  await db.delete(staffTable);
  await db.delete(inventoryTable);
  await db.delete(drugsTable);

  // ============= STAFF (9 roles) =============
  const staffData = [
    { staffId: "STF0001", name: "Dr. Arjun Mehta", role: "doctor", department: "Cardiology", email: "arjun.mehta@medicare.in", phone: "+919876543210", specialization: "Interventional Cardiology" },
    { staffId: "STF0002", name: "Dr. Priya Iyer", role: "doctor", department: "Pediatrics", email: "priya.iyer@medicare.in", phone: "+919876543211", specialization: "Neonatology" },
    { staffId: "STF0003", name: "Dr. Sanjay Kapoor", role: "doctor", department: "Orthopedics", email: "sanjay.kapoor@medicare.in", phone: "+919876543212", specialization: "Joint Replacement" },
    { staffId: "STF0004", name: "Dr. Nisha Reddy", role: "doctor", department: "Gynecology", email: "nisha.reddy@medicare.in", phone: "+919876543213", specialization: "Obstetrics" },
    { staffId: "STF0005", name: "Dr. Rohit Sharma", role: "doctor", department: "General Medicine", email: "rohit.sharma@medicare.in", phone: "+919876543214", specialization: "Internal Medicine" },
    { staffId: "STF0006", name: "Sister Anita Joseph", role: "nurse", department: "ICU", email: "anita.joseph@medicare.in", phone: "+919876543215" },
    { staffId: "STF0007", name: "Sister Kavita Singh", role: "nurse", department: "General Ward", email: "kavita.singh@medicare.in", phone: "+919876543216" },
    { staffId: "STF0008", name: "Ramesh Kumar", role: "receptionist", department: "Front Office", email: "ramesh.kumar@medicare.in", phone: "+919876543217" },
    { staffId: "STF0009", name: "Suresh Patil", role: "labtech", department: "Pathology", email: "suresh.patil@medicare.in", phone: "+919876543218" },
    { staffId: "STF0010", name: "Deepika Verma", role: "pharmacist", department: "Pharmacy", email: "deepika.verma@medicare.in", phone: "+919876543219" },
    { staffId: "STF0011", name: "Dr. Vikram Joshi", role: "radiologist", department: "Radiology", email: "vikram.joshi@medicare.in", phone: "+919876543220", specialization: "Diagnostic Imaging" },
    { staffId: "STF0012", name: "Amit Khanna", role: "accountant", department: "Billing", email: "amit.khanna@medicare.in", phone: "+919876543221" },
    { staffId: "STF0013", name: "Rajesh Gupta", role: "admin", department: "Administration", email: "rajesh.gupta@medicare.in", phone: "+919876543222" },
  ];
  const staff = await db.insert(staffTable).values(staffData).returning();
  console.log(`✓ ${staff.length} staff members`);

  // ============= USERS (one per role for login) =============
  const userRows = [
    { email: "admin@medicare.in", password: "admin123", name: "Rajesh Gupta", role: "admin", staffId: staff[12].id },
    { email: "doctor@medicare.in", password: "doctor123", name: "Dr. Arjun Mehta", role: "doctor", staffId: staff[0].id },
    { email: "nurse@medicare.in", password: "nurse123", name: "Sister Anita Joseph", role: "nurse", staffId: staff[5].id },
    { email: "reception@medicare.in", password: "reception123", name: "Ramesh Kumar", role: "receptionist", staffId: staff[7].id },
    { email: "lab@medicare.in", password: "lab123", name: "Suresh Patil", role: "labtech", staffId: staff[8].id },
    { email: "pharmacy@medicare.in", password: "pharmacy123", name: "Deepika Verma", role: "pharmacist", staffId: staff[9].id },
    { email: "radiology@medicare.in", password: "radiology123", name: "Dr. Vikram Joshi", role: "radiologist", staffId: staff[10].id },
    { email: "billing@medicare.in", password: "billing123", name: "Amit Khanna", role: "accountant", staffId: staff[11].id },
  ];
  await db.insert(usersTable).values(
    userRows.map((u) => ({ email: u.email, passwordHash: u.password, name: u.name, role: u.role, staffId: u.staffId })),
  );
  console.log(`✓ ${userRows.length} users`);

  // ============= PATIENTS =============
  const firstNames = ["Aarav", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya", "Krishna", "Meera", "Neha", "Pooja", "Rahul", "Riya", "Rohan", "Saanvi", "Vihaan", "Aditya", "Ishita", "Karan", "Lakshmi", "Manish", "Nikhil", "Priya", "Rajeev", "Shreya", "Tarun", "Uma", "Varun", "Yash", "Zara", "Aryan", "Bhavna", "Chirag", "Divya", "Esha", "Farhan", "Gauri", "Hari", "Indu", "Jaya", "Kabir", "Leela", "Mahesh", "Nandini", "Omkar", "Padma", "Quincy", "Radha", "Shiv", "Tanvi", "Uday"];
  const lastNames = ["Sharma", "Patel", "Kumar", "Singh", "Gupta", "Reddy", "Iyer", "Nair", "Mehta", "Joshi", "Khanna", "Verma", "Bhat", "Pillai", "Rao"];
  const blood = ["A+", "B+", "O+", "AB+", "A-", "B-", "O-", "AB-"];
  const genders = ["male", "female"];

  const patients = [];
  for (let i = 1; i <= 50; i++) {
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const age = 5 + Math.floor(Math.random() * 75);
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - age);
    patients.push({
      uhid: `UH${String(i).padStart(6, "0")}`,
      name: `${fn} ${ln}`,
      gender: genders[Math.floor(Math.random() * 2)],
      dob: dob.toISOString().slice(0, 10),
      phone: `+9198${String(10000000 + Math.floor(Math.random() * 89999999))}`,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
      address: `${Math.floor(Math.random() * 999)}, ${["MG Road", "Brigade Road", "Park Street", "Marine Drive", "Linking Road"][Math.floor(Math.random() * 5)]}, ${["Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad"][Math.floor(Math.random() * 5)]}`,
      bloodGroup: blood[Math.floor(Math.random() * blood.length)],
      allergies: Math.random() > 0.7 ? ["Penicillin", "Dust", "Pollen", "Peanuts"][Math.floor(Math.random() * 4)] : null,
      emergencyContact: `+9198${String(10000000 + Math.floor(Math.random() * 89999999))}`,
      insuranceProvider: Math.random() > 0.5 ? ["Star Health", "HDFC ERGO", "ICICI Lombard", "New India Assurance"][Math.floor(Math.random() * 4)] : null,
      insuranceNumber: Math.random() > 0.5 ? `POL${Math.floor(Math.random() * 9999999)}` : null,
    });
  }
  const pts = await db.insert(patientsTable).values(patients).returning();
  console.log(`✓ ${pts.length} patients`);

  // ============= BEDS =============
  const beds = [];
  const wards = [
    { ward: "ICU", prefix: "ICU", count: 10 },
    { ward: "General Ward A", prefix: "GWA", count: 20 },
    { ward: "General Ward B", prefix: "GWB", count: 20 },
    { ward: "Pediatrics", prefix: "PED", count: 12 },
    { ward: "Maternity", prefix: "MAT", count: 10 },
    { ward: "Private Room", prefix: "PVT", count: 8 },
  ];
  for (const w of wards) {
    for (let i = 1; i <= w.count; i++) {
      beds.push({ code: `${w.prefix}-${String(i).padStart(3, "0")}`, ward: w.ward, status: "available" as const });
    }
  }
  const bedRows = await db.insert(bedsTable).values(beds).returning();
  const { eq } = await import("drizzle-orm");
  for (let i = 0; i < Math.floor(bedRows.length * 0.35); i++) {
    await db
      .update(bedsTable)
      .set({ patientId: pts[i].id, status: "occupied", admittedAt: new Date(Date.now() - Math.random() * 7 * 24 * 3600 * 1000) })
      .where(eq(bedsTable.id, bedRows[i].id));
  }
  console.log(`✓ ${bedRows.length} beds`);

  // ============= DRUGS =============
  const drugs = [
    { name: "Paracetamol 500mg", genericName: "Acetaminophen", category: "Analgesic", unit: "tablet", manufacturer: "Cipla" },
    { name: "Amoxicillin 500mg", genericName: "Amoxicillin", category: "Antibiotic", unit: "capsule", manufacturer: "Sun Pharma" },
    { name: "Azithromycin 500mg", genericName: "Azithromycin", category: "Antibiotic", unit: "tablet", manufacturer: "Dr. Reddy's" },
    { name: "Metformin 500mg", genericName: "Metformin", category: "Antidiabetic", unit: "tablet", manufacturer: "Lupin" },
    { name: "Amlodipine 5mg", genericName: "Amlodipine", category: "Antihypertensive", unit: "tablet", manufacturer: "Torrent" },
    { name: "Atorvastatin 10mg", genericName: "Atorvastatin", category: "Statin", unit: "tablet", manufacturer: "Cipla" },
    { name: "Pantoprazole 40mg", genericName: "Pantoprazole", category: "PPI", unit: "tablet", manufacturer: "Sun Pharma" },
    { name: "Cetirizine 10mg", genericName: "Cetirizine", category: "Antihistamine", unit: "tablet", manufacturer: "Mankind" },
    { name: "Salbutamol Inhaler", genericName: "Salbutamol", category: "Bronchodilator", unit: "inhaler", manufacturer: "Cipla" },
    { name: "Insulin Regular", genericName: "Insulin", category: "Antidiabetic", unit: "vial", manufacturer: "Novo Nordisk" },
    { name: "Diclofenac 50mg", genericName: "Diclofenac", category: "NSAID", unit: "tablet", manufacturer: "Cipla" },
    { name: "Omeprazole 20mg", genericName: "Omeprazole", category: "PPI", unit: "capsule", manufacturer: "Dr. Reddy's" },
  ];
  await db.insert(drugsTable).values(drugs);
  console.log(`✓ ${drugs.length} drugs`);

  // ============= INVENTORY =============
  const inv = [
    { name: "Surgical Gloves (M)", category: "Consumables", sku: "GLV-M", quantity: 500, unit: "pair", reorderLevel: 100, location: "Store A", unitCost: "8.50" },
    { name: "N95 Masks", category: "PPE", sku: "MSK-N95", quantity: 200, unit: "piece", reorderLevel: 50, location: "Store A", unitCost: "45.00" },
    { name: "IV Cannula 18G", category: "Consumables", sku: "CAN-18G", quantity: 75, unit: "piece", reorderLevel: 100, location: "Store B", unitCost: "32.00" },
    { name: "Syringe 5ml", category: "Consumables", sku: "SYR-5ML", quantity: 1000, unit: "piece", reorderLevel: 200, location: "Store A", unitCost: "4.50" },
    { name: "Bandage 4 inch", category: "Dressings", sku: "BND-4", quantity: 150, unit: "roll", reorderLevel: 50, location: "Store B", unitCost: "25.00" },
    { name: "Saline 500ml", category: "IV Fluids", sku: "IV-SAL-500", quantity: 80, unit: "bottle", reorderLevel: 100, expiryDate: "2027-06-30", location: "Pharmacy", unitCost: "55.00" },
    { name: "Surgical Mask", category: "PPE", sku: "MSK-SURG", quantity: 5000, unit: "piece", reorderLevel: 500, location: "Store A", unitCost: "2.50" },
    { name: "Stethoscope", category: "Equipment", sku: "EQ-STETH", quantity: 25, unit: "piece", reorderLevel: 5, location: "Store C", unitCost: "1850.00" },
  ];
  await db.insert(inventoryTable).values(inv);
  console.log(`✓ ${inv.length} inventory items`);

  // ============= APPOINTMENTS =============
  const doctorIds = staff.filter((s) => s.role === "doctor").map((s) => s.id);
  const appts = [];
  for (let i = 0; i < 40; i++) {
    const future = Math.random() > 0.3;
    const offset = (future ? 1 : -1) * Math.floor(Math.random() * 7 * 24);
    const when = new Date();
    when.setHours(when.getHours() + offset);
    when.setMinutes(Math.random() > 0.5 ? 0 : 30);
    const docIdx = Math.floor(Math.random() * doctorIds.length);
    appts.push({
      patientId: pts[Math.floor(Math.random() * pts.length)].id,
      doctorId: doctorIds[docIdx],
      department: staff.find((s) => s.id === doctorIds[docIdx])!.department,
      scheduledAt: when,
      status: future ? "scheduled" : Math.random() > 0.5 ? "completed" : "scheduled",
      reason: ["Follow-up", "Consultation", "Check-up", "Review"][Math.floor(Math.random() * 4)],
      tokenNumber: i + 1,
    });
  }
  await db.insert(appointmentsTable).values(appts);
  console.log(`✓ ${appts.length} appointments`);

  // ============= ENCOUNTERS =============
  const encs = [];
  for (let i = 0; i < 25; i++) {
    encs.push({
      patientId: pts[i].id,
      type: Math.random() > 0.5 ? "opd" : "ipd",
      doctorId: doctorIds[Math.floor(Math.random() * doctorIds.length)],
      status: Math.random() > 0.4 ? "completed" : "active",
      chiefComplaint: ["Fever and cough", "Chest pain", "Abdominal pain", "Headache", "Back pain"][Math.floor(Math.random() * 5)],
      diagnosis: ["Viral fever", "Hypertension", "Type 2 Diabetes", "Migraine", "Bronchitis"][Math.floor(Math.random() * 5)],
      notes: "Patient stable, advised rest and medication.",
      startedAt: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000),
    });
  }
  const encRows = await db.insert(encountersTable).values(encs).returning();
  console.log(`✓ ${encRows.length} encounters`);

  // ============= LAB ORDERS =============
  const tests = ["CBC", "Liver Function", "Kidney Function", "HbA1c", "Lipid Profile", "TSH", "Vitamin D", "Urine Routine"];
  const labs = [];
  for (let i = 0; i < 30; i++) {
    const completed = Math.random() > 0.4;
    labs.push({
      patientId: pts[Math.floor(Math.random() * pts.length)].id,
      testName: tests[Math.floor(Math.random() * tests.length)],
      category: "Pathology",
      status: completed ? "completed" : Math.random() > 0.5 ? "pending" : "in_progress",
      result: completed ? "Within normal limits" : null,
      normalRange: "See report",
      orderedBy: "Dr. Arjun Mehta",
      completedAt: completed ? new Date() : null,
    });
  }
  await db.insert(labOrdersTable).values(labs);
  console.log(`✓ ${labs.length} lab orders`);

  // ============= PRESCRIPTIONS =============
  const presc = [];
  for (let i = 0; i < 35; i++) {
    presc.push({
      patientId: pts[Math.floor(Math.random() * pts.length)].id,
      encounterId: encRows[Math.floor(Math.random() * encRows.length)].id,
      drug: drugs[Math.floor(Math.random() * drugs.length)].name,
      dosage: ["1 tablet", "2 tablets", "5ml", "1 capsule"][Math.floor(Math.random() * 4)],
      frequency: ["Once daily", "Twice daily", "Thrice daily", "Every 6 hours"][Math.floor(Math.random() * 4)],
      duration: ["3 days", "5 days", "7 days", "10 days"][Math.floor(Math.random() * 4)],
      instructions: "Take after food",
      status: Math.random() > 0.5 ? "dispensed" : "pending",
      prescribedBy: "Dr. Arjun Mehta",
      dispensedAt: Math.random() > 0.5 ? new Date() : null,
    });
  }
  await db.insert(prescriptionsTable).values(presc);
  console.log(`✓ ${presc.length} prescriptions`);

  // ============= VITALS =============
  const vitals = [];
  for (let i = 0; i < 60; i++) {
    vitals.push({
      patientId: pts[Math.floor(Math.random() * pts.length)].id,
      bp: `${110 + Math.floor(Math.random() * 40)}/${70 + Math.floor(Math.random() * 20)}`,
      pulse: 65 + Math.floor(Math.random() * 30),
      temperature: (97 + Math.random() * 4).toFixed(1),
      spo2: 94 + Math.floor(Math.random() * 6),
      respiratoryRate: 14 + Math.floor(Math.random() * 8),
      weight: (45 + Math.random() * 50).toFixed(1),
      height: (150 + Math.random() * 40).toFixed(1),
      recordedAt: new Date(Date.now() - Math.random() * 14 * 24 * 3600 * 1000),
      recordedBy: "Sister Anita Joseph",
    });
  }
  await db.insert(vitalsTable).values(vitals);
  console.log(`✓ ${vitals.length} vitals`);

  // ============= RADIOLOGY =============
  const rads = [];
  for (let i = 0; i < 15; i++) {
    rads.push({
      patientId: pts[Math.floor(Math.random() * pts.length)].id,
      modality: ["X-Ray", "MRI", "CT", "Ultrasound"][Math.floor(Math.random() * 4)],
      bodyPart: ["Chest", "Spine", "Abdomen", "Head", "Knee"][Math.floor(Math.random() * 5)],
      status: Math.random() > 0.5 ? "completed" : "pending",
      findings: Math.random() > 0.5 ? "No acute abnormality" : null,
      impression: Math.random() > 0.5 ? "Normal study" : null,
      radiologist: "Dr. Vikram Joshi",
    });
  }
  await db.insert(radiologyTable).values(rads);
  console.log(`✓ ${rads.length} radiology orders`);

  // ============= OT BOOKINGS =============
  const ots = [];
  for (let i = 0; i < 8; i++) {
    const when = new Date();
    when.setDate(when.getDate() + Math.floor(Math.random() * 14));
    ots.push({
      patientId: pts[Math.floor(Math.random() * pts.length)].id,
      procedure: ["Appendectomy", "Cholecystectomy", "Knee Arthroscopy", "Cataract Surgery", "C-Section"][Math.floor(Math.random() * 5)],
      theatre: `OT-${1 + Math.floor(Math.random() * 4)}`,
      surgeon: "Dr. Sanjay Kapoor",
      anesthetist: "Dr. Rohit Sharma",
      scheduledAt: when,
      durationMinutes: 60 + Math.floor(Math.random() * 180),
      status: "scheduled",
    });
  }
  await db.insert(otBookingsTable).values(ots);
  console.log(`✓ ${ots.length} OT bookings`);

  // ============= VACCINATIONS =============
  const vax = [];
  for (let i = 0; i < 20; i++) {
    const adminDate = new Date(Date.now() - Math.random() * 90 * 24 * 3600 * 1000);
    const next = new Date(adminDate);
    next.setDate(next.getDate() + 30);
    vax.push({
      patientId: pts[Math.floor(Math.random() * pts.length)].id,
      vaccineName: ["Covishield", "Covaxin", "Hepatitis B", "MMR", "Tdap", "Influenza"][Math.floor(Math.random() * 6)],
      doseNumber: 1 + Math.floor(Math.random() * 3),
      batchNumber: `BATCH-${Math.floor(Math.random() * 99999)}`,
      administeredBy: "Sister Kavita Singh",
      nextDueDate: next.toISOString().slice(0, 10),
      administeredAt: adminDate,
    });
  }
  await db.insert(vaccinationsTable).values(vax);
  console.log(`✓ ${vax.length} vaccinations`);

  // ============= CHECKUP PACKAGES =============
  const packages = [
    { name: "Basic Health Checkup", description: "Essential screening for healthy adults", price: "1500.00", tests: ["CBC", "Blood Sugar", "BP", "BMI"] },
    { name: "Comprehensive Health Checkup", description: "Full body screening with detailed reports", price: "4500.00", tests: ["CBC", "LFT", "KFT", "Lipid Profile", "TSH", "ECG", "X-Ray Chest", "USG Abdomen"] },
    { name: "Cardiac Health Package", description: "Heart health assessment", price: "6000.00", tests: ["ECG", "2D Echo", "Lipid Profile", "TMT", "Cardiac Consultation"] },
    { name: "Diabetes Care Package", description: "Diabetes screening and monitoring", price: "2200.00", tests: ["HbA1c", "Fasting Sugar", "PP Sugar", "KFT", "Microalbumin"] },
    { name: "Women's Health Package", description: "Specialized screening for women", price: "5500.00", tests: ["CBC", "Pap Smear", "USG Pelvis", "Mammography", "Vitamin D"] },
  ];
  await db.insert(checkupPackagesTable).values(packages);
  console.log(`✓ ${packages.length} checkup packages`);

  // ============= ROSTER =============
  const roster = [];
  for (let d = 0; d < 7; d++) {
    const day = new Date();
    day.setDate(day.getDate() + d);
    const dayStr = day.toISOString().slice(0, 10);
    for (const s of staff.slice(0, 8)) {
      roster.push({
        staffId: s.id,
        department: s.department,
        shift: ["Morning", "Evening", "Night"][Math.floor(Math.random() * 3)],
        date: dayStr,
      });
    }
  }
  await db.insert(rosterShiftsTable).values(roster);
  console.log(`✓ ${roster.length} roster shifts`);

  // ============= QUEUE TOKENS =============
  const tokens = [];
  for (let i = 1; i <= 12; i++) {
    tokens.push({
      tokenNumber: i,
      patientId: pts[i].id,
      department: ["Cardiology", "Pediatrics", "General Medicine"][i % 3],
      doctorName: ["Dr. Arjun Mehta", "Dr. Priya Iyer", "Dr. Rohit Sharma"][i % 3],
      status: i <= 2 ? "called" : "waiting",
      calledAt: i <= 2 ? new Date() : null,
    });
  }
  await db.insert(queueTokensTable).values(tokens);
  console.log(`✓ ${tokens.length} queue tokens`);

  // ============= BILLS =============
  const bills = [];
  for (let i = 1; i <= 20; i++) {
    const items = [
      { description: "Consultation Fee", quantity: 1, unitPrice: 800, amount: 800 },
      { description: "CBC Test", quantity: 1, unitPrice: 450, amount: 450 },
    ];
    if (Math.random() > 0.5) {
      items.push({ description: "Medicine - Paracetamol 500mg", quantity: 20, unitPrice: 2, amount: 40 });
    }
    const subtotal = items.reduce((s, it) => s + it.amount, 0);
    const cgst = subtotal * 0.09;
    const sgst = subtotal * 0.09;
    const total = subtotal + cgst + sgst;
    const paid = Math.random() > 0.4;
    bills.push({
      patientId: pts[i].id,
      billNumber: `INV${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${String(i).padStart(4, "0")}`,
      subtotal: subtotal.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: "0",
      total: total.toFixed(2),
      status: paid ? "paid" : "unpaid",
      paymentMethod: paid ? "cash" : null,
      items,
      paidAt: paid ? new Date() : null,
    });
  }
  await db.insert(billsTable).values(bills);
  console.log(`✓ ${bills.length} bills`);

  // ============= NOTIFICATION TEMPLATES (1 WhatsApp + 1 SMS per event) =============
  const tpls = [];
  for (const ev of NOTIFICATION_EVENTS) {
    const vars = ev.defaultVariables;
    const varList = vars.map((v) => `{{${v}}}`).join(" ");
    tpls.push({
      eventKey: ev.key,
      channel: "whatsapp",
      language: "en",
      subject: ev.label,
      bodyTemplate: `Dear {{patientName}}, ${ev.label}: ${varList}. - MediCare Hospital`,
      variables: ["patientName", ...vars],
      isActive: true,
    });
    tpls.push({
      eventKey: ev.key,
      channel: "sms",
      language: "en",
      subject: ev.label,
      bodyTemplate: `MediCare: ${ev.label} for {{patientName}}. ${varList}.`,
      variables: ["patientName", ...vars],
      isActive: true,
    });
  }
  await db.insert(notificationTemplatesTable).values(tpls);
  console.log(`✓ ${tpls.length} notification templates`);

  console.log("\nSeeding complete!\nLogin credentials:");
  for (const u of userRows) console.log(`  ${u.email} / ${u.password}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
