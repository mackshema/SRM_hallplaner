
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { X, FileSpreadsheet } from "lucide-react";
import * as XLSX from 'xlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { db, Hall, User, ExamSession } from "@/lib/db";

// Extended type that covers both internal and Anna University plan dates
interface CombinedExamDate {
  _id: string;
  examDate: string;
  examSession: "FN" | "AN";
  examTime: string;
  status: string;
  type: 'internal' | 'anna';
  activeHalls: string[];
}
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";

const HallsManagement = () => {
  const [halls, setHalls] = useState<Hall[]>([]);
  // const [faculty, setFaculty] = useState<User[]>([]); // Cleaned up
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedHall, setSelectedHall] = useState<Hall | null>(null);

  // Confirmation Dialog State - Unused
  // const [confirmOpen, setConfirmOpen] = useState(false);
  // const [pendingFacultyId, setPendingFacultyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    rows: 5,
    columns: 3,
    seatsPerBench: 3,
    facultyRequired: 1, // Default to 1
    floor: "Ground Floor"
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [examSessions, setExamSessions] = useState<CombinedExamDate[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const navigate = useNavigate();

  // 1. Fetch ALL combined exam dates (Internal + Anna University) on Mount
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/halls/all-exam-dates');
        if (res.ok) {
          const data = await res.json();
          setExamSessions(data || []);
          if (data && data.length > 0) {
            setSelectedSessionId(prev => prev || data[0]._id);
          }
        }
      } catch (error) {
        console.error("Error fetching combined exam dates:", error);
      }
    };
    fetchSessions();
  }, []);

  // 2. Fetch Halls whenever selectedSessionId changes
  useEffect(() => {
    const fetchHalls = async () => {
      setLoading(true);
      try {
        // For internal sessions pass the session id; for Anna sessions we just load all halls
        const selectedSession = examSessions.find(s => s._id === selectedSessionId);
        let url = "http://localhost:5000/api/halls";
        if (selectedSessionId && selectedSession?.type === 'internal') {
          url += `?examSessionId=${selectedSessionId}`;
        }

        const res = await fetch(url);
        if (res.ok) {
          const hallsData = await res.json();
          setHalls(hallsData || []);
        } else {
          setHalls([]);
        }
      } catch (error) {
        console.error("Error fetching halls:", error);
        setHalls([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHalls();
  }, [selectedSessionId, examSessions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: (name === 'name' || name === 'floor') ? value : parseInt(value, 10)
    });
  };

  const handleFloorChange = (floor: string) => {
    setFormData({
      ...formData,
      floor
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      rows: 5,
      columns: 3,
      seatsPerBench: 3,
      facultyRequired: 1,
      floor: "Ground Floor",
    });
    setSelectedHall(null);
  };

  const handleEditClick = (hall: Hall) => {
    setSelectedHall(hall);
    setFormData({
      name: hall.name,
      rows: hall.rows,
      columns: hall.columns,
      seatsPerBench: hall.seatsPerBench,
      facultyRequired: hall.facultyRequired || 1, // Load existing requirement or default
      floor: hall.floor || "Ground Floor",
    });
    setOpen(true);
  };

  const handleSaveHall = async () => {
    try {
      if (
        !formData.name ||
        formData.rows < 1 ||
        formData.columns < 1 ||
        formData.seatsPerBench < 1 ||
        formData.facultyRequired < 1 ||
        !formData.floor
      ) {
        toast({
          title: "Validation Error",
          description: "Please fill all the fields with valid values.",
          variant: "destructive",
        });
        return;
      }

      const payload = {
        name: formData.name,
        rows: Number(formData.rows),
        columns: Number(formData.columns),
        seatsPerBench: Number(formData.seatsPerBench),
        floor: formData.floor,
        facultyRequired: Number(formData.facultyRequired), // Send count
      };

      let res;
      if (selectedHall) {
        // UPDATE
        res = await fetch(`http://localhost:5000/api/halls/${selectedHall._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // CREATE
        res = await fetch("http://localhost:5000/api/halls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to save hall" }));
        throw new Error(errorData.message || "Failed to save hall");
      }

      const savedHall = await res.json();

      if (selectedHall) {
        setHalls(prev => prev.map(h => h._id === savedHall._id ? savedHall : h));
        toast({
          title: "Hall Updated",
          description: `${savedHall.name} has been updated successfully.`,
        });
      } else {
        setHalls((prev) => [...prev, savedHall]);
        toast({
          title: "Hall Created",
          description: `${savedHall.name} has been created successfully.`,
        });
      }

      resetForm();
      setOpen(false);
    } catch (error) {
      console.error("Error saving hall:", error);
      const errorMessage = error instanceof Error ? error.message : "An error occurred.";
      toast({
        title: "Failed to save hall",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };


  const handleViewHall = (hallId: string) => {
    const session = examSessions.find(s => s._id === selectedSessionId);
    if (session?.type === 'anna') {
      // For Anna University sessions, navigate to the Anna planner
      navigate('/admin/anna-university');
    } else {
      // For Internal sessions, navigate to the hall seating detail page
      navigate(`/admin/seating-plans/${hallId}?examSessionId=${selectedSessionId}`);
    }
  };


  const handleDeleteHall = async (hallId: string) => {
    try {
      // ✅ CHANGED: Delete via API
      const res = await fetch(`http://localhost:5000/api/halls/${hallId}`, {
        method: "DELETE"
      });

      if (!res.ok) throw new Error("Failed to delete hall");

      setHalls(halls.filter(hall => hall._id !== hallId));

      toast({
        title: "Hall Deleted",
        description: "The hall has been deleted successfully."
      });
    } catch (error) {
      console.error("Error deleting hall:", error);
      toast({
        title: "Failed to delete hall",
        description: "An error occurred while deleting the hall.",
        variant: "destructive",
        });
    }
  };

  const handleExcelUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
          toast({ title: "Error", description: "Excel file is empty", variant: "destructive" });
          return;
        }

        // Validate and format
        const formattedHalls = json.map((row: any) => ({
          name: String(row.Name || row.name || row.HallNumber || row['Hall Number'] || ""),
          rows: Number(row.Rows || row.rows || 0),
          columns: Number(row.Columns || row.columns || 0),
          seatsPerBench: Number(row.SeatsPerBench || row['Seats Per Bench'] || 1),
          floor: String(row.Floor || row.floor || "Ground Floor"),
          facultyRequired: Number(row.FacultyRequired || row['Faculty Required'] || 1)
        })).filter(h => h.name && h.rows > 0 && h.columns > 0);

        if (formattedHalls.length === 0) {
          toast({ title: "Error", description: "No valid hall data found in Excel", variant: "destructive" });
          return;
        }

        setLoading(true);
        const res = await fetch("http://localhost:5000/api/halls/bulk-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ halls: formattedHalls }),
        });

        if (!res.ok) throw new Error("Failed to upload halls");

        const result = await res.json();
        
        // Refresh halls list
        const hallsRes = await fetch("http://localhost:5000/api/halls");
        if (hallsRes.ok) {
          const hallsData = await hallsRes.json();
          setHalls(hallsData || []);
        }

        toast({
          title: "Upload Successful",
          description: `Created ${result.created} halls. ${result.errors.length} errors.`,
          variant: result.errors.length > 0 ? "default" : "default"
        });

      } catch (error) {
        console.error("Excel upload error:", error);
        toast({ title: "Upload Failed", description: "An error occurred while processing the Excel file.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-600">Loading halls data...</p>
        </div>
      </div>
    );
  }



  /* -------------------------------------------
     SESSION & SELECTION LOGIC
  @ ------------------------------------------- */

  // Helper to check if hall is active in current session
  const isHallActiveInSession = (hallId: string) => {
    if (!selectedSessionId) {
      const hall = halls.find(h => h._id === hallId);
      return hall ? hall.isSelected !== false : true;
    }

    const session = examSessions.find(s => s._id === selectedSessionId);
    if (!session) return false;

    // Anna University sessions don't have per-session hall selection — treat all as active
    if (session.type === 'anna') return true;

    // If activeHalls is undefined (legacy sessions), assume ALL are active unless migrated
    if (!session.activeHalls) return true;

    return session.activeHalls.includes(hallId);
  };

  const toggleSelection = async (hall: Hall) => {
    if (!selectedSessionId) {
      toast({ title: "Select a Session", description: "Please select an exam session to manage active halls for that date.", variant: "destructive" });
      return;
    }

    const session = examSessions.find(s => s._id === selectedSessionId);
    if (!session) return;

    // Anna University plans don't support per-session hall toggling here
    if (session.type === 'anna') {
      toast({ title: "Anna University Plan", description: "Hall selection for Anna University plans is managed in the Anna University Planner.", variant: "destructive" });
      return;
    }

    const currentActive: string[] = session.activeHalls || halls.map(h => h._id); // Default to all if missing
    const isActive = currentActive.includes(hall._id);

    let newActive;
    if (isActive) {
      newActive = currentActive.filter(id => id !== hall._id);
    } else {
      newActive = [...currentActive, hall._id];
    }

    // Optimistic Update
    const updatedSession = { ...session, activeHalls: newActive };
    setExamSessions(prev => prev.map(s => s._id === session._id ? updatedSession : s));

    try {
      const res = await fetch(`http://localhost:5000/api/exam-sessions/${session._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeHalls: newActive })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to update session halls" }));
        throw new Error(errorData.message || "Failed to update session halls");
      }
    } catch (error) {
      console.error("Error updating session halls:", error);
      const errorMessage = error instanceof Error ? error.message : "An error occurred.";
      toast({ title: "Update Failed", description: errorMessage, variant: "destructive" });
      // Revert
      setExamSessions(prev => prev.map(s => s._id === session._id ? session : s));
    }
  };

  const toggleAll = async () => {
    if (!selectedSessionId) {
      toast({ title: "Select a Session", description: "Please select an exam session first.", variant: "destructive" });
      return;
    }

    const session = examSessions.find(s => s._id === selectedSessionId);
    if (!session) return;

    // Anna University plans don't support per-session hall toggling here
    if (session.type === 'anna') {
      toast({ title: "Anna University Plan", description: "Hall selection for Anna University plans is managed in the Anna University Planner.", variant: "destructive" });
      return;
    }

    const currentActive: string[] = session.activeHalls || [];
    // Determine target state based on first filtered hall
    // If all filtered halls are active, we deactivate them. Else activate.
    const allFilteredAreActive = filteredHalls.every(h => currentActive.includes(h._id));
    const targetState = !allFilteredAreActive;

    let newActive = [...currentActive];

    if (targetState) {
      // Add all filtered halls that aren't already in list
      filteredHalls.forEach(h => {
        if (!newActive.includes(h._id)) newActive.push(h._id);
      });
    } else {
      // Remove all filtered halls from list
      const filteredIds = filteredHalls.map(h => h._id);
      newActive = newActive.filter(id => !filteredIds.includes(id));
    }

    // Optimistic
    const updatedSession = { ...session, activeHalls: newActive };
    setExamSessions(prev => prev.map(s => s._id === session._id ? updatedSession : s));

    try {
      const res = await fetch(`http://localhost:5000/api/exam-sessions/${session._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeHalls: newActive })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to update session halls" }));
        throw new Error(errorData.message || "Failed to update session halls");
      }
    } catch (error) {
      console.error("Error updating session halls:", error);
      const errorMessage = error instanceof Error ? error.message : "An error occurred.";
      toast({ title: "Update Failed", description: errorMessage, variant: "destructive" });
      setExamSessions(prev => prev.map(s => s._id === session._id ? session : s));
    }
  };

  const filteredHalls = halls
    .filter(hall =>
      hall.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (hall.floor && hall.floor.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const allSelected = filteredHalls.length > 0 && filteredHalls.every(h => isHallActiveInSession(h._id));

  const handleSessionChange = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  const selectedSession = examSessions.find(s => s._id === selectedSessionId);

  // Helper to format the session label shown in the header
  const getSessionLabel = (session: CombinedExamDate | undefined) => {
    if (!session) return "";
    const typeLabel = session.type === 'anna' ? '🎓 Anna University' : '📋 Internal';
    const statusLabel = session.status === 'FINAL' ? 'Locked Plan' : 'Draft Mode';
    return `${typeLabel} — ${session.examDate} (${session.examSession}) • ${statusLabel}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Exam Halls Management</h1>
          <p className="text-gray-600">Manage your exam halls here</p>
        </div>

        <div className="flex gap-4 items-center">
          {/* SESSION SELECTOR */}
          <div className="flex flex-col items-end">
            <select
              className="border p-2 rounded-md bg-white text-sm min-w-[280px] max-w-xs"
              value={selectedSessionId}
              onChange={(e) => handleSessionChange(e.target.value)}
            >
              <option value="" disabled>Select Exam Date / Session</option>

              {/* Group: Internal Exams */}
              {examSessions.filter(s => s.type === 'internal').length > 0 && (
                <optgroup label="📋 Internal Examinations">
                  {examSessions.filter(s => s.type === 'internal').map(s => (
                    <option key={s._id} value={s._id}>
                      {s.examDate} ({s.examSession}) — {s.status}
                    </option>
                  ))}
                </optgroup>
              )}

              {/* Group: Anna University */}
              {examSessions.filter(s => s.type === 'anna').length > 0 && (
                <optgroup label="🎓 Anna University">
                  {examSessions.filter(s => s.type === 'anna').map(s => (
                    <option key={s._id} value={s._id}>
                      {s.examDate} ({s.examSession}) — {s.status}
                    </option>
                  ))}
                </optgroup>
              )}

              {examSessions.length === 0 && (
                <option value="" disabled>No exam plans available yet</option>
              )}
            </select>

            {selectedSession && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold
                  ${selectedSession.type === 'anna' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {selectedSession.type === 'anna' ? '🎓 Anna University' : '📋 Internal'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full
                  ${selectedSession.status === 'FINAL' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {selectedSession.status === 'FINAL' ? 'Locked Plan' : 'Draft Mode'}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex gap-2" asChild>
              <label className="cursor-pointer">
                <FileSpreadsheet className="h-4 w-4" />
                Excel Upload
                <input
                  type="file"
                  className="hidden"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleExcelUpload(file);
                    e.target.value = ''; // Reset
                  }}
                />
              </label>
            </Button>
            <Dialog open={open} onOpenChange={(val) => {
              setOpen(val);
              if (!val) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button>Create New Hall</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{selectedHall ? "Edit Exam Hall" : "Create New Exam Hall"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Hall Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Enter hall name (e.g. 101, 110DH)"
                      value={formData.name}
                      onChange={handleInputChange}
                    />
                    {formData.name.toUpperCase().includes("DH") && (
                      <p className="text-xs text-amber-600 font-medium italic">
                        Note: Drawing Halls (DH) are limited to 1 student per bench.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="rows">Rows</Label>
                      <Input
                        id="rows"
                        name="rows"
                        type="number"
                        min="1"
                        value={formData.rows}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="columns">Columns</Label>
                      <Input
                        id="columns"
                        name="columns"
                        type="number"
                        min="1"
                        value={formData.columns}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="seatsPerBench">Seats Per Bench</Label>
                      <Input
                        id="seatsPerBench"
                        name="seatsPerBench"
                        type="number"
                        min="1"
                        disabled={formData.name.toUpperCase().includes("DH")}
                        value={formData.name.toUpperCase().includes("DH") ? 1 : formData.seatsPerBench}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="facultyRequired">Faculty Required</Label>
                      <Input
                        id="facultyRequired"
                        name="facultyRequired"
                        type="number"
                        min="1"
                        value={formData.facultyRequired}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="floor">Floor</Label>
                    <Select
                      onValueChange={handleFloorChange}
                      value={formData.floor}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select floor" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="Ground Floor">Ground Floor</SelectItem>
                        <SelectItem value="First Floor">First Floor</SelectItem>
                        <SelectItem value="Second Floor">Second Floor</SelectItem>
                        <SelectItem value="Third Floor">Third Floor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveHall}>{selectedHall ? "Update Hall" : "Create Hall"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-md border w-full md:w-1/3">
        <Search className="text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search halls..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-none focus-visible:ring-0 h-8"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Configuration</TableHead>
              <TableHead>Faculty Requirements</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredHalls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  {searchQuery ? "No halls match your search." : "No exam halls created yet. Create your first hall to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredHalls.map(hall => {
                // Calculate if fulfilled? For now just show requirement.
                const assignedCount = hall.facultyAssigned ? hall.facultyAssigned.length : 0;
                const required = hall.facultyRequired || 1;
                const isFulfilled = assignedCount >= required;

                return (
                  <TableRow
                    key={hall._id}
                    className={`transition-opacity duration-200 ${!isHallActiveInSession(hall._id) ? "opacity-50 grayscale bg-gray-50" : ""}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isHallActiveInSession(hall._id)}
                        onCheckedChange={() => toggleSelection(hall)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{hall.name}</TableCell>
                    <TableCell>
                      {hall.rows} rows × {hall.columns} columns, {hall.seatsPerBench} seats
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold">Required: {required}</span>
                        <span className={`text-xs ${isFulfilled ? "text-green-600" : "text-amber-600"}`}>
                          Currently Assigned: {assignedCount}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewHall(hall._id)}
                      >
                        Configure
                      </Button>
                      {hall.name.toUpperCase().includes("DH") && !hall.name.toUpperCase().match(/DH[AB]$/) && hall.rows > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          onClick={async () => {
                            if (!confirm(`Divide Drawing Hall ${hall.name} into A and B? Current configuration will be split.`)) return;
                            
                            const halfRows = Math.floor(hall.rows / 2);
                            const remRows = hall.rows - halfRows;

                            const hallsToCreate = [
                              {
                                name: `${hall.name}A`,
                                rows: halfRows || 1,
                                columns: hall.columns,
                                seatsPerBench: 1,
                                floor: hall.floor,
                                facultyRequired: 1
                              },
                              {
                                name: `${hall.name}B`,
                                rows: remRows,
                                columns: hall.columns,
                                seatsPerBench: 1,
                                floor: hall.floor,
                                facultyRequired: 1
                              }
                            ];

                            try {
                              setLoading(true);
                              // Create AB
                              await fetch("http://localhost:5000/api/halls/bulk-create", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ halls: hallsToCreate }),
                              });
                              // Delete original
                              await fetch(`http://localhost:5000/api/halls/${hall._id}`, { method: "DELETE" });
                              
                              // Refresh
                              const res = await fetch("http://localhost:5000/api/halls");
                              if (res.ok) setHalls(await res.json());
                              
                              toast({ title: "Hall Divided", description: `${hall.name} split into A and B.` });
                            } catch (err) {
                              toast({ title: "Error", description: "Failed to divide hall.", variant: "destructive" });
                            } finally {
                              setLoading(false);
                            }
                          }}
                        >
                          Divide
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEditClick(hall)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteHall(hall._id)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div >
  );
};

export default HallsManagement;
