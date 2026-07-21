
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
import { db, Hall, User, ExamSession } from "@/lib/db";
import { toast } from "@/components/ui/use-toast";
import { FileDown, Pencil, Eye } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";

const FacultyManagement = () => {
  const [faculty, setFaculty] = useState<User[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);

  // Selection State
  const [selectedFaculty, setSelectedFaculty] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Form Data
  const [formData, setFormData] = useState({
    name: "",
    department: "",
    designation: "",
    facultyEmail: "",
    hodEmail: "",
  });

  const [settings, setSettings] = useState({
    institutionName: "",
    institutionSubtitle: "",
    institutionAffiliation: "",
    examCellName: "",
    academicYear: "",
    examName: "",
    leftLogo: "",
    rightLogo: ""
  });

  // Fetch All Finalized Duties for Summary
  const [allFinalizedDuties, setAllFinalizedDuties] = useState<any[]>([]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const facultyData = await db.getAllFaculty();
        setFaculty(facultyData);

        const settingsRes = await fetch("http://localhost:5000/api/settings");
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setSettings(settingsData);
        }

        // Fetch All Finalized Duties across all sessions
        const dutiesRes = await fetch("http://localhost:5000/api/seating/duties/all"); // Fetch all duties
        if (dutiesRes.ok) {
           const dutiesData = await dutiesRes.json();
           setAllFinalizedDuties(dutiesData);
        }

      } catch (error) {
        console.error("Error fetching initial data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Function to get ALL assigned halls for a faculty across all dates
  const getAllAssignedHalls = (member: User) => {
    const mId = String(member._id || member.id);
    return allFinalizedDuties.filter(duty => 
      String(duty.facultyId._id || duty.facultyId) === mId
    );
  };

  // Function to get assigned halls for each faculty member
  const getAssignedHalls = (member: User): Hall[] => {
    return halls.filter(hall => {
      if (!hall.facultyAssigned || hall.facultyAssigned.length === 0) return false;
      // Check both id and _id if available
      return (member.id && hall.facultyAssigned.includes(String(member.id))) ||
        (member._id && hall.facultyAssigned.includes(member._id));
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleAddFaculty = async () => {
    try {
      if (!formData.name || !formData.department || !formData.designation || !formData.facultyEmail || !formData.hodEmail) {
        toast({
          title: "Validation Error",
          description: "Please fill all the required fields including Email and Designation.",
          variant: "destructive",
        });
        return;
      }

      // Generate credentials
      const cleanName = formData.name.toLowerCase().replace(/\s+/g, '');
      const username = `${cleanName}@1234`;
      const password = `${cleanName}@srm1234`;

      const newFaculty = await db.addFaculty({
        name: formData.name,
        username: username,
        password: password,
        role: 'faculty',
        department: formData.department,
        designation: formData.designation,
        facultyEmail: formData.facultyEmail,
        hodEmail: formData.hodEmail,
      });

      setFaculty([...faculty, newFaculty]);

      toast({
        title: "Faculty Added",
        description: `${newFaculty.name} has been added successfully.\nUsername: ${username}\nPassword: ${password}`,
      });

      setFormData({ name: "", department: "", designation: "", facultyEmail: "", hodEmail: "" });
      setIsAddOpen(false);
    } catch (error) {
      console.error("Error adding faculty:", error);
      toast({
        title: "Failed to add faculty",
        description: error instanceof Error ? error.message : "An error occurred while adding the faculty member.",
        variant: "destructive",
      });
    }
  };



  const handleEditClick = (member: User) => {
    setSelectedFaculty(member);
    setFormData({
      name: member.name,
      department: member.department || "",
      designation: member.designation || "",
      facultyEmail: member.facultyEmail || "",
      hodEmail: member.hodEmail || "",
    });
    setIsEditOpen(true);
  };

  const handleUpdateFaculty = async () => {
    if (!selectedFaculty) return;

    try {
      const id = selectedFaculty.id || selectedFaculty._id;
      if (!id) return;

      const updatedUser = await db.updateFaculty(id, {
        name: formData.name,
        department: formData.department,
        designation: formData.designation,
        facultyEmail: formData.facultyEmail,
        hodEmail: formData.hodEmail,
      });

      setFaculty(faculty.map(f => (f.id === id || f._id === id) ? { ...f, ...updatedUser } : f));

      toast({
        title: "Faculty Updated",
        description: "Faculty details updated successfully."
      });
      setIsEditOpen(false);
      setSelectedFaculty(null);
    } catch (error) {
      console.error("Error updating faculty:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update faculty details.",
        variant: "destructive"
      });
    }
  };

  const handleViewClick = (member: User) => {
    setSelectedFaculty(member);
    setIsViewOpen(true);
  };

  const handleDeleteFaculty = async (facultyId: number | string) => {
    try {
      await db.deleteFaculty(facultyId);
      setFaculty(faculty.filter(f => f.id !== facultyId && f._id !== facultyId));

      toast({
        title: "Faculty Deleted",
        description: "The faculty member has been deleted successfully."
      });
    } catch (error) {
      console.error("Error deleting faculty:", error);
      toast({
        title: "Failed to delete faculty",
        description: "An error occurred while deleting the faculty member.",
        variant: "destructive",
      });
    }
  };

  const exportFacultyHallAllocation = async () => {
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const currentDateTime = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const centerX = pageWidth / 2;

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(settings.institutionName || "SRM MADURAI", centerX, 15, { align: "center" });

      doc.setFontSize(14);
      doc.text(settings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY", centerX, 22, { align: "center" });

      if (settings.leftLogo) {
        try {
          const format = settings.leftLogo.substring(settings.leftLogo.indexOf('/') + 1, settings.leftLogo.indexOf(';')).toUpperCase();
          doc.addImage(settings.leftLogo, format, 14, 8, 20, 20);
        } catch (e) { console.error("Logo error", e); }
      }
      if (settings.rightLogo) {
        try {
          const format = settings.rightLogo.substring(settings.rightLogo.indexOf('/') + 1, settings.rightLogo.indexOf(';')).toUpperCase();
          doc.addImage(settings.rightLogo, format, pageWidth - 34, 8, 20, 20);
        } catch (e) { console.error("Logo error", e); }
      }

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(settings.institutionAffiliation || "Approved by AICTE, New Delhi | Affiliated to Anna University, Chennai", centerX, 28, { align: "center" });

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(settings.examCellName || "EXAMINATION CELL", centerX, 38, { align: "center" });

      doc.setFontSize(11);
      doc.text(settings.academicYear || "ACADEMIC YEAR 2025-2026 (ODD SEMESTER)", centerX, 45, { align: "center" });
      doc.text(settings.examName || "INTERNAL ASSESSMENT TEST – II (Except I Year)", centerX, 51, { align: "center" });
      doc.text("FACULTY - HALL ALLOCATION REPORT", centerX, 57, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated on: ${currentDateTime}`, pageWidth - 14, 65, { align: "right" });

      const tableData = faculty.map(member => {
        const assignedHalls = getAssignedHalls(member);
        const hallNames = assignedHalls.length > 0
          ? assignedHalls.map(h => {
            // Find hall in allHalls to get exam metadata
            const fullHall = halls.find((ah: any) => ah._id === h._id || ah.name === h.name);
            const examInfo = fullHall && (fullHall.examDate || fullHall.examSession || fullHall.examTime)
              ? ` (${fullHall.examDate || ""} ${fullHall.examSession || ""} ${fullHall.examTime || ""})`
              : "";
            return h.name + examInfo;
          }).join(", ")
          : "None";
        return [
          member.name,
          member.department || "N/A",
          hallNames
        ];
      });

      autoTable(doc, {
        startY: 70,
        head: [["Faculty Name", "Department", "Assigned Halls"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [41, 128, 185] }
      });

      doc.save(`faculty-hall-allocation-${new Date().toISOString().split('T')[0]}.pdf`);

      toast({
        title: "PDF Exported",
        description: "Faculty-Hall allocation has been exported to PDF successfully."
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

  const isFacultySelected = (member: User) => {
    return member.isSelectedForGeneration;
  };

  const filteredFaculty = faculty.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.department && f.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const allSelected = filteredFaculty.length > 0 && filteredFaculty.every(f => f.isSelectedForGeneration);

  const toggleSelection = async (member: User) => {
    try {
      const fId = member._id || member.id;
      if (!fId) return;

      const newStatus = !member.isSelectedForGeneration;
      
      // Optimistic update
      setFaculty(prev => prev.map(f => (f._id === fId || f.id === fId) ? { ...f, isSelectedForGeneration: newStatus } : f));

      await db.updateFaculty(fId, { isSelectedForGeneration: newStatus });
    } catch (error) {
      toast({ title: "Failed to update selection", variant: "destructive" });
    }
  };

  const toggleAll = async () => {
    try {
      const newStatus = !allSelected;
      
      // Optimistic
      setFaculty(prev => prev.map(f => {
        if (filteredFaculty.some(ff => ff._id === f._id || ff.id === f.id)) {
          return { ...f, isSelectedForGeneration: newStatus };
        }
        return f;
      }));

      // In a real app, I'd suggest a bulk update endpoint, but let's loop for now to match current patterns
      for (const ff of filteredFaculty) {
        const id = ff._id || ff.id;
        if (id) await db.updateFaculty(id, { isSelectedForGeneration: newStatus });
      }

    } catch (error) {
      toast({ title: "Failed to update all selections", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading faculty data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Faculty Management</h1>
          <p className="text-gray-600">Review rules, methodology, and assigned duties for all faculty members</p>
        </div>

        <div className="flex gap-2">

          <Button variant="outline" onClick={exportFacultyHallAllocation}>
            <FileDown className="mr-2 h-4 w-4" />
            Export Allocation
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData({ name: "", department: "", designation: "", facultyEmail: "", hodEmail: "" })}>Add Faculty</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Faculty</DialogTitle>
                <DialogDescription>
                  Login credentials will be auto-generated based on the name
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Faculty Name (Format: Initial. Name)</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., R. Krishna"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    name="department"
                    placeholder="e.g., Computer Science"
                    value={formData.department}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="designation">Designation</Label>
                  <select
                    id="designation"
                    name="designation"
                    className="border p-2 rounded-md bg-white text-sm"
                    value={formData.designation}
                    onChange={(e: any) => handleInputChange(e)}
                  >
                    <option value="" disabled>Select Designation</option>
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Professor">Professor</option>
                    <option value="HOD">HOD</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="facultyEmail">Faculty Email ID</Label>
                  <Input
                    id="facultyEmail"
                    name="facultyEmail"
                    type="email"
                    placeholder="faculty@srm.edu"
                    value={formData.facultyEmail}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="hodEmail">HOD Email ID</Label>
                  <Input
                    id="hodEmail"
                    name="hodEmail"
                    type="email"
                    placeholder="hod@srm.edu"
                    value={formData.hodEmail}
                    onChange={handleInputChange}
                  />
                </div>
                {formData.name && (
                  <div className="p-3 bg-blue-50 rounded-lg text-sm">
                    <p className="font-semibold mb-1">Auto-generated Credentials:</p>
                    <p>Username: {formData.name.toLowerCase().replace(/\s+/g, '')}@1234</p>
                    <p>Password: {formData.name.toLowerCase().replace(/\s+/g, '')}@srm1234</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddFaculty}>Add Faculty</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit Faculty Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Faculty</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Faculty Name (Format: Initial. Name)</Label>
                  <Input
                    id="edit-name"
                    name="name"
                    placeholder="e.g., R. Krishna"
                    value={formData.name}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-department">Department</Label>
                  <Input
                    id="edit-department"
                    name="department"
                    value={formData.department}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-designation">Designation</Label>
                  <select
                    id="edit-designation"
                    name="designation"
                    className="border p-2 rounded-md bg-white text-sm"
                    value={formData.designation}
                    onChange={(e: any) => handleInputChange(e)}
                  >
                    <option value="" disabled>Select Designation</option>
                    <option value="Assistant Professor">Assistant Professor</option>
                    <option value="Associate Professor">Associate Professor</option>
                    <option value="Professor">Professor</option>
                    <option value="HOD">HOD</option>
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-facultyEmail">Faculty Email ID</Label>
                  <Input
                    id="edit-facultyEmail"
                    name="facultyEmail"
                    type="email"
                    value={formData.facultyEmail}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-hodEmail">HOD Email ID</Label>
                  <Input
                    id="edit-hodEmail"
                    name="hodEmail"
                    type="email"
                    value={formData.hodEmail}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                <Button onClick={handleUpdateFaculty}>Update Faculty</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* View Faculty Dialog */}
          <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Faculty Details</DialogTitle>
              </DialogHeader>
              {selectedFaculty && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <p className="font-medium">{selectedFaculty.name}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Department</Label>
                      <p className="font-medium">{selectedFaculty.department || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Designation</Label>
                      <p className="font-medium">{selectedFaculty.designation || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Faculty Email</Label>
                      <p className="font-medium">{selectedFaculty.facultyEmail || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">HOD Email</Label>
                      <p className="font-medium">{selectedFaculty.hodEmail || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Username</Label>
                      <p className="font-medium font-mono bg-slate-100 p-1 rounded">{selectedFaculty.username}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Password</Label>
                      <p className="font-medium font-mono bg-slate-100 p-1 rounded">
                        {selectedFaculty.password || "Hidden"}
                      </p>
                    </div>
                  </div>
                   <div>
                    <Label className="text-muted-foreground mb-2 block">Assigned Halls History</Label>
                    <div className="bg-slate-50 p-3 rounded-md border text-sm max-h-40 overflow-y-auto">
                      {getAllAssignedHalls(selectedFaculty).length > 0 ? (
                        <ul className="list-disc pl-5 space-y-1">
                          {getAllAssignedHalls(selectedFaculty).map((duty, idx) => (
                            <li key={idx}>
                              <span className="font-semibold">{duty.hallId?.name || "Unknown Hall"}</span>
                              <span className="text-xs text-muted-foreground ml-2">({duty.examDate} - {duty.examSession})</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground italic">No duties recorded</p>
                      )}
                    </div>
                  </div>

                </div>
              )}
              <DialogFooter>
                <Button onClick={() => setIsViewOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-md border w-full md:w-1/3">
        <Search className="text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search faculty..."
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
              <TableHead>Designation</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Assigned Halls</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFaculty.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  {searchQuery ? "No faculty found matching your search." : "No faculty members found."}
                </TableCell>
              </TableRow>
            ) : (
               filteredFaculty.map(member => (
                <TableRow
                  key={member.id || member._id}
                  className={`transition-opacity duration-200 ${!member.isSelectedForGeneration ? "opacity-50 grayscale bg-gray-50" : ""}`}
                >
                   <TableCell>
                    <Checkbox
                      checked={!!member.isSelectedForGeneration}
                      onCheckedChange={() => toggleSelection(member)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>{member.designation || "N/A"}</TableCell>
                  <TableCell>{member.department || "N/A"}</TableCell>
                  <TableCell>{member.username}</TableCell>
                   <TableCell>
                    {getAllAssignedHalls(member).length > 0 ? (
                      <ul className="text-xs space-y-1">
                        {getAllAssignedHalls(member).map((duty, idx) => (
                          <li key={idx} className="whitespace-nowrap">
                            <span className="font-semibold">{duty.hallId?.name || "???"}</span>
                            <span className="text-gray-500 ml-1">({duty.examDate} {duty.examSession})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500 italic">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewClick(member)}
                        title="View Details"
                      >
                        <Eye className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(member)}
                        title="Edit Faculty"
                      >
                        <Pencil className="h-4 w-4 text-orange-600" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteFaculty(member.id || member._id || "")}
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

       <div className="p-5 bg-blue-50 rounded-xl border border-blue-100 shadow-sm">
        <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
          <span className="bg-blue-600 text-white p-1 rounded-md text-xs">ℹ️</span>
          Faculty Allocation Methodology & Rules
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm text-blue-800">
          <li className="flex gap-2">
            <strong>1. Internal Exams Only:</strong> Auto-assignment is strictly and only for Internal exams. Anna University exams require manual faculty assignment.
          </li>
          <li className="flex gap-2">
            <strong>2. No Continuous Participation:</strong> A faculty member assigned to a Forenoon (FN) session is excluded from the subsequent Afternoon (AN) session to prevent fatigue.
          </li>
          <li className="flex gap-2">
            <strong>3. Department Diversity:</strong> A maximum of 2 faculty members from the same department can be assigned to a single hall.
          </li>
          <li className="flex gap-2">
            <strong>4. Hard Conflict Check:</strong> The system ensures a faculty member is never assigned to two different halls in the same session.
          </li>
          <li className="flex gap-2">
            <strong>5. Weekly Workload:</strong> Each faculty member is capped at a maximum of 4 exam duties per rolling 7-day period.
          </li>
          <li className="flex gap-2">
            <strong>6. Mandatory Rest:</strong> The system tracks last duty dates to prioritize faculty who haven't served recently.
          </li>
        </ul>
        <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-blue-600 italic">
          * Checking the box next to a faculty name makes them eligible for the automatic selection algorithm for upcoming Internal Exams.
        </div>
      </div>
    </div>
  );
};

export default FacultyManagement;
