import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Printer, X } from "lucide-react";
import { useGetHospitalSettings, type Patient } from "@workspace/api-client-react";

type Props = {
  patient: Patient;
  open: boolean;
  onClose: () => void;
};

export function PatientIdCard({ patient, open, onClose }: Props) {
  const { data: settings } = useGetHospitalSettings();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(patient.uhid, { width: 200, margin: 0 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [open, patient.uhid]);

  function printCard() {
    const html = cardRef.current?.outerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=600,height=400");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>ID Card · ${patient.uhid}</title>
      <meta charset="utf-8" />
      <style>
        @page { size: 86mm 54mm; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .card { width: 86mm; height: 54mm; padding: 4mm; display: flex; gap: 3mm; border: 1px solid #ddd; page-break-after: always; color: #111; background: #fff; }
        .card .left { width: 24mm; display: flex; flex-direction: column; gap: 2mm; }
        .card .photo { width: 24mm; height: 28mm; object-fit: cover; border-radius: 1mm; background: #f1f5f9; }
        .card .qr { width: 18mm; height: 18mm; align-self: center; }
        .card .right { flex: 1; display: flex; flex-direction: column; }
        .card .brand { display: flex; align-items: center; gap: 2mm; border-bottom: 0.4mm solid var(--accent, #0ea5a4); padding-bottom: 1mm; }
        .card .logo { width: 7mm; height: 7mm; object-fit: contain; }
        .card .hname { font-size: 9pt; font-weight: 700; color: var(--accent, #0ea5a4); line-height: 1.1; }
        .card .sub { font-size: 6pt; color: #666; }
        .card .name { font-size: 11pt; font-weight: 700; margin-top: 1mm; line-height: 1.1; }
        .card .uhid { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 8pt; color: var(--accent, #0ea5a4); margin-top: 0.5mm; }
        .card .meta { font-size: 6.5pt; margin-top: 1mm; display: grid; grid-template-columns: auto 1fr; gap: 0.5mm 1.5mm; color: #333; }
        .card .meta b { font-weight: 600; color: #111; }
        .card .footer { margin-top: auto; font-size: 5.5pt; color: #777; display: flex; justify-content: space-between; }
        @media print { .no-print { display: none; } body { background: #fff; } }
      </style></head><body>${html}<script>window.onload=()=>{window.focus();window.print();setTimeout(()=>window.close(),300);}</script></body></html>`);
    w.document.close();
  }

  const accent = settings?.primaryColor || "#0ea5a4";
  const hname = settings?.name || "Mystics MediCare";
  const tagline = [settings?.city, settings?.state].filter(Boolean).join(", ") || settings?.address || "Hospital Management System";
  const dob = patient.dob ? new Date(patient.dob).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Patient ID Card</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center bg-muted/30 p-6 rounded">
          <div ref={cardRef} className="card" style={{ ["--accent" as never]: accent, width: "86mm", height: "54mm", padding: "4mm", display: "flex", gap: "3mm", border: "1px solid #ddd", background: "#fff", color: "#111", fontFamily: "system-ui, sans-serif" } as React.CSSProperties}>
            <div className="left" style={{ width: "24mm", display: "flex", flexDirection: "column", gap: "2mm" }}>
              {patient.avatarUrl ? (
                <img src={patient.avatarUrl} alt={patient.name} className="photo" style={{ width: "24mm", height: "28mm", objectFit: "cover", borderRadius: "1mm", background: "#f1f5f9" }} />
              ) : (
                <div className="photo" style={{ width: "24mm", height: "28mm", background: "#f1f5f9", borderRadius: "1mm", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "7pt", color: "#94a3b8" }}>No photo</div>
              )}
              {qrDataUrl && <img src={qrDataUrl} alt="QR" className="qr" style={{ width: "18mm", height: "18mm", alignSelf: "center" }} />}
            </div>
            <div className="right" style={{ flex: 1, display: "flex", flexDirection: "column", color: "#111" }}>
              <div className="brand" style={{ display: "flex", alignItems: "center", gap: "2mm", borderBottom: `0.4mm solid ${accent}`, paddingBottom: "1mm" }}>
                {settings?.logoUrl && <img src={settings.logoUrl} className="logo" alt="logo" style={{ width: "7mm", height: "7mm", objectFit: "contain" }} />}
                <div>
                  <div className="hname" style={{ fontSize: "9pt", fontWeight: 700, color: accent, lineHeight: 1.1 }}>{hname}</div>
                  <div className="sub" style={{ fontSize: "6pt", color: "#666" }}>{tagline}</div>
                </div>
              </div>
              <div className="name" style={{ fontSize: "11pt", fontWeight: 700, marginTop: "1mm", lineHeight: 1.1 }}>{patient.name}</div>
              <div className="uhid" style={{ fontFamily: "ui-monospace, monospace", fontSize: "8pt", color: accent, marginTop: "0.5mm" }}>UHID · {patient.uhid}</div>
              <div className="meta" style={{ fontSize: "6.5pt", marginTop: "1mm", display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5mm 1.5mm", color: "#333" }}>
                <b>DOB</b><span>{dob} ({patient.age}y)</span>
                <b>Gender</b><span>{patient.gender}</span>
                {patient.bloodGroup && (<><b>Blood</b><span>{patient.bloodGroup}</span></>)}
                <b>Phone</b><span>{patient.phone}</span>
                {patient.emergencyContact && (<><b>Emergency</b><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{patient.emergencyContact}</span></>)}
              </div>
              <div className="footer" style={{ marginTop: "auto", fontSize: "5.5pt", color: "#777", display: "flex", justifyContent: "space-between" }}>
                <span>Issued {new Date(patient.createdAt).toLocaleDateString("en-IN")}</span>
                {settings?.phone && <span>{settings.phone}</span>}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="w-4 h-4 mr-1" />Close</Button>
          <Button onClick={printCard} data-testid="button-print-idcard"><Printer className="w-4 h-4 mr-1" />Print ID card</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
