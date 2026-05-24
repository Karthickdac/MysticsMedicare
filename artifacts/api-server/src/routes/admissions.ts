import { Router, type IRouter } from "express";
import {
  db,
  admissionsTable,
  bedsTable,
  bedTransfersTable,
  encountersTable,
  marEntriesTable,
  nursingNotesTable,
  patientsTable,
  prescriptionsTable,
  staffTable,
  wardRoundsTable,
} from "@workspace/db";
import { and, asc, count, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import {
  CreateAdmissionBody,
  TransferAdmissionBody,
  DischargeAdmissionBody,
  CreateWardRoundBody,
  CreateNursingNoteBody,
  RecordMarDoseBody,
  UpdateBedStatusBody,
} from "@workspace/api-zod";
import { requireRole } from "../lib/auth";
import { sendNotification } from "../lib/notifications";
import { isoDate, requiredIso } from "../lib/format";

const router: IRouter = Router();

type AdmissionRow = typeof admissionsTable.$inferSelect;
type PatientRow = typeof patientsTable.$inferSelect;
type StaffRow = typeof staffTable.$inferSelect;
type BedRow = typeof bedsTable.$inferSelect;

function shapeAdmission(a: AdmissionRow, p?: PatientRow | null, s?: StaffRow | null, b?: BedRow | null) {
  return {
    id: a.id,
    patientId: a.patientId,
    patientName: p?.name ?? null,
    encounterId: a.encounterId,
    doctorId: a.doctorId,
    doctorName: s?.name ?? null,
    bedId: a.bedId,
    bedCode: b?.code ?? null,
    ward: a.ward,
    reason: a.reason,
    status: a.status,
    advanceAmount: a.advanceAmount,
    summary: a.summary,
    admittedAt: requiredIso(a.admittedAt),
    dischargedAt: isoDate(a.dischargedAt),
    createdAt: requiredIso(a.createdAt),
  };
}

// ------------------------------- ADMISSIONS --------------------------------

router.get("/admissions", async (req, res) => {
  const conds = [] as ReturnType<typeof eq>[];
  if (req.query.status) conds.push(eq(admissionsTable.status, String(req.query.status)));
  if (req.query.patientId) conds.push(eq(admissionsTable.patientId, Number(req.query.patientId)));
  if (req.query.ward) conds.push(eq(admissionsTable.ward, String(req.query.ward)));
  const rows = await db
    .select({ a: admissionsTable, p: patientsTable, s: staffTable, b: bedsTable })
    .from(admissionsTable)
    .leftJoin(patientsTable, eq(admissionsTable.patientId, patientsTable.id))
    .leftJoin(staffTable, eq(admissionsTable.doctorId, staffTable.id))
    .leftJoin(bedsTable, eq(admissionsTable.bedId, bedsTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(admissionsTable.admittedAt))
    .limit(500);
  res.json(rows.map((r) => shapeAdmission(r.a, r.p, r.s, r.b)));
});

router.get("/admissions/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [r] = await db
    .select({ a: admissionsTable, p: patientsTable, s: staffTable, b: bedsTable })
    .from(admissionsTable)
    .leftJoin(patientsTable, eq(admissionsTable.patientId, patientsTable.id))
    .leftJoin(staffTable, eq(admissionsTable.doctorId, staffTable.id))
    .leftJoin(bedsTable, eq(admissionsTable.bedId, bedsTable.id))
    .where(eq(admissionsTable.id, id))
    .limit(1);
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json(shapeAdmission(r.a, r.p, r.s, r.b));
});

// Admit a patient — atomic: claim bed, create encounter, create admission.
router.post(
  "/admissions",
  requireRole("admin", "doctor", "receptionist"),
  async (req, res) => {
    const parsed = CreateAdmissionBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const body = parsed.data;

    try {
      const result = await db.transaction(async (tx) => {
        // Serialize on the bed row to prevent two admit clicks racing.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${body.bedId})`);
        const [bed] = await tx.select().from(bedsTable).where(eq(bedsTable.id, body.bedId)).limit(1);
        if (!bed) throw new Error("BED_NOT_FOUND");
        if (bed.status !== "available") throw new Error("BED_UNAVAILABLE");

        // Gender policy enforcement.
        if (bed.genderPolicy && bed.genderPolicy !== "any") {
          const [pt] = await tx.select().from(patientsTable).where(eq(patientsTable.id, body.patientId)).limit(1);
          if (pt && pt.gender && pt.gender.toLowerCase() !== bed.genderPolicy.toLowerCase()) {
            throw new Error("BED_GENDER_MISMATCH");
          }
        }

        const [enc] = await tx
          .insert(encountersTable)
          .values({
            patientId: body.patientId,
            type: "ipd",
            doctorId: body.doctorId,
            chiefComplaint: body.reason,
            bedId: bed.id,
            status: "active",
          })
          .returning();

        const [adm] = await tx
          .insert(admissionsTable)
          .values({
            patientId: body.patientId,
            encounterId: enc.id,
            doctorId: body.doctorId,
            bedId: bed.id,
            ward: bed.ward,
            reason: body.reason,
            advanceAmount: body.advanceAmount ? String(body.advanceAmount) : "0",
            status: "active",
          })
          .returning();

        await tx
          .update(bedsTable)
          .set({ patientId: body.patientId, status: "occupied", admittedAt: new Date() })
          .where(eq(bedsTable.id, bed.id));

        return { adm, bed };
      });

      const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, result.adm.patientId));
      const [s] = await db.select().from(staffTable).where(eq(staffTable.id, result.adm.doctorId));
      await sendNotification({
        eventKey: "ipd_admission",
        channel: "both",
        patientId: result.adm.patientId,
        variables: { bedCode: result.bed.code, ward: result.bed.ward, patientName: p?.name ?? "" },
      }).catch(() => undefined);

      res.status(201).json(shapeAdmission(result.adm, p, s, result.bed));
    } catch (err) {
      const code = (err as Error).message;
      if (code === "BED_NOT_FOUND") return res.status(404).json({ error: "Bed not found" });
      if (code === "BED_UNAVAILABLE") return res.status(409).json({ error: "Bed is not available" });
      if (code === "BED_GENDER_MISMATCH")
        return res.status(409).json({ error: "Bed gender policy does not match patient" });
      throw err;
    }
  },
);

