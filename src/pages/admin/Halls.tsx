
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
import { X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { db, Hall, User } from "@/lib/db";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HallsManagement = () => {
  const [halls, setHalls] = useState<Hall[]>([]);
  const [faculty, setFaculty] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedHall, setSelectedHall] = useState<Hall | null>(null);

  // Confirmation Dialog State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFacultyId, setPendingFacultyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    rows: 5,
    columns: 5,
    seatsPerBench: 3,
    facultyAssigned: [] as string[],
    floor: ""
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Fetch Halls
      try {
        const res = await fetch("http://localhost:5000/api/halls");
        if (res.ok) {
          const hallsData = await res.json();
          setHalls(hallsData || []);
        } else {
          console.error("Failed to fetch halls:", res.statusText);
          setHalls([]);
        }
      } catch (error) {
        console.error("Error fetching halls:", error);
        setHalls([]);
      }

      // Fetch Faculty
      try {
        const facultyData = await db.getAllFaculty();
        console.log("Fetched faculty:", facultyData);
        setFaculty(facultyData || []);
      } catch (error) {
        console.error("Error fetching faculty:", error);
        setFaculty([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'name' ? value : parseInt(value, 10)
    });
  };

  const handleFacultyChange = (facultyId: string) => {
    // Prevent adding same faculty twice
    if (formData.facultyAssigned.includes(facultyId)) {
      toast({
        title: "Faculty Already Assigned",
        description: "This faculty member is already assigned to this hall.",
        variant: "destructive"
      });
      return;
    }

    // Check if hall already has faculty assigned
    if (formData.facultyAssigned.length > 0) {
      setPendingFacultyId(facultyId);
      setConfirmOpen(true);
    } else {
      // First faculty, add directly
      setFormData(prev => ({
        ...prev,
        facultyAssigned: [...prev.facultyAssigned, facultyId]
      }));
    }
  };

  const confirmAddFaculty = () => {
    if (pendingFacultyId) {
      setFormData(prev => ({
        ...prev,
        facultyAssigned: [...prev.facultyAssigned, pendingFacultyId]
      }));
      setPendingFacultyId(null);
      setConfirmOpen(false);
      toast({
        title: "Faculty Added",
        description: "Additional faculty member assigned successfully."
      });
    }
  };

  const removeFaculty = (facultyId: string) => {
    setFormData(prev => ({
      ...prev,
      facultyAssigned: prev.facultyAssigned.filter(id => id !== facultyId)
    }));
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
      columns: 5,
      seatsPerBench: 3,
      facultyAssigned: [],
      floor: "",
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
      facultyAssigned: hall.facultyAssigned || [],
      floor: hall.floor || "",
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
        formData.facultyAssigned.length === 0 ||
        !formData.floor
      ) {
        toast({
          title: "Validation Error",
          description: "Please fill all the fields with valid values.",
          variant: "destructive",
        });
        return;
      }

      // ✅ FIX 1: faculty lookup using id (localStorage uses id: number)
      // Check validation for ALL assigned faculty
      for (const assignedId of formData.facultyAssigned) {
        const selectedFacultyId = assignedId;
        const selectedFaculty = faculty.find(
          (f) => (f._id || String(f.id)) === selectedFacultyId
        );

        // ✅ VALIDATION: Check if same faculty is already assigned to another hall
        // Exclude current hall from check if editing
        const facultyAlreadyAssigned = halls.find(h =>
          h._id !== selectedHall?._id && // Ignore self
          h.facultyAssigned &&
          h.facultyAssigned.includes(selectedFacultyId)
        );

        if (facultyAlreadyAssigned) {
          toast({
            title: "Faculty Already Assigned",
            description: `This faculty is already assigned to hall ${facultyAlreadyAssigned.name}. A faculty cannot be assigned to multiple halls.`,
            variant: "destructive",
          });
          return;
        }

        // ✅ FIX 2: REMOVE Number() usage completely
        if (selectedFaculty?.department) {
          const assignedFacultyInDept = halls
            .filter(h => h._id !== selectedHall?._id) // Ignore self
            .flatMap((h) => h.facultyAssigned || [])
            .map((fid) => faculty.find((f) => String(f.id) === fid))
            .filter(
              (f) => f && f.department === selectedFaculty.department
            );

          if (assignedFacultyInDept.length >= 2) {
            toast({
              title: "Faculty Assignment Notice",
              description: `Two faculty from ${selectedFaculty.department} department are already assigned.`,
              duration: 5000,
            });
          }
        }

      }

      // ✅ FIX 3: CLEAN PAYLOAD (VERY IMPORTANT)
      const payload = {
        name: formData.name,
        rows: Number(formData.rows),
        columns: Number(formData.columns),
        seatsPerBench: Number(formData.seatsPerBench),
        floor: formData.floor,
        facultyAssigned: formData.facultyAssigned, // already string ObjectIds
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
    navigate(`/admin/seating-plans/${hallId}`);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-600">Loading halls data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Exam Halls Management</h1>
          <p className="text-gray-600">Manage your exam halls here</p>
        </div>

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
                  placeholder="Enter hall name"
                  value={formData.name}
                  onChange={handleInputChange}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
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
                <div className="grid gap-2">
                  <Label htmlFor="seatsPerBench">Seats Per Bench</Label>
                  <Input
                    id="seatsPerBench"
                    name="seatsPerBench"
                    type="number"
                    min="1"
                    value={formData.seatsPerBench}
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
              <div className="grid gap-2">
                <Label htmlFor="faculty">Assign Faculty</Label>

                {/* Faculty Selection Dropdown */}
                <Select
                  value=""
                  onValueChange={handleFacultyChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Add faculty..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-[100]">
                    {faculty.length === 0 ? (
                      <div className="p-2 text-sm text-gray-500 text-center">No faculty available</div>
                    ) : (
                      faculty.map(f => (
                        <SelectItem
                          key={f._id || f.id}
                          value={f._id || String(f.id)}
                          disabled={formData.facultyAssigned.includes(f._id || String(f.id))}
                        >
                          {f.name} {f.department ? `(${f.department})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                {/* Assigned Faculty List */}
                {formData.facultyAssigned.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.facultyAssigned.map(fid => {
                      const f = faculty.find(fac => (fac._id || String(fac.id)) === fid);
                      return (
                        <div key={fid} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm">
                          <span>{f?.name || "Unknown"}</span>
                          <button
                            onClick={() => removeFaculty(fid)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
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

        {/* Confirmation Dialog for Multiple Faculty */}
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Assign Additional Faculty?</AlertDialogTitle>
              <AlertDialogDescription>
                A faculty member is already assigned to this hall.
                Do you want to confirm adding another faculty member?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setPendingFacultyId(null);
                setConfirmOpen(false);
              }}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmAddFaculty}>Confirm & Add</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Configuration</TableHead>
              <TableHead>Faculty Assigned</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {halls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                  No exam halls created yet. Create your first hall to get started.
                </TableCell>
              </TableRow>
            ) : (
              halls.map(hall => (
                <TableRow key={hall._id}>
                  <TableCell className="font-medium">{hall.name}</TableCell>
                  <TableCell>
                    {hall.rows} rows × {hall.columns} columns, {hall.seatsPerBench} seats per bench
                  </TableCell>
                  <TableCell>
                    {hall.facultyAssigned && hall.facultyAssigned.length > 0
                      ? faculty
                        .filter(f => hall.facultyAssigned && hall.facultyAssigned.includes(f._id || String(f.id)))
                        .map(f => f.name)
                        .join(", ")
                      : "None"}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewHall(hall._id)}
                    >
                      Configure
                    </Button>
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default HallsManagement;
