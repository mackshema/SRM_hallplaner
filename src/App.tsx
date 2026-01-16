
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminOverview from "./pages/admin/Overview";
import HallsManagement from "./pages/admin/Halls";
import DepartmentsManagement from "./pages/admin/Departments";
import SeatingPlans from "./pages/admin/SeatingPlans";
import SeatingPlanDetails from "./pages/admin/SeatingPlanDetails";
import FacultyManagement from "./pages/admin/Faculty";
import Settings from "./pages/admin/Settings";
import FacultyDashboard from "./pages/faculty/Dashboard";
import NotFound from "./pages/NotFound";
import { isAuthenticated, isAdmin, isFaculty } from "./lib/auth";

const queryClient = new QueryClient();

// Protected route component
const ProtectedRoute = ({ children, requiredRole }: { children: JSX.Element, requiredRole?: 'admin' | 'faculty' }) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole === 'admin' && !isAdmin()) {
    return <Navigate to="/faculty" replace />;
  }

  if (requiredRole === 'faculty' && !isFaculty()) {
    return <Navigate to="/admin" replace />;
  }

  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/admin/overview" replace />} />
            <Route path="overview" element={<AdminOverview />} />
            <Route path="halls" element={<HallsManagement />} />
            <Route path="departments" element={<DepartmentsManagement />} />
            <Route path="seating-plans" element={<SeatingPlans />} />
            <Route path="seating-plans/:id" element={<SeatingPlanDetails />} />
            <Route path="faculty" element={<FacultyManagement />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Faculty routes */}
          <Route path="/faculty" element={
            <ProtectedRoute requiredRole="faculty">
              <FacultyDashboard />
            </ProtectedRoute>
          } />

          {/* Default routes */}
          <Route path="/" element={<Navigate to={isAdmin() ? "/admin" : isAuthenticated() ? "/faculty" : "/login"} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