// Transfer admission to another bed — atomic swap with lock on both beds.
router.post(
  "/admissions/:id/transfer",
  requireRole("admin", "doctor", "nurse"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = TransferAdmissionBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const body = parsed.data;

    try {
      const result = await db.transaction(async (tx) => {
        // Lock admission first (same protocol as discharge), then beds in
        // deterministic order. Discharge takes (admission, bed) — transfer
        // takes (admission, fromBed, toBed) — so a concurrent discharge +
        // transfer serialize on the shared admission lock.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);
        const [adm] = await tx.select().from(admissionsTable).where(eq(admissionsTable.id, id)).limit(1);
        if (!adm) throw new Error("ADMISSION_NOT_FOUND");
        if (adm.status !== "active") throw new Error("ADMISSION_NOT_ACTIVE");
        if (adm.bedId === body.toBedId) throw new Error("SAME_BED");

        // Lock both beds in deterministic order to avoid deadlocks.
        const ids = [adm.bedId ?? 0, body.toBedId].sort((a, b) => a - b);
        for (const bid of ids) {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(${bid})`);
        }

        const [toBed] = await tx.select().from(bedsTable).where(eq(bedsTable.id, body.toBedId)).limit(1);
        if (!toBed) throw new Error("BED_NOT_FOUND");
        if (toBed.status !== "available") throw new Error("BED_UNAVAILABLE");

        if (toBed.genderPolicy && toBed.genderPolicy !== "any") {
          const [pt] = await tx.select().from(patientsTable).where(eq(patientsTable.id, adm.patientId)).limit(1);
          if (pt && pt.gender && pt.gender.toLowerCase() !== toBed.genderPolicy.toLowerCase()) {
            throw new Error("BED_GENDER_MISMATCH");
          }
        }

        const fromBedId = adm.bedId;
        if (fromBedId) {
          await tx
            .update(bedsTable)
            .set({ patientId: null, status: "cleaning", admittedAt: null })
            .where(eq(bedsTable.id, fromBedId));
        }
        await tx
          .update(bedsTable)
          .set({ patientId: adm.patientId, status: "occupied", admittedAt: new Date() })
          .where(eq(bedsTable.id, body.toBedId));

        const [updated] = await tx
          .update(admissionsTable)
          .set({ bedId: body.toBedId, ward: toBed.ward })
          .where(eq(admissionsTable.id, id))
          .returning();

        await tx.insert(bedTransfersTable).values({
          admissionId: id,
          fromBedId,
          toBedId: body.toBedId,
          reason: body.reason,
          transferredBy: req.user?.name,
        });

        // Keep linked encounter pointing at current bed.
        if (adm.encounterId) {
          await tx.update(encountersTable).set({ bedId: body.toBedId }).where(eq(encountersTable.id, adm.encounterId));
        }

        return { adm: updated, toBed };
      });

      const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, result.adm.patientId));
      const [s] = await db.select().from(staffTable).where(eq(staffTable.id, result.adm.doctorId));
      res.json(shapeAdmission(result.adm, p, s, result.toBed));
    } catch (err) {
      const code = (err as Error).message;
      if (code === "ADMISSION_NOT_FOUND") return res.status(404).json({ error: "Admission not found" });
      if (code === "ADMISSION_NOT_ACTIVE") return res.status(409).json({ error: "Admission is not active" });
      if (code === "SAME_BED") return res.status(400).json({ error: "Patient is already on that bed" });
      if (code === "BED_NOT_FOUND") return res.status(404).json({ error: "Target bed not found" });
      if (code === "BED_UNAVAILABLE") return res.status(409).json({ error: "Target bed is not available" });
      if (code === "BED_GENDER_MISMATCH")
        return res.status(409).json({ error: "Bed gender policy does not match patient" });
      throw err;
    }
  },
);

// Discharge: close encounter, release bed, persist summary, fire WhatsApp.
router.post(
  "/admissions/:id/discharge",
  requireRole("admin", "doctor"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = DischargeAdmissionBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const body = parsed.data;

    const result = await db.transaction(async (tx) => {
      // Lock the admission row first, then the bed. Use a distinct keyspace
      // for admissions vs beds by offsetting (admission lock key = id, bed
      // key = bedId in the same pg_advisory namespace — admit/transfer use
      // bed ids; collision risk is negligible at our scale and acceptable
      // since both paths just serialize the same physical resources).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);
      const [adm] = await tx.select().from(admissionsTable).where(eq(admissionsTable.id, id)).limit(1);
      if (!adm) throw new Error("ADMISSION_NOT_FOUND");
      if (adm.status === "discharged") throw new Error("ALREADY_DISCHARGED");
      if (adm.bedId) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${adm.bedId})`);
        // Re-read bed inside the lock so a concurrent transfer that moved
        // the patient is reflected before we release.
        const [latest] = await tx.select().from(admissionsTable).where(eq(admissionsTable.id, id)).limit(1);
        if (latest && latest.bedId !== adm.bedId) {
          adm.bedId = latest.bedId;
        }
      }

      const dischargedAt = new Date();
      const [updated] = await tx
        .update(admissionsTable)
        .set({ status: "discharged", summary: body.summary ?? adm.summary, dischargedAt })
        .where(eq(admissionsTable.id, id))
        .returning();

      if (adm.encounterId) {
        await tx
          .update(encountersTable)
          .set({ status: "discharged", endedAt: dischargedAt, notes: body.summary ?? undefined })
          .where(eq(encountersTable.id, adm.encounterId));
      }
      if (adm.bedId) {
        await tx
          .update(bedsTable)
          .set({ patientId: null, status: "cleaning", admittedAt: null })
          .where(eq(bedsTable.id, adm.bedId));
      }
      return updated;
    }).catch((err) => {
      const code = (err as Error).message;
      if (code === "ADMISSION_NOT_FOUND") return { error: "Admission not found", status: 404 } as const;
      if (code === "ALREADY_DISCHARGED") return { error: "Admission already discharged", status: 409 } as const;
      throw err;
    });

    if ("error" in result) return res.status(result.status).json({ error: result.error });

    const [p] = await db.select().from(patientsTable).where(eq(patientsTable.id, result.patientId));
    const [s] = await db.select().from(staffTable).where(eq(staffTable.id, result.doctorId));
    await sendNotification({
      eventKey: "discharge_summary_ready",
      channel: "both",
      patientId: result.patientId,
      variables: {
        patientName: p?.name ?? "",
        summaryUrl: result.encounterId ? `/api/pdf/discharge-summary/${result.encounterId}` : "",
      },
    }).catch(() => undefined);

    res.json({
      ...shapeAdmission(result, p, s, null),
      summaryUrl: result.encounterId ? `/api/pdf/discharge-summary/${result.encounterId}` : null,
    });
  },
);

