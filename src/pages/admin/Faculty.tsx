
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
    examName: ""
  });

  // Session State
  const [examSessions, setExamSessions] = useState<ExamSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

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

        // Fetch Sessions
        const sessionsRes = await fetch("http://localhost:5000/api/exam-sessions");
        if (sessionsRes.ok) {
          const sessionsData = await sessionsRes.json();
          setExamSessions(sessionsData);
          // Default to latest session
          if (sessionsData.length > 0) {
            setSelectedSessionId(prev => prev || sessionsData[sessionsData.length - 1]._id);
          }
        }

      } catch (error) {
        console.error("Error fetching initial data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  // Fetch Halls when session changes
  useEffect(() => {
    const fetchHalls = async () => {
      // If we don't have a session ID yet (and sessions exist), wait. 
      // But if there are no sessions, we might still want to fetch halls (default/raw).
      // For now, let's fetch always, adding param if exists.

      try {
        let url = "http://localhost:5000/api/halls";
        if (selectedSessionId) {
          url += `?examSessionId=${selectedSessionId}`;
        }

        const res = await fetch(url);
        if (res.ok) {
          const hallsData = await res.json();
          setHalls(hallsData);
        }
      } catch (error) {
        console.error("Error fetching halls:", error);
      }
    };

    fetchHalls();
  }, [selectedSessionId]);

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

  const currentSession = examSessions.find(s => s._id === selectedSessionId);

  const isFacultySelectedForSession = (memberId: string) => {
    if (!currentSession || !currentSession.selectedFaculty) return false;
    return currentSession.selectedFaculty.includes(memberId);
  };

  const filteredFaculty = faculty.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.department && f.department.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const allSelected = filteredFaculty.length > 0 && filteredFaculty.every(f => isFacultySelectedForSession(f._id || ""));

  const toggleSelection = async (member: User) => {
    try {
      const fId = String(member._id || member.id);
      if (!fId || fId === "undefined" || !selectedSessionId || !currentSession) return;

      const isSelected = isFacultySelectedForSession(fId);
      let newSelectedFaculty = currentSession.selectedFaculty || [];

      if (isSelected) {
        newSelectedFaculty = newSelectedFaculty.filter(id => id !== fId);
      } else {
        newSelectedFaculty = [...newSelectedFaculty, fId];
      }

      // Optimistic update
      setExamSessions(prev => prev.map(s => s._id === selectedSessionId ? { ...s, selectedFaculty: newSelectedFaculty } : s));

      await db.updateExamSession(selectedSessionId, { selectedFaculty: newSelectedFaculty });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred.";
      toast({ title: "Failed to update selection", description: errorMessage, variant: "destructive" });
    }
  };

  const toggleAll = async () => {
    try {
      if (!selectedSessionId || !currentSession) return;
      const newStatus = !allSelected;

      let newSelectedFaculty = currentSession.selectedFaculty || [];
      const filteredIds = filteredFaculty.map(f => String(f._id || f.id)).filter(Boolean);

      if (newStatus) {
        // Add all filtered that aren't already there
        const toAdd = filteredIds.filter(id => !newSelectedFaculty.includes(id));
        newSelectedFaculty = [...newSelectedFaculty, ...toAdd];
      } else {
        // Remove all filtered from selection
        newSelectedFaculty = newSelectedFaculty.filter(id => !filteredIds.includes(id));
      }

      // Optimistic
      setExamSessions(prev => prev.map(s => s._id === selectedSessionId ? { ...s, selectedFaculty: newSelectedFaculty } : s));

      await db.updateExamSession(selectedSessionId, { selectedFaculty: newSelectedFaculty });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred.";
      toast({ title: "Failed to update all selections", description: errorMessage, variant: "destructive" });
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
          <p className="text-gray-600">Select faculty for automated exam assignment and view their duties</p>
        </div>

        <div className="flex gap-2">
          {/* SESSION SELECTOR */}
          <div className="flex flex-col items-end mr-4">
            <select
              className="border p-2 rounded-md bg-white text-sm min-w-[200px]"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
            >
              <option value="" disabled>Select Session Context</option>
              {examSessions.map(s => (
                <option key={s._id} value={s._id}>
                  {s.examDate} ({s.examSession}) - {s.status}
                </option>
              ))}
            </select>
            {(() => {
              const selected = examSessions.find(s => s._id === selectedSessionId);
              if (selected) {
                return (
                  <span className={`text-xs mt-1 px-2 py-0.5 rounded-full ${selected.status === 'FINAL' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {selected.status === 'FINAL' ? 'Locked Plan' : 'Draft Mode'}
                  </span>
                );
              }
              return null;
            })()}
          </div>

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
                    <Label className="text-muted-foreground mb-2 block">Assigned Halls</Label>
                    <div className="bg-slate-50 p-3 rounded-md border text-sm max-h-40 overflow-y-auto">
                      {getAssignedHalls(selectedFaculty).length > 0 ? (
                        <ul className="list-disc pl-5 space-y-1">
                          {getAssignedHalls(selectedFaculty).map(h => (
                            <li key={h._id}>
                              <span className="font-semibold">{h.name}</span>
                              {h.examDate && <span className="text-xs text-muted-foreground ml-2">({h.examDate} - {h.examSession})</span>}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground italic">No halls assigned</p>
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
                  className={`transition-opacity duration-200 ${!isFacultySelectedForSession(String(member._id || member.id)) ? "opacity-50 grayscale bg-gray-50" : ""}`}
                >
                  <TableCell>
                    <Checkbox
                      checked={isFacultySelectedForSession(String(member._id || member.id))}
                      onCheckedChange={() => toggleSelection(member)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell>{member.designation || "N/A"}</TableCell>
                  <TableCell>{member.department || "N/A"}</TableCell>
                  <TableCell>{member.username}</TableCell>
                  <TableCell>
                    {getAssignedHalls(member).length > 0 ? (
                      <ul className="list-disc pl-5">
                        {getAssignedHalls(member).map(hall => (
                          <li key={hall._id}>{hall.name}</li>
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

      <div className="p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">Note:</h3>
        <p className="text-gray-600">
          Only checked faculty members will be considered for automatic exam duty allocation.
          The automation system enforces a maximum of 4 duties per week and prevents back-to-back session assignments.
        </p>
      </div>
    </div>
  );
};

export default FacultyManagement;
