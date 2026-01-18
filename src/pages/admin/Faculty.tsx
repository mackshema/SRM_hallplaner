
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
import { db, Hall, User } from "@/lib/db";
import { toast } from "@/components/ui/use-toast";
import { FileDown, Pencil, Eye } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  // Form Data
  const [formData, setFormData] = useState({
    name: "",
    department: "",
  });

  const [settings, setSettings] = useState({
    institutionName: "",
    institutionSubtitle: "",
    institutionAffiliation: "",
    examCellName: "",
    academicYear: "",
    examName: ""
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const facultyData = await db.getAllFaculty();
        setFaculty(facultyData);

        const res = await fetch("http://localhost:5000/api/halls");
        const hallsData = await res.json();
        setHalls(hallsData);

        const settingsRes = await fetch("http://localhost:5000/api/settings");
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setSettings(settingsData);
        }
      } catch (error) {
        console.error("Error fetching faculty data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
      if (!formData.name || !formData.department) {
        toast({
          title: "Validation Error",
          description: "Please fill all the fields.",
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
      });

      setFaculty([...faculty, newFaculty]);

      toast({
        title: "Faculty Added",
        description: `${newFaculty.name} has been added successfully.\nUsername: ${username}\nPassword: ${password}`,
      });

      setFormData({ name: "", department: "" });
      setIsAddOpen(false);
    } catch (error) {
      console.error("Error adding faculty:", error);
      toast({
        title: "Failed to add faculty",
        description: "An error occurred while adding the faculty member.",
        variant: "destructive",
      });
    }
  };



  const handleEditClick = (member: User) => {
    setSelectedFaculty(member);
    setFormData({
      name: member.name,
      department: member.department || "",
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
        department: formData.department
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

  if (loading) {
    return <div className="p-8 text-center">Loading faculty data...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Faculty Management</h1>
          <p className="text-gray-600">View faculty members and their assigned exam halls</p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={exportFacultyHallAllocation}>
            <FileDown className="mr-2 h-4 w-4" />
            Export Allocation
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setFormData({ name: "", department: "" })}>Add Faculty</Button>
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
                  <Label htmlFor="name">Faculty Name</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="e.g., John Doe"
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
                  <Label htmlFor="edit-name">Faculty Name</Label>
                  <Input
                    id="edit-name"
                    name="name"
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Assigned Halls</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faculty.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No faculty members found.
                </TableCell>
              </TableRow>
            ) : (
              faculty.map(member => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
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
          Faculty members can be assigned to halls when creating or editing an exam hall.
          Each faculty member can view the seating plans for their assigned halls when they log in.
        </p>
      </div>
    </div>
  );
};

export default FacultyManagement;