// ------------------------------ WARD ROUNDS --------------------------------

router.get("/admissions/:id/rounds", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({ r: wardRoundsTable, s: staffTable })
    .from(wardRoundsTable)
    .leftJoin(staffTable, eq(wardRoundsTable.doctorId, staffTable.id))
    .where(eq(wardRoundsTable.admissionId, id))
    .orderBy(desc(wardRoundsTable.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.r.id,
      admissionId: r.r.admissionId,
      doctorId: r.r.doctorId,
      doctorName: r.s?.name ?? null,
      note: r.r.note,
      signedBy: r.r.signedBy,
      createdAt: requiredIso(r.r.createdAt),
    })),
  );
});

router.post(
  "/admissions/:id/rounds",
  requireRole("admin", "doctor"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = CreateWardRoundBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const [row] = await db
      .insert(wardRoundsTable)
      .values({
        admissionId: id,
        doctorId: parsed.data.doctorId ?? req.user?.staffId ?? undefined,
        note: parsed.data.note,
        signedBy: req.user?.name,
      })
      .returning();
    res.status(201).json({
      id: row.id,
      admissionId: row.admissionId,
      doctorId: row.doctorId,
      doctorName: null,
      note: row.note,
      signedBy: row.signedBy,
      createdAt: requiredIso(row.createdAt),
    });
  },
);

