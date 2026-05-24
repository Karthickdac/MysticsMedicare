import { useGetPatient, useListVitals, useListEncounters, useListLabOrders, useListPrescriptions, useListRadiologyOrders, useListVaccinations, useListConsentForms, useListVideos, useListBills } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Activity, Beaker, Calendar, FileText, Pill, Plus, Radio, Shield, Video, Receipt } from "lucide-react";
import { getGetPatientQueryKey } from "@workspace/api-client-react";

export default function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const patientId = Number(id);

  const { data: patient, isLoading } = useGetPatient(patientId, {
    query: { enabled: !!patientId, queryKey: getGetPatientQueryKey(patientId) }
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!patient) return <div className="p-6">Patient not found</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <Card className="bg-card">
        <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center text-3xl font-medium shrink-0">
              {patient.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{patient.name}</h1>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1 font-mono text-primary"><Badge variant="outline">{patient.uhid}</Badge></span>
                <span className="flex items-center gap-1">{patient.age} yrs • {patient.gender}</span>
                {patient.bloodGroup && <span className="flex items-center gap-1 text-destructive font-medium">{patient.bloodGroup}</span>}
                <span className="flex items-center gap-1">{patient.phone}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link href={`/encounters/new?patientId=${patient.id}`}>
                <Plus className="w-4 h-4 mr-2" /> New Encounter
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/billing/new?patientId=${patient.id}`}>
                <Receipt className="w-4 h-4 mr-2" /> New Bill
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden bg-transparent border-b rounded-none h-auto p-0">
          <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Overview</TabsTrigger>
          <TabsTrigger value="encounters" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Encounters</TabsTrigger>
          <TabsTrigger value="vitals" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Vitals</TabsTrigger>
          <TabsTrigger value="lab" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Lab</TabsTrigger>
          <TabsTrigger value="prescriptions" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Prescriptions</TabsTrigger>
          <TabsTrigger value="radiology" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Radiology</TabsTrigger>
          <TabsTrigger value="vaccinations" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Vaccinations</TabsTrigger>
          <TabsTrigger value="videos" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none py-3">Videos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Demographics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground block mb-1">Date of Birth</span>{new Date(patient.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  <div><span className="text-muted-foreground block mb-1">Email</span>{patient.email || '-'}</div>
                  <div className="col-span-2"><span className="text-muted-foreground block mb-1">Address</span>{patient.address || '-'}</div>
                  <div className="col-span-2"><span className="text-muted-foreground block mb-1">Emergency Contact</span>{patient.emergencyContact || '-'}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Medical Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm space-y-4">
                  <div>
                    <span className="text-muted-foreground block mb-1">Known Allergies</span>
                    {patient.allergies ? <p className="text-destructive font-medium">{patient.allergies}</p> : <p>-</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><span className="text-muted-foreground block mb-1">Insurance Provider</span>{patient.insuranceProvider || '-'}</div>
                    <div><span className="text-muted-foreground block mb-1">Policy Number</span>{patient.insuranceNumber || '-'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="encounters" className="pt-6">
          <EncountersTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="vitals" className="pt-6">
          <VitalsTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="lab" className="pt-6">
          <LabTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="prescriptions" className="pt-6">
          <PrescriptionsTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="radiology" className="pt-6">
          <RadiologyTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="vaccinations" className="pt-6">
          <VaccinationsTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="videos" className="pt-6">
          <VideosTab patientId={patientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EncountersTab({ patientId }: { patientId: number }) {
  const { data: encounters, isLoading } = useListEncounters({ patientId });
  
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Doctor</TableHead>
            <TableHead>Diagnosis</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {encounters?.map(e => (
            <TableRow key={e.id}>
              <TableCell>{new Date(e.startedAt).toLocaleDateString('en-IN')}</TableCell>
              <TableCell className="capitalize">{e.type}</TableCell>
              <TableCell>Dr. {e.doctorName}</TableCell>
              <TableCell className="max-w-[200px] truncate">{e.diagnosis || '-'}</TableCell>
              <TableCell><Badge variant="outline">{e.status}</Badge></TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/encounters/${e.id}`}>View</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!encounters?.length && <TableRow><TableCell colSpan={6} className="text-center py-8">No encounters</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function VitalsTab({ patientId }: { patientId: number }) {
  const { data: vitals, isLoading } = useListVitals({ patientId });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>BP</TableHead>
            <TableHead>Pulse</TableHead>
            <TableHead>Temp</TableHead>
            <TableHead>SpO2</TableHead>
            <TableHead>Weight/Height</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vitals?.map(v => (
            <TableRow key={v.id}>
              <TableCell>{new Date(v.recordedAt).toLocaleString('en-IN')}</TableCell>
              <TableCell>{v.bp || '-'}</TableCell>
              <TableCell>{v.pulse ? `${v.pulse} bpm` : '-'}</TableCell>
              <TableCell>{v.temperature ? `${v.temperature} °F` : '-'}</TableCell>
              <TableCell>{v.spo2 ? `${v.spo2} %` : '-'}</TableCell>
              <TableCell>{v.weight ? `${v.weight} kg` : '-'} / {v.height ? `${v.height} cm` : '-'}</TableCell>
            </TableRow>
          ))}
          {!vitals?.length && <TableRow><TableCell colSpan={6} className="text-center py-8">No vitals recorded</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function LabTab({ patientId }: { patientId: number }) {
  const { data, isLoading } = useListLabOrders({ patientId });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Test</TableHead>
            <TableHead>Result</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map(o => (
            <TableRow key={o.id}>
              <TableCell>{new Date(o.createdAt).toLocaleDateString('en-IN')}</TableCell>
              <TableCell className="font-medium">{o.testName}</TableCell>
              <TableCell>{o.result || '-'}</TableCell>
              <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
            </TableRow>
          ))}
          {!data?.length && <TableRow><TableCell colSpan={4} className="text-center py-8">No lab orders</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function PrescriptionsTab({ patientId }: { patientId: number }) {
  const { data, isLoading } = useListPrescriptions({ patientId });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Drug</TableHead>
            <TableHead>Dosage</TableHead>
            <TableHead>Instructions</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map(p => (
            <TableRow key={p.id}>
              <TableCell>{new Date(p.createdAt).toLocaleDateString('en-IN')}</TableCell>
              <TableCell className="font-medium">{p.drug}</TableCell>
              <TableCell>{p.dosage} ({p.duration})</TableCell>
              <TableCell>{p.instructions || '-'}</TableCell>
              <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
            </TableRow>
          ))}
          {!data?.length && <TableRow><TableCell colSpan={5} className="text-center py-8">No prescriptions</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function RadiologyTab({ patientId }: { patientId: number }) {
  const { data, isLoading } = useListRadiologyOrders({ patientId });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Modality</TableHead>
            <TableHead>Body Part</TableHead>
            <TableHead>Impression</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map(o => (
            <TableRow key={o.id}>
              <TableCell>{new Date(o.createdAt).toLocaleDateString('en-IN')}</TableCell>
              <TableCell>{o.modality}</TableCell>
              <TableCell>{o.bodyPart}</TableCell>
              <TableCell className="max-w-[200px] truncate">{o.impression || '-'}</TableCell>
              <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
            </TableRow>
          ))}
          {!data?.length && <TableRow><TableCell colSpan={5} className="text-center py-8">No radiology orders</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function VaccinationsTab({ patientId }: { patientId: number }) {
  const { data, isLoading } = useListVaccinations({ patientId });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Vaccine</TableHead>
            <TableHead>Dose #</TableHead>
            <TableHead>Next Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.map(v => (
            <TableRow key={v.id}>
              <TableCell>{new Date(v.administeredAt).toLocaleDateString('en-IN')}</TableCell>
              <TableCell className="font-medium">{v.vaccineName}</TableCell>
              <TableCell>{v.doseNumber}</TableCell>
              <TableCell>{v.nextDueDate ? new Date(v.nextDueDate).toLocaleDateString('en-IN') : '-'}</TableCell>
            </TableRow>
          ))}
          {!data?.length && <TableRow><TableCell colSpan={4} className="text-center py-8">No vaccinations</TableCell></TableRow>}
        </TableBody>
      </Table>
    </Card>
  );
}

function VideosTab({ patientId }: { patientId: number }) {
  const { data, isLoading } = useListVideos({ patientId });
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {data?.map(v => (
        <Card key={v.id} className="overflow-hidden">
          <div className="aspect-video bg-black flex items-center justify-center relative group cursor-pointer">
            {v.thumbnailUrl ? (
              <img src={v.thumbnailUrl} alt={v.title || 'Video thumbnail'} className="w-full h-full object-cover" />
            ) : (
              <Video className="w-12 h-12 text-muted-foreground/30" />
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-12 h-12 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center">
                <Video className="w-5 h-5" />
              </div>
            </div>
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white font-mono">
              {Math.floor(v.durationSeconds / 60)}:{(v.durationSeconds % 60).toString().padStart(2, '0')}
            </div>
          </div>
          <CardContent className="p-3">
            <h3 className="font-semibold text-sm truncate">{v.title || 'Untitled Recording'}</h3>
            <p className="text-xs text-muted-foreground mt-1 capitalize">{v.encounterType} • {new Date(v.createdAt).toLocaleDateString('en-IN')}</p>
          </CardContent>
        </Card>
      ))}
      {!data?.length && <div className="col-span-full text-center py-8 text-muted-foreground">No videos recorded</div>}
    </div>
  );
}
