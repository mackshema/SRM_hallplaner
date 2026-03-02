
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { db, Department, Hall, SeatAssignment, ExamSession } from "@/lib/db";
import { FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DepartmentsManagement = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    rollNumberStart: "",
    rollNumberEnd: ""
  });
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  // Initial Load: Halls & Sessions
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const resHalls = await fetch("http://localhost:5000/api/halls");
        const hallsData = await resHalls.json();
        setHalls(hallsData);

        const sessionsData = await db.getExamSessions();
        setExamSessions(sessionsData);
        // Default to latest
        if (sessionsData.length > 0) {
          setSelectedSessionId(sessionsData[sessionsData.length - 1]._id);
        }
      } catch (error) {
        console.error("Error fetching initial data:", error);
      }
    };
    fetchInitialData();
  }, []);

  // Fetch Departments when Session Changes
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        // If no session selected, maybe fetch none? Or global?
        // db.getAllDepartments handles optional arg.
        const departmentsData = await db.getAllDepartments(selectedSessionId);
        setDepartments(departmentsData);
      } catch (error) {
        console.error("Error fetching departments:", error);
      }
    };
    fetchDepartments();
  }, [selectedSessionId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleSaveDepartment = async () => {
    if (!formData.name || !formData.rollNumberStart || !formData.rollNumberEnd) {
      toast({
        title: "Validation Error",
        description: "All fields are required",
        variant: "destructive",
      });
      return;
    }

    if (!selectedSessionId) {
      toast({ title: "Session Required", description: "Please select an exam session first.", variant: "destructive" });
      return;
    }

    // Check for range overlap (skip if editing same department)
    const overlappingDept = checkRangeOverlap(formData.rollNumberStart, formData.rollNumberEnd);
    if (overlappingDept) {
      toast({
        title: "Duplicate Range",
        description: `Roll number range overlaps with ${overlappingDept.name}`,
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingDeptId !== null) {
        // 🔁 UPDATE existing department
        await db.updateDepartment(editingDeptId, {
          name: formData.name,
          rollNumberStart: formData.rollNumberStart,
          rollNumberEnd: formData.rollNumberEnd,
        });

        toast({ title: "Department updated successfully" });
      } else {
        // ➕ ADD new department
        await db.createDepartment({
          ...formData,
          examSessionId: selectedSessionId
        });

        toast({ title: "Department added successfully" });
      }

      // 🔄 Reload departments
      const updatedDepartments = await db.getAllDepartments(selectedSessionId);
      setDepartments(updatedDepartments);

      // ♻ Reset dialog state
      setOpen(false);
      setEditingDeptId(null);
      setFormData({
        name: "",
        rollNumberStart: "",
        rollNumberEnd: "",
      });

    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to save department",
        variant: "destructive",
      });
    }
  };

  const checkRangeOverlap = (start: string, end: string): Department | null => {
    const newStart = parseInt(start);
    const newEnd = parseInt(end);

    for (const dept of departments) {
      // Use _id for comparison if available (MongoDB), else id
      const currentId = dept._id || String(dept.id);
      if (editingDeptId !== null && currentId === editingDeptId) continue;

      const existingStart = parseInt(dept.rollNumberStart);
      const existingEnd = parseInt(dept.rollNumberEnd);

      if (
        (newStart >= existingStart && newStart <= existingEnd) ||
        (newEnd >= existingStart && newEnd <= existingEnd) ||
        (newStart <= existingStart && newEnd >= existingEnd)
      ) {
        return dept;
      }
    }
    return null;
  };

  const handleCreateDepartment = async () => {
    // Re-use logic or just redirect to handleSaveDepartment as it handles both?
    // The original code had separate create? 
    // Yes, handleCreateDepartment was separate in Step 235 target.
    // I will restore it as is.
    try {
      if (!formData.name || !formData.rollNumberStart || !formData.rollNumberEnd) {
        toast({ title: "Validation Error", description: "Please fill all fields.", variant: "destructive" });
        return;
      }

      const overlappingDept = checkRangeOverlap(formData.rollNumberStart, formData.rollNumberEnd);
      if (overlappingDept) {
        toast({
          title: "Duplicate Range",
          description: `Overlaps with ${overlappingDept.name}`,
          variant: "destructive",
        });
        return;
      }

      const newDepartment = await db.addDepartment(formData);
      setDepartments([...departments, newDepartment]);

      toast({ title: "Department Created", description: `${newDepartment.name} created.` });
      setFormData({ name: "", rollNumberStart: "", rollNumberEnd: "" });
      setOpen(false);
    } catch (error) {
      console.error("Error creating department:", error);
      toast({ title: "Failed to create", variant: "destructive" });
    }
  };

  const handleDeleteDepartment = async (departmentId: string | number) => {
    try {
      if (!selectedSessionId) {
        toast({ title: "Session Required", variant: "destructive", description: "Please select an exam session." });
        return;
      }
      const success = await db.deleteDepartment(departmentId);
      if (!success) {
        toast({ title: "Failed to delete", description: "Department not found", variant: "destructive" });
        return;
      }

      // Re-fetch departments for current session
      const updatedDepartments = await db.getAllDepartments(selectedSessionId);
      setDepartments(updatedDepartments);

      toast({ title: "Department Deleted" });
    } catch (error) {
      console.error("Error deleting department:", error);
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const exportHallAllocation = async () => {
    try {
      if (!selectedSessionId) {
        toast({ title: "Session Required", variant: "destructive", description: "Please select an exam session to export." });
        return;
      }

      const doc = new jsPDF();
      const currentDateTime = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      doc.setFontSize(18);
      doc.text("Hall Allocation Report", 14, 22);

      const session = examSessions.find(s => s._id === selectedSessionId);
      doc.setFontSize(12);
      doc.text(`Exam Session: ${session?.examDate} (${session?.examSession})`, 14, 30);
      doc.text(`Generated on: ${currentDateTime}`, 14, 38);

      // Get seat assignments for all halls
      const allocationData: any[] = [];

      for (const hall of halls) {
        const res = await fetch(`http://localhost:5000/api/seating/hall/${hall._id}?examSessionId=${selectedSessionId}`);
        const data = await res.json();
        const assignments: SeatAssignment[] = data.assignments || [];

        // Group by department
        const deptMap: { [deptId: number]: { dept: Department | undefined, rollNumbers: string[] } } = {};

        assignments.forEach(assignment => {
          if (!deptMap[assignment.departmentId]) {
            // Find department locally (it should be in 'departments' if active in session)
            // Note: If department was deleted but assignment exists, it might default?
            const dept = departments.find(d => (d._id || String(d.id)) === String(assignment.departmentId));
            deptMap[assignment.departmentId] = {
              dept,
              rollNumbers: []
            };
          }
          deptMap[assignment.departmentId].rollNumbers.push(assignment.studentRollNumber);
        });

        // Add to table data
        Object.values(deptMap).forEach(({ dept, rollNumbers }) => {
          if (dept && rollNumbers.length > 0) {
            rollNumbers.sort();
            allocationData.push([
              dept.name,
              `${rollNumbers[0]} to ${rollNumbers[rollNumbers.length - 1]}`,
              hall.name
            ]);
          }
        });
      }


      if (allocationData.length === 0) {
        toast({
          title: "No Data",
          description: "No hall allocations found. Generate seating plans first.",
          variant: "destructive",
        });
        return;
      }

      autoTable(doc, {
        startY: 40,
        head: [["Department", "Roll Number Range", "Hall Number"]],
        body: allocationData,
        theme: "striped",
        headStyles: { fillColor: [41, 128, 185] }
      });

      doc.save(`hall-allocation-report-${new Date().toISOString().split('T')[0]}.pdf`);

      toast({
        title: "PDF Exported",
        description: "Hall allocation report has been exported successfully."
      });
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast({
        title: "Error",
        description: "Failed to export PDF.",
        variant: "destructive",
      });
    }
  };

  /* -------------------------------------------
     SESSION & SELECTION LOGIC
  @ ------------------------------------------- */

  const isDepartmentActiveInSession = (deptId: string) => {
    if (!selectedSessionId) {
      const dept = departments.find(d => (d._id || String(d.id)) === deptId);
      return dept ? dept.isSelected !== false : true;
    }

    const session = examSessions.find(s => s._id === selectedSessionId);
    if (!session) return false;

    // If activeDepartments is undefined (legacy sessions), assume ALL are active unless migrated
    if (!session.activeDepartments) return true;

    return session.activeDepartments.includes(deptId);
  };


  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allSelected = filteredDepartments.length > 0 && filteredDepartments.every(d => isDepartmentActiveInSession(d._id || String(d.id)));

  const toggleSelection = async (dept: Department) => {
    if (!selectedSessionId) {
      toast({ title: "Select a Session", description: "Please select an exam session to manage active departments for that date.", variant: "destructive" });
      return;
    }

    const session = examSessions.find(s => s._id === selectedSessionId);
    if (!session) return;

    const deptId = dept._id || String(dept.id);
    const currentActive: string[] = session.activeDepartments || departments.map(d => d._id || String(d.id));
    const isActive = currentActive.includes(deptId);

    let newActive;
    if (isActive) {
      newActive = currentActive.filter(id => id !== deptId);
    } else {
      newActive = [...currentActive, deptId];
    }

    // Optimistic Update
    const updatedSession = { ...session, activeDepartments: newActive };
    setExamSessions(prev => prev.map(s => s._id === session._id ? updatedSession : s));

    try {
      const res = await fetch(`http://localhost:5000/api/exam-sessions/${session._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeDepartments: newActive })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to update session departments" }));
        throw new Error(errorData.message || "Failed to update session departments");
      }
    } catch (error) {
      console.error("Error updating session departments:", error);
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

    const currentActive: string[] = session.activeDepartments || [];
    const allFilteredAreActive = filteredDepartments.every(d => currentActive.includes(d._id || String(d.id)));
    const targetState = !allFilteredAreActive;

    let newActive = [...currentActive];

    if (targetState) {
      filteredDepartments.forEach(d => {
        const id = d._id || String(d.id);
        if (!newActive.includes(id)) newActive.push(id);
      });
    } else {
      const filteredIds = filteredDepartments.map(d => d._id || String(d.id));
      newActive = newActive.filter(id => !filteredIds.includes(id));
    }

    // Optimistic
    const updatedSession = { ...session, activeDepartments: newActive };
    setExamSessions(prev => prev.map(s => s._id === session._id ? updatedSession : s));

    try {
      const res = await fetch(`http://localhost:5000/api/exam-sessions/${session._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeDepartments: newActive })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to update session departments" }));
        throw new Error(errorData.message || "Failed to update session departments");
      }
    } catch (error) {
      console.error("Error updating session departments:", error);
      const errorMessage = error instanceof Error ? error.message : "An error occurred.";
      toast({ title: "Update Failed", description: errorMessage, variant: "destructive" });
      setExamSessions(prev => prev.map(s => s._id === session._id ? session : s));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Departments Management</h1>
          <p className="text-gray-600">Add and manage departments and roll number ranges</p>
        </div>

        <div className="flex gap-2 items-center">
          {/* SESSION SELECTOR */}
          <Select
            value={selectedSessionId}
            onValueChange={setSelectedSessionId}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select Session Context" />
            </SelectTrigger>
            <SelectContent>
              {examSessions.map(s => (
                <SelectItem key={s._id} value={s._id}>
                  {s.examDate} ({s.examSession}) - {s.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Add Department</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingDeptId ? "Edit Department" : "Add New Department"}
                </DialogTitle>
                <DialogDescription>
                  Ensure roll number ranges don't overlap with existing departments
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Department Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., Computer Science"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rollNumberStart">Roll Number Range Start</Label>
                  <Input
                    id="rollNumberStart"
                    name="rollNumberStart"
                    placeholder="e.g., 911123149001"
                    value={formData.rollNumberStart}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rollNumberEnd">Roll Number Range End</Label>
                  <Input
                    id="rollNumberEnd"
                    name="rollNumberEnd"
                    placeholder="e.g., 911123149048"
                    value={formData.rollNumberEnd}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveDepartment}>
                  {editingDeptId ? "Update Department" : "Add Department"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>



      <div className="flex items-center space-x-2 bg-white p-2 rounded-md border w-full md:w-1/3">
        <Search className="text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search departments..."
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
              <TableHead>Department Name</TableHead>
              <TableHead>Roll Number Range</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDepartments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                  {searchQuery ? "No departments match your search." : "No departments added yet. Add your first department to get started."}
                </TableCell>
              </TableRow>
            ) : (
              filteredDepartments.map((department) => (
                <TableRow
                  key={department._id || department.id}
                  className={`transition-opacity duration-200 ${!isDepartmentActiveInSession(department._id || String(department.id)) ? "opacity-50 grayscale bg-gray-50" : ""}`}
                >
                  <TableCell>
                    <Checkbox
                      checked={isDepartmentActiveInSession(department._id || String(department.id))}
                      onCheckedChange={() => toggleSelection(department)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {department.name}
                  </TableCell>

                  <TableCell>
                    {department.rollNumberStart} – {department.rollNumberEnd}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {/* EDIT BUTTON */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingDeptId(department._id || String(department.id));
                          setFormData({
                            name: department.name,
                            rollNumberStart: department.rollNumberStart,
                            rollNumberEnd: department.rollNumberEnd,
                          });
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>

                      {/* DELETE BUTTON */}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteDepartment(department._id || String(department.id))}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>

        </Table>
      </div>
    </div>
  );
};

export default DepartmentsManagement;