// ----------------------------- NURSING NOTES -------------------------------

router.get("/admissions/:id/nursing-notes", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select({ n: nursingNotesTable, s: staffTable })
    .from(nursingNotesTable)
    .leftJoin(staffTable, eq(nursingNotesTable.nurseId, staffTable.id))
    .where(eq(nursingNotesTable.admissionId, id))
    .orderBy(desc(nursingNotesTable.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.n.id,
      admissionId: r.n.admissionId,
      nurseId: r.n.nurseId,
      nurseName: r.s?.name ?? null,
      category: r.n.category,
      note: r.n.note,
      createdAt: requiredIso(r.n.createdAt),
    })),
  );
});

router.post(
  "/admissions/:id/nursing-notes",
  requireRole("admin", "doctor", "nurse"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = CreateNursingNoteBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const [row] = await db
      .insert(nursingNotesTable)
      .values({
        admissionId: id,
        nurseId: parsed.data.nurseId ?? req.user?.staffId ?? undefined,
        category: parsed.data.category ?? "general",
        note: parsed.data.note,
      })
      .returning();
    res.status(201).json({
      id: row.id,
      admissionId: row.admissionId,
      nurseId: row.nurseId,
      nurseName: null,
      category: row.category,
      note: row.note,
      createdAt: requiredIso(row.createdAt),
    });
  },
);

// ----------------------------------- MAR -----------------------------------
// GET expands today's expected doses from active prescriptions on this
// admission and joins recorded mar_entries. The expansion is intentionally
// simple (one row per scheduled dose for the day) — frequency strings are
// matched loosely. Recorded entries always win and are returned verbatim.

const FREQ_HOURS: Record<string, number[]> = {
  od: [9],
  "once a day": [9],
  qd: [9],
  bid: [9, 21],
  "twice a day": [9, 21],
  bd: [9, 21],
  tid: [9, 14, 21],
  "thrice a day": [9, 14, 21],
  tds: [9, 14, 21],
  qid: [6, 12, 18, 22],
  "four times a day": [6, 12, 18, 22],
  qds: [6, 12, 18, 22],
};

