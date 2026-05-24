import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Patients from "@/pages/patients";
import PatientNew from "@/pages/patient-new";
import PatientProfile from "@/pages/patient-profile";
import Appointments from "@/pages/appointments";
import AppointmentNew from "@/pages/appointment-new";
import OpdQueue from "@/pages/opd-queue";
import Ipd from "@/pages/ipd";
import IpdAdmit from "@/pages/ipd-admit";
import IpdAdmission from "@/pages/ipd-admission";
import Beds from "@/pages/beds";
import Lab from "@/pages/lab";
import Radiology from "@/pages/radiology";
import Pharmacy from "@/pages/pharmacy";
import Prescriptions from "@/pages/prescriptions";
import Drugs from "@/pages/drugs";
import Billing from "@/pages/billing";
import BillingNew from "@/pages/billing-new";
import BillDetail from "@/pages/bill-detail";
import CashierSessions from "@/pages/cashier-sessions";
import BillingReports from "@/pages/billing-reports";
import Inventory from "@/pages/inventory";
import Ot from "@/pages/ot";
import Vaccinations from "@/pages/vaccinations";
import Consent from "@/pages/consent";
import Checkups from "@/pages/checkups";
import Staff from "@/pages/staff";
import Roster from "@/pages/roster";
import VideosLibrary from "@/pages/videos-library";
import NotificationTemplates from "@/pages/notification-templates";
import NotificationLog from "@/pages/notification-log";
import Audit from "@/pages/audit";
import EncounterDetail from "@/pages/encounter-detail";
import Settings from "@/pages/settings";

import { Shell } from "@/components/layout/shell";
import { RequireAuth } from "@/components/require-auth";
import PortalLogin from "@/pages/portal-login";
import { PortalAppointments, PortalBills } from "@/pages/portal-home";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/portal/login" component={PortalLogin} />
      <Route path="/portal" component={PortalAppointments} />
      <Route path="/portal/appointments" component={PortalAppointments} />
      <Route path="/portal/bills" component={PortalBills} />
      <Route>
        <RequireAuth>
        <Shell>
          <Switch>
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/patients/new" component={PatientNew} />
            <Route path="/patients/:id" component={PatientProfile} />
            <Route path="/patients" component={Patients} />
            <Route path="/appointments/new" component={AppointmentNew} />
            <Route path="/appointments" component={Appointments} />
            <Route path="/opd" component={OpdQueue} />
            <Route path="/ipd/admit" component={IpdAdmit} />
            <Route path="/ipd/admissions/:id" component={IpdAdmission} />
            <Route path="/ipd" component={Ipd} />
            <Route path="/beds" component={Beds} />
            <Route path="/lab" component={Lab} />
            <Route path="/radiology" component={Radiology} />
            <Route path="/pharmacy" component={Pharmacy} />
            <Route path="/prescriptions" component={Prescriptions} />
            <Route path="/drugs" component={Drugs} />
            <Route path="/billing/new" component={BillingNew} />
            <Route path="/billing/reports" component={BillingReports} />
            <Route path="/billing/cashier" component={CashierSessions} />
            <Route path="/billing/:id" component={BillDetail} />
            <Route path="/billing" component={Billing} />
            <Route path="/inventory" component={Inventory} />
            <Route path="/ot" component={Ot} />
            <Route path="/vaccinations" component={Vaccinations} />
            <Route path="/consent" component={Consent} />
            <Route path="/checkups" component={Checkups} />
            <Route path="/staff" component={Staff} />
            <Route path="/roster" component={Roster} />
            <Route path="/videos" component={VideosLibrary} />
            <Route path="/notifications/templates" component={NotificationTemplates} />
            <Route path="/notifications/log" component={NotificationLog} />
            <Route path="/audit" component={Audit} />
            <Route path="/encounters/:id" component={EncounterDetail} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
        </RequireAuth>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="medicare-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