function freqToHours(freq?: string | null): number[] {
  if (!freq) return [9];
  const key = freq.toLowerCase().trim();
  return FREQ_HOURS[key] ?? [9];
}

router.get("/admissions/:id/mar", async (req, res) => {
  const id = Number(req.params.id);
  const dateStr = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59`);

  const [adm] = await db.select().from(admissionsTable).where(eq(admissionsTable.id, id)).limit(1);
  if (!adm) return res.status(404).json({ error: "Admission not found" });

  // Active prescriptions for this admission's encounter (or patient if no encounter id link).
  const rx = adm.encounterId
    ? await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.encounterId, adm.encounterId))
    : await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.patientId, adm.patientId));

  const recorded = await db
    .select()
    .from(marEntriesTable)
    .where(
      and(
        eq(marEntriesTable.admissionId, id),
        gte(marEntriesTable.scheduledAt, dayStart),
        lte(marEntriesTable.scheduledAt, dayEnd),
      ),
    );

  type Row = {
    id: number | null;
    prescriptionId: number;
    drug: string;
    dosage: string;
    frequency: string | null;
    scheduledAt: string;
    status: string;
    administeredBy: string | null;
    administeredAt: string | null;
    notes: string | null;
  };
  const out: Row[] = [];
  for (const r of rx) {
    const hours = freqToHours(r.frequency);
    for (const h of hours) {
      const at = new Date(`${dateStr}T${String(h).padStart(2, "0")}:00:00`);
      const match = recorded.find(
        (e) => e.prescriptionId === r.id && Math.abs(new Date(e.scheduledAt).getTime() - at.getTime()) < 30 * 60 * 1000,
      );
      out.push({
        id: match?.id ?? null,
        prescriptionId: r.id,
        drug: r.drug,
        dosage: r.dosage,
        frequency: r.frequency,
        scheduledAt: at.toISOString(),
        status: match?.status ?? "pending",
        administeredBy: match?.administeredBy ?? null,
        administeredAt: match ? isoDate(match.administeredAt) : null,
        notes: match?.notes ?? null,
      });
    }
  }

  // Also include any recorded doses that didn't match a scheduled slot.
  for (const e of recorded) {
    if (out.some((o) => o.id === e.id)) continue;
    const [r] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, e.prescriptionId)).limit(1);
    out.push({
      id: e.id,
      prescriptionId: e.prescriptionId,
      drug: r?.drug ?? "",
      dosage: r?.dosage ?? "",
      frequency: r?.frequency ?? null,
      scheduledAt: requiredIso(e.scheduledAt),
      status: e.status,
      administeredBy: e.administeredBy,
      administeredAt: isoDate(e.administeredAt),
      notes: e.notes,
    });
  }

  out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  res.json(out);
});

router.post(
  "/admissions/:id/mar",
  requireRole("admin", "doctor", "nurse"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = RecordMarDoseBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const body = parsed.data;

    // Authorization/integrity: admission must exist and be active, and the
    // prescription must belong to this admission's encounter or patient.
    const [adm] = await db.select().from(admissionsTable).where(eq(admissionsTable.id, id)).limit(1);
    if (!adm) return res.status(404).json({ error: "Admission not found" });
    if (adm.status !== "active") return res.status(409).json({ error: "Admission is not active" });
    const [rx] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, body.prescriptionId)).limit(1);
    if (!rx) return res.status(404).json({ error: "Prescription not found" });
    const belongs = adm.encounterId
      ? rx.encounterId === adm.encounterId
      : rx.patientId === adm.patientId;
    if (!belongs) return res.status(403).json({ error: "Prescription does not belong to this admission" });

    const scheduledAt = new Date(body.scheduledAt);
    const administeredAt = body.status === "given" ? new Date() : null;
    const administeredBy = body.status === "given" ? req.user?.name ?? null : null;

    // Atomic upsert relies on the `mar_entries_dose_uniq` unique index on
    // (admission_id, prescription_id, scheduled_at) — concurrent identical
    // posts collapse to a single row.
    const [row] = await db
      .insert(marEntriesTable)
      .values({
        admissionId: id,
        prescriptionId: body.prescriptionId,
        scheduledAt,
        status: body.status,
        administeredBy,
        administeredAt,
        notes: body.notes,
      })
      .onConflictDoUpdate({
        target: [marEntriesTable.admissionId, marEntriesTable.prescriptionId, marEntriesTable.scheduledAt],
        set: {
          status: body.status,
          administeredBy: sql`COALESCE(${administeredBy ?? null}, ${marEntriesTable.administeredBy})`,
          administeredAt: sql`COALESCE(${administeredAt ?? null}, ${marEntriesTable.administeredAt})`,
          notes: sql`COALESCE(${body.notes ?? null}, ${marEntriesTable.notes})`,
        },
      })
      .returning();
    res.status(201).json({
      id: row.id,
      prescriptionId: row.prescriptionId,
      scheduledAt: requiredIso(row.scheduledAt),
      status: row.status,
      administeredBy: row.administeredBy,
      administeredAt: isoDate(row.administeredAt),
      notes: row.notes,
    });
  },
);

// ----------------------------- BED STATUS ---------------------------------

router.post(
  "/beds/:id/status",
  requireRole("admin", "nurse"),
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = UpdateBedStatusBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const [existing] = await db.select().from(bedsTable).where(eq(bedsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.status === "occupied" && parsed.data.status !== "occupied") {
      return res.status(409).json({ error: "Cannot change status of an occupied bed; discharge or transfer first" });
    }
    const [row] = await db
      .update(bedsTable)
      .set({ status: parsed.data.status })
      .where(eq(bedsTable.id, id))
      .returning();
    res.json({
      id: row.id,
      code: row.code,
      ward: row.ward,
      status: row.status,
      patientId: row.patientId,
      patientName: null,
      admittedAt: isoDate(row.admittedAt),
      createdAt: requiredIso(row.createdAt),
    });
  },
);

// ----------------------------- IPD CENSUS ---------------------------------

router.get("/ipd/census", async (_req, res) => {
  const [{ total }] = await db.select({ total: count() }).from(bedsTable);
  const [{ occupied }] = await db
    .select({ occupied: count() })
    .from(bedsTable)
    .where(eq(bedsTable.status, "occupied"));
  const [{ available }] = await db
    .select({ available: count() })
    .from(bedsTable)
    .where(eq(bedsTable.status, "available"));
  const [{ cleaning }] = await db
    .select({ cleaning: count() })
    .from(bedsTable)
    .where(eq(bedsTable.status, "cleaning"));
  const [{ activeAdmissions }] = await db
    .select({ activeAdmissions: count() })
    .from(admissionsTable)
    .where(eq(admissionsTable.status, "active"));

  // Average length-of-stay in days for discharged admissions.
  const [{ avg }] = await db
    .select({
      avg: sql<string | null>`AVG(EXTRACT(EPOCH FROM (${admissionsTable.dischargedAt} - ${admissionsTable.admittedAt})) / 86400.0)`,
    })
    .from(admissionsTable)
    .where(and(eq(admissionsTable.status, "discharged"), ne(admissionsTable.dischargedAt, sql`NULL`)));

  // Per-ward breakdown.
  const wardRows = await db
    .select({
      ward: bedsTable.ward,
      total: count(),
    })
    .from(bedsTable)
    .groupBy(bedsTable.ward)
    .orderBy(asc(bedsTable.ward));

  const wardOccupied = await db
    .select({
      ward: bedsTable.ward,
      n: count(),
    })
    .from(bedsTable)
    .where(eq(bedsTable.status, "occupied"))
    .groupBy(bedsTable.ward);
  const occByWard: Record<string, number> = {};
  for (const w of wardOccupied) occByWard[w.ward] = Number(w.n);

  res.json({
    totalBeds: Number(total),
    occupied: Number(occupied),
    available: Number(available),
    cleaning: Number(cleaning),
    occupancyRate: total ? Number(occupied) / Number(total) : 0,
    activeAdmissions: Number(activeAdmissions),
    avgLengthOfStayDays: avg ? Number(avg) : 0,
    wards: wardRows.map((w) => ({
      ward: w.ward,
      total: Number(w.total),
      occupied: occByWard[w.ward] ?? 0,
    })),
  });
});

// Avoid unused-import warnings if `isNull` is later dropped.
void isNull;

export default router;
