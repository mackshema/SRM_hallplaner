import React, { useState, useEffect, useRef } from "react";
import { 
    Users, Plus, Upload, Trash2, Edit2, Download, AlertCircle, FileSpreadsheet, Loader2, 
    ChevronRight, Folder, FolderOpen, GraduationCap, LayoutGrid, ArrowLeft
} from "lucide-react";
import { 
    Card, CardContent, CardDescription, CardHeader, CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import * as XLSX from "xlsx";
import { Checkbox } from "@/components/ui/checkbox";
import ExcelUploadHelper from "@/components/ExcelUploadHelper";

interface Student {
    _id: string;
    name: string;
    username: string; // Roll number
    email?: string;
    program?: string;
    degree?: string; // Corresponds to Level/Year
    department?: string;
}

interface AcademicStructure {
    [programName: string]: {
        [yearName: string]: string[];
    };
}

const defaultStructure: AcademicStructure = {
    "Engineering": {
        "Year 1": [],
        "Year 2": [],
        "Year 3": [],
        "Year 4": []
    },
    "MBA": {
        "Year 1": [],
        "Year 2": []
    }
};

const StudentsManagement = () => {
    // Structure State
    const [structure, setStructure] = useState<AcademicStructure>(() => {
        try {
            const saved = localStorage.getItem("academicStructure_v2");
            if (saved) {
                const parsed = JSON.parse(saved);
                if (typeof parsed === 'object' && parsed !== null) {
                    return parsed;
                }
            }
        } catch (error) {
            console.error("Failed to parse academic structure", error);
        }
        return defaultStructure;
    });

    // Navigation State
    const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
    const [selectedDegree, setSelectedDegree] = useState<string | null>(null);
    const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);

    // Data State
    const [students, setStudents] = useState<Student[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    
    useEffect(() => {
        setSelectedStudents([]);
    }, [selectedProgram, selectedDegree, selectedDepartment]);
    
    // Add/Edit Student Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);
    const [formData, setFormData] = useState<{name: string, rollNumber: string, email: string, program?: string, degree?: string, department?: string}>({ name: "", rollNumber: "", email: "" });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [skipEmail, setSkipEmail] = useState(false);

    // Delete Student Modal
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

    // Structure Modals
    const [isAddProgramModalOpen, setIsAddProgramModalOpen] = useState(false);
    const [newProgramName, setNewProgramName] = useState("");
    const [isAddDegreeModalOpen, setIsAddDegreeModalOpen] = useState(false);
    const [newDegreeName, setNewDegreeName] = useState("");
    const [isAddDeptModalOpen, setIsAddDeptModalOpen] = useState(false);
    const [newDeptName, setNewDeptName] = useState("");

    // Bulk Upload
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStats, setUploadStats] = useState<{total: number, success: number, skipped: number, skippedReasons: any[]} | null>(null);
    const [isUploadResultOpen, setIsUploadResultOpen] = useState(false);
    const [isGlobalUploadOpen, setIsGlobalUploadOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem("academicStructure_v2", JSON.stringify(structure));
    }, [structure]);

    const fetchStudents = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student`);
            if (res.ok) {
                const data = await res.json();
                setStudents(data);
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to fetch students.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStudents();
    }, []);

    // --- Structure Handlers ---
    const handleAddProgram = () => {
        if (!newProgramName.trim()) return;
        if (structure[newProgramName]) {
            toast({ title: "Error", description: "Program already exists", variant: "destructive" });
            return;
        }
        setStructure(prev => ({ ...prev, [newProgramName]: {} }));
        setNewProgramName("");
        setIsAddProgramModalOpen(false);
        toast({ title: "Success", description: "Program added successfully" });
    };

    const handleAddDegree = () => {
        if (!newDegreeName.trim() || !selectedProgram) return;
        if (structure[selectedProgram][newDegreeName]) {
            toast({ title: "Error", description: "Category/Year already exists", variant: "destructive" });
            return;
        }
        setStructure(prev => ({ 
            ...prev, 
            [selectedProgram]: {
                ...prev[selectedProgram],
                [newDegreeName]: []
            }
        }));
        setNewDegreeName("");
        setIsAddDegreeModalOpen(false);
        toast({ title: "Success", description: "Category added successfully" });
    };

    const handleAddDepartment = () => {
        if (!newDeptName.trim() || !selectedProgram || !selectedDegree) return;
        const currentDepts = structure[selectedProgram][selectedDegree];
        if (currentDepts.includes(newDeptName)) {
            toast({ title: "Error", description: "Department already exists", variant: "destructive" });
            return;
        }
        setStructure(prev => ({
            ...prev,
            [selectedProgram]: {
                ...prev[selectedProgram],
                [selectedDegree]: [...currentDepts, newDeptName]
            }
        }));
        setNewDeptName("");
        setIsAddDeptModalOpen(false);
        toast({ title: "Success", description: "Department added successfully" });
    };

    const handleDeleteProgram = (e: React.MouseEvent, program: string) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to remove the program "${program}"? Students in this program will not be deleted, but they won't be visible here until the program is added again.`)) {
            setStructure(prev => {
                const updated = { ...prev };
                delete updated[program];
                return updated;
            });
            if (selectedProgram === program) {
                setSelectedProgram(null);
                setSelectedDegree(null);
                setSelectedDepartment(null);
            }
        }
    };

    const handleDeleteDegree = (e: React.MouseEvent, degree: string) => {
        e.stopPropagation();
        if (!selectedProgram) return;
        if (window.confirm(`Are you sure you want to remove the category "${degree}"? Students won't be deleted.`)) {
            setStructure(prev => {
                const updated = { ...prev };
                delete updated[selectedProgram][degree];
                return updated;
            });
            if (selectedDegree === degree) setSelectedDegree(null);
        }
    };

    const handleDeleteDepartment = (e: React.MouseEvent, dept: string) => {
        e.stopPropagation();
        if (!selectedProgram || !selectedDegree) return;
        if (window.confirm(`Are you sure you want to remove the department "${dept}"? Students will not be deleted.`)) {
            setStructure(prev => ({
                ...prev,
                [selectedProgram]: {
                    ...prev[selectedProgram],
                    [selectedDegree]: prev[selectedProgram][selectedDegree].filter(d => d !== dept)
                }
            }));
            if (selectedDepartment === dept) setSelectedDepartment(null);
        }
    };

    // --- Student Handlers ---
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const openAddModal = () => {
        setIsEditing(false);
        setFormData({ 
            name: "", 
            rollNumber: "", 
            email: "", 
            program: selectedProgram || "", 
            degree: selectedDegree || "", 
            department: selectedDepartment || "" 
        });
        setSkipEmail(false);
        setIsModalOpen(true);
    };

    const openEditModal = (student: Student) => {
        setIsEditing(true);
        setCurrentStudentId(student._id);
        setFormData({ 
            name: student.name, 
            rollNumber: student.username, 
            email: student.email || "",
            program: student.program,
            degree: student.degree,
            department: student.department
        });
        setSkipEmail(false);
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.rollNumber) {
            toast({ title: "Validation Error", description: "Name and Roll Number are required.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            if (isEditing && currentStudentId) {
                const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/${currentStudentId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        ...formData, 
                        skipEmail,
                        program: formData.program || selectedProgram,
                        degree: formData.degree || selectedDegree,
                        department: formData.department || selectedDepartment
                    })
                });
                
                if (res.ok) {
                    toast({ title: "Success", description: "Student updated successfully." });
                    fetchStudents();
                    setIsModalOpen(false);
                } else {
                    const err = await res.json();
                    toast({ title: "Error", description: err.message || "Failed to update.", variant: "destructive" });
                }
            } else {
                const password = "student123"; 
                
                const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/create-account`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        ...formData, 
                        password,
                        program: formData.program || selectedProgram,
                        degree: formData.degree || selectedDegree,
                        department: formData.department || selectedDepartment
                    })
                });

                if (res.ok) {
                    toast({ title: "Success", description: "Student created successfully." });
                    fetchStudents();
                    setIsModalOpen(false);
                } else {
                    const err = await res.json();
                    toast({ title: "Error", description: err.message || "Failed to create.", variant: "destructive" });
                }
            }
        } catch (error) {
            toast({ title: "Error", description: "A network error occurred.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (!studentToDelete) return;
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/${studentToDelete._id}`, {
                method: "DELETE"
            });
            if (res.ok) {
                toast({ title: "Deleted", description: "Student removed completely." });
                fetchStudents();
            } else {
                toast({ title: "Error", description: "Failed to delete student.", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Error", description: "A network error occurred.", variant: "destructive" });
        } finally {
            setIsDeleteModalOpen(false);
            setStudentToDelete(null);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedStudents(filteredStudents.map(s => s._id));
        } else {
            setSelectedStudents([]);
        }
    };

    const handleSelectStudent = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedStudents(prev => [...prev, id]);
        } else {
            setSelectedStudents(prev => prev.filter(studentId => studentId !== id));
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Are you sure you want to completely delete ${selectedStudents.length} students?`)) return;
        setIsSubmitting(true);
        try {
            await Promise.all(selectedStudents.map(id => 
                fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/${id}`, { method: "DELETE" })
            ));
            toast({ title: "Deleted", description: `${selectedStudents.length} students have been removed.` });
            setSelectedStudents([]);
            fetchStudents();
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete some or all students.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Excel Upload Logic ---
    const handleGlobalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const reader = new FileReader();

        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                
                const newStructure = { ...structure };
                let structureChanged = false;

                const formattedStudents = data.map((row: any) => {
                    const prog = row["Program"] || row["program"] || selectedProgram || "General";
                    const deg = row["Year"] || row["year"] || row["Degree"] || row["degree"] || selectedDegree || "Year 1";
                    const dept = row["Department"] || row["department"] || selectedDepartment || "General";

                    // Update structure logically
                    if (!newStructure[prog]) {
                        newStructure[prog] = {};
                        structureChanged = true;
                    }
                    if (!newStructure[prog][deg]) {
                        newStructure[prog][deg] = [];
                        structureChanged = true;
                    }
                    if (!newStructure[prog][deg].includes(dept)) {
                        newStructure[prog][deg].push(dept);
                        structureChanged = true;
                    }

                    return {
                        name: row["Name"] || row["name"],
                        rollNumber: String(row["Roll Number"] || row["rollNumber"] || row["RollNumber"] || ""),
                        email: row["Email"] || row["email"] || "",
                        password: "student123",
                        program: prog,
                        degree: deg,
                        department: dept
                    };
                }).filter(s => s.name && s.rollNumber);

                if (formattedStudents.length === 0) {
                    toast({ title: "Invalid File", description: "No valid student records found.", variant: "destructive" });
                    return;
                }

                if (structureChanged) {
                    setStructure(newStructure);
                }

                const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/bulk-create`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ students: formattedStudents })
                });

                if (res.ok) {
                    const result = await res.json();
                    setUploadStats({
                        total: formattedStudents.length,
                        success: result.createdCount,
                        skipped: result.skippedCount,
                        skippedReasons: result.skippedDetailed
                    });
                    setIsGlobalUploadOpen(false);
                    setIsUploadResultOpen(true);
                    fetchStudents();
                } else {
                    toast({ title: "Upload Failed", description: "Server error during bulk creation.", variant: "destructive" });
                }
            } catch (error) {
                console.error("Upload error:", error);
                toast({ title: "Error", description: "Failed to process file.", variant: "destructive" });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
            }
        };

        reader.readAsBinaryString(file);
    };

    const downloadTemplate = (isGlobal = false) => {
        const templateData = isGlobal ? 
            { "Name": "Chaitanya", "Roll Number": "91112314900X", "Email": "student@college.edu", "Program": "Engineering", "Year": "Year 2", "Department": "CSE" } :
            { "Name": "Chaitanya", "Roll Number": "91112314900X", "Email": "student@college.edu" };

        const ws = XLSX.utils.json_to_sheet([templateData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Students");
        XLSX.writeFile(wb, isGlobal ? "Global_Student_Upload_Template.xlsx" : "Student_Upload_Template.xlsx");
    };

    const filteredStudents = students.filter(student => 
        student.program === selectedProgram &&
        student.degree === selectedDegree && 
        student.department === selectedDepartment &&
        ((student.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.username || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.email && student.email.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    // --- Render Helpers ---
    const breadcrumbs = (
        <div className="flex items-center space-x-2 text-sm text-slate-500 mb-6 font-medium">
            <span 
                className={`cursor-pointer hover:text-primary transition-colors ${!selectedProgram ? 'text-primary' : ''}`}
                onClick={() => { setSelectedProgram(null); setSelectedDegree(null); setSelectedDepartment(null); }}
            >
                Programs
            </span>
            {selectedProgram && (
                <>
                    <ChevronRight className="h-4 w-4" />
                    <span 
                        className={`cursor-pointer hover:text-primary transition-colors ${!selectedDegree && selectedProgram ? 'text-primary' : ''}`}
                        onClick={() => { setSelectedDegree(null); setSelectedDepartment(null); }}
                    >
                        {selectedProgram}
                    </span>
                </>
            )}
            {selectedDegree && (
                <>
                    <ChevronRight className="h-4 w-4" />
                    <span 
                        className={`cursor-pointer hover:text-primary transition-colors ${!selectedDepartment && selectedDegree ? 'text-primary' : ''}`}
                        onClick={() => setSelectedDepartment(null)}
                    >
                        {selectedDegree}
                    </span>
                </>
            )}
            {selectedDepartment && (
                <>
                    <ChevronRight className="h-4 w-4" />
                    <span className="text-primary">{selectedDepartment}</span>
                </>
            )}
        </div>
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                        <GraduationCap className="h-6 w-6 text-primary" />
                        Student Management
                    </h1>
                    <p className="text-slate-500 mt-1">Organize and manage students by their respective categories and departments.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setIsGlobalUploadOpen(true)} className="bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary">
                        <Upload className="mr-2 h-4 w-4" /> Global Bulk Upload
                    </Button>

                    {selectedDepartment && (
                        <>
                            <Button variant="outline" onClick={() => downloadTemplate(false)} className="hidden sm:flex">
                                <Download className="mr-2 h-4 w-4" /> Template
                            </Button>
                            
                            <input 
                                type="file" 
                                accept=".xlsx, .xls, .csv" 
                                ref={fileInputRef} 
                                onChange={handleGlobalFileUpload} 
                                className="hidden" 
                            />
                            <Button 
                                variant="secondary" 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                            >
                                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                Context Upload
                            </Button>
                        </>
                    )}
                    
                    <Button onClick={openAddModal} className="shadow-sm">
                        <Plus className="mr-2 h-4 w-4" /> Add Student
                    </Button>
                </div>
            </div>

            {breadcrumbs}

            {/* Level 0: Programs */}
            {!selectedProgram && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                            <LayoutGrid className="h-5 w-5 text-slate-400" />
                            Academic Programs
                        </h2>
                        <Button onClick={() => setIsAddProgramModalOpen(true)} variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" /> Add Program
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {Object.keys(structure).map((program) => (
                            <Card 
                                key={program} 
                                className="cursor-pointer hover:border-primary hover:shadow-md transition-all group duration-300"
                                onClick={() => setSelectedProgram(program)}
                            >
                                <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full gap-3 relative">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={(e) => handleDeleteProgram(e, program)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                    <div className="p-4 bg-slate-50 rounded-full group-hover:bg-primary/10 transition-colors">
                                        <GraduationCap className="h-8 w-8 text-slate-400 group-hover:text-primary transition-colors" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg text-slate-800">{program}</h3>
                                        <p className="text-sm text-slate-500">{Object.keys(structure[program]).length} Categories</p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Level 1: Degrees/Years */}
            {selectedProgram && !selectedDegree && (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedProgram(null)}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                                <LayoutGrid className="h-5 w-5 text-slate-400" />
                                Categories for {selectedProgram}
                            </h2>
                        </div>
                        <Button onClick={() => setIsAddDegreeModalOpen(true)} variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" /> Add Category
                        </Button>
                    </div>
                    
                    {Object.keys(structure[selectedProgram] || {}).length === 0 ? (
                         <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                             <GraduationCap className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                             <h3 className="text-lg font-medium text-slate-800">No Categories Found</h3>
                             <p className="text-slate-500 mb-4">Start by adding a year/category for {selectedProgram}</p>
                             <Button onClick={() => setIsAddDegreeModalOpen(true)}>
                                 <Plus className="h-4 w-4 mr-2" /> Add Category
                             </Button>
                         </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {Object.keys(structure[selectedProgram]).map((degree) => (
                                <Card 
                                    key={degree} 
                                    className="cursor-pointer hover:border-primary hover:shadow-md transition-all group duration-300"
                                    onClick={() => setSelectedDegree(degree)}
                                >
                                    <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full gap-3 relative">
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => handleDeleteDegree(e, degree)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                        <div className="p-4 bg-slate-50 rounded-full group-hover:bg-primary/10 transition-colors">
                                            <Folder className="h-8 w-8 text-slate-400 group-hover:text-primary transition-colors" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg text-slate-800">{degree}</h3>
                                            <p className="text-sm text-slate-500">{(structure[selectedProgram][degree] || []).length} Departments</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Level 2: Departments */}
            {selectedProgram && selectedDegree && !selectedDepartment && (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedDegree(null)}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                                <FolderOpen className="h-5 w-5 text-slate-400" />
                                Departments in {selectedDegree}
                            </h2>
                        </div>
                        <Button onClick={() => setIsAddDeptModalOpen(true)} variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" /> Add Department
                        </Button>
                    </div>
                    
                    {(structure[selectedProgram]?.[selectedDegree] || []).length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                            <Folder className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-lg font-medium text-slate-800">No Departments Found</h3>
                            <p className="text-slate-500 mb-4">Start by adding a department for {selectedDegree}</p>
                            <Button onClick={() => setIsAddDeptModalOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" /> Add Department
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {(structure[selectedProgram][selectedDegree] || []).map((dept) => {
                                const deptStudents = students.filter(s => s.program === selectedProgram && s.degree === selectedDegree && s.department === dept);
                                return (
                                    <Card 
                                        key={dept} 
                                        className="cursor-pointer hover:border-primary hover:shadow-md transition-all group duration-300 relative overflow-hidden"
                                        onClick={() => setSelectedDepartment(dept)}
                                    >
                                        <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 group-hover:bg-primary transition-colors"></div>
                                        <CardContent className="p-6 relative">
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                                onClick={(e) => handleDeleteDepartment(e, dept)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                            <Folder className="h-8 w-8 text-slate-400 group-hover:text-primary transition-colors mb-4" />
                                            <h3 className="font-semibold text-lg text-slate-800 leading-tight">{dept}</h3>
                                            <p className="text-sm text-slate-500 mt-2">{deptStudents.length} Students</p>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Level 3: Students List */}
            {selectedProgram && selectedDegree && selectedDepartment && (
                <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                    <Card className="border-none shadow-sm shadow-slate-200/50">
                        <CardHeader className="pb-4 border-b border-slate-100 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" size="icon" onClick={() => setSelectedDepartment(null)}>
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <div>
                                    <CardTitle>{selectedDepartment} Students</CardTitle>
                                    <CardDescription>Manage students in {selectedProgram} &gt; {selectedDegree} &gt; {selectedDepartment}</CardDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {selectedStudents.length > 0 && (
                                    <Button variant="destructive" onClick={handleBulkDelete} disabled={isSubmitting}>
                                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4 mr-2" />}
                                        Delete ({selectedStudents.length})
                                    </Button>
                                )}
                                <div className="w-64">
                                    <Input 
                                        placeholder="Search..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="bg-slate-50"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <ExcelUploadHelper
                                columns={[
                                    { header: "Name",        example: "Chaitanya Kumar",  required: true,  description: "Student full name" },
                                    { header: "Roll Number", example: "911123149001",      required: true,  description: "Used as login username" },
                                    { header: "Email",       example: "student@srm.edu",  required: false, description: "Optional" },
                                ]}
                                templateFilename="Student_Upload_Template.xlsx"
                                sampleRows={[
                                    { "Name": "Priya Sharma", "Roll Number": "911123149002", "Email": "priya@srm.edu" },
                                ]}
                                note="Department, Year & Program are taken from the current navigation context — no need to add them in the file."
                            />
                            <div className="rounded-md border border-slate-200 overflow-hidden">
                                <Table>
                                    <TableHeader className="bg-slate-50">
                                        <TableRow>
                                            <TableHead className="w-12">
                                                <Checkbox 
                                                    checked={filteredStudents.length > 0 && selectedStudents.length === filteredStudents.length}
                                                    onCheckedChange={(c) => handleSelectAll(c === true)}
                                                />
                                            </TableHead>
                                            <TableHead>Roll Number</TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email Address</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center">
                                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredStudents.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                                                    No students found in {selectedDepartment}.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredStudents.map((student) => (
                                                <TableRow key={student._id}>
                                                    <TableCell>
                                                        <Checkbox 
                                                            checked={selectedStudents.includes(student._id)}
                                                            onCheckedChange={(c) => handleSelectStudent(student._id, c === true)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-medium">{student.username}</TableCell>
                                                    <TableCell>{student.name}</TableCell>
                                                    <TableCell className="text-slate-600">{student.email || <span className="text-slate-400 italic">Not Provided</span>}</TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="ghost" size="icon" onClick={() => openEditModal(student)}>
                                                                <Edit2 className="h-4 w-4 text-blue-600" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => {
                                                                setStudentToDelete(student);
                                                                setIsDeleteModalOpen(true);
                                                            }}>
                                                                <Trash2 className="h-4 w-4 text-red-600" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Structure Modals */}
            <Dialog open={isAddProgramModalOpen} onOpenChange={setIsAddProgramModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Academic Program</DialogTitle>
                        <DialogDescription>Create a new program category (e.g., Engineering, MBA, Arts)</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-left space-y-2">
                        <Label>Program Name</Label>
                        <Input 
                            value={newProgramName} 
                            onChange={(e) => setNewProgramName(e.target.value)} 
                            placeholder="e.g., Engineering" 
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddProgramModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddProgram}>Add Program</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddDegreeModalOpen} onOpenChange={setIsAddDegreeModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Category / Year</DialogTitle>
                        <DialogDescription>Create a new category under {selectedProgram} (e.g., Year 1, Year 2)</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-left space-y-2">
                        <Label>Category/Year Name</Label>
                        <Input 
                            value={newDegreeName} 
                            onChange={(e) => setNewDegreeName(e.target.value)} 
                            placeholder="e.g., First Year" 
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddDegreeModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddDegree}>Add Category</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isAddDeptModalOpen} onOpenChange={setIsAddDeptModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Department</DialogTitle>
                        <DialogDescription>Add a new department under {selectedProgram} - {selectedDegree}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 text-left space-y-2">
                        <Label>Department Name</Label>
                        <Input 
                            value={newDeptName} 
                            onChange={(e) => setNewDeptName(e.target.value)} 
                            placeholder="e.g., Cyber Security" 
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddDeptModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddDepartment}>Add Department</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add / Edit Student Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{isEditing ? "Edit Student Account" : "Add Student"}</DialogTitle>
                        <DialogDescription>
                            {isEditing 
                                ? "Update the student's details." 
                                : selectedDepartment 
                                    ? `Adding to ${selectedDegree} > ${selectedDepartment}`
                                    : "Fill in the details to add a new student."}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            {!isEditing && !selectedDepartment && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Program</Label>
                                        <select 
                                            className="w-full text-xs p-1 border rounded bg-white"
                                            value={formData.program || ""}
                                            onChange={(e) => setFormData(p => ({ ...p, program: e.target.value, degree: "", department: "" }))}
                                        >
                                            <option value="">Select...</option>
                                            {Object.keys(structure).map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Year/Category</Label>
                                        <select 
                                            className="w-full text-xs p-1 border rounded bg-white"
                                            value={formData.degree || ""}
                                            disabled={!formData.program}
                                            onChange={(e) => setFormData(p => ({ ...p, degree: e.target.value, department: "" }))}
                                        >
                                            <option value="">Select...</option>
                                            {formData.program && Object.keys(structure[formData.program] || {}).map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Department</Label>
                                        <select 
                                            className="w-full text-xs p-1 border rounded bg-white"
                                            value={formData.department || ""}
                                            disabled={!formData.degree}
                                            onChange={(e) => setFormData(p => ({ ...p, department: e.target.value }))}
                                        >
                                            <option value="">Select...</option>
                                            {formData.program && formData.degree && (structure[formData.program][formData.degree] || []).map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                                <Input id="name" name="name" placeholder="e.g., Chaitanya" required
                                    value={formData.name} onChange={handleInputChange} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rollNumber">Roll Number (Username) <span className="text-red-500">*</span></Label>
                                <Input id="rollNumber" name="rollNumber" placeholder="e.g., 911123..." required
                                    value={formData.rollNumber} onChange={handleInputChange} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input id="email" name="email" type="email" placeholder="student@college.edu"
                                    value={formData.email} onChange={handleInputChange} />
                            </div>
                            
                            {isEditing && formData.email && (
                                <div className="flex items-center space-x-2 mt-2 p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-sm">
                                    <Checkbox id="skipEmail" checked={skipEmail} onCheckedChange={(c) => setSkipEmail(c === true)} />
                                    <label htmlFor="skipEmail" className="font-medium cursor-pointer">
                                        Update silently (Do not send email notification to student)
                                    </label>
                                </div>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                {isEditing ? "Save Changes" : "Add Student"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center text-red-600 gap-2">
                            <AlertCircle className="h-5 w-5" />
                            Confirm Deletion
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p>Are you sure you want to permanently delete the account for <b>{studentToDelete?.name}</b>?</p>
                        <p className="text-sm text-slate-500 mt-2">This will remove their ability to log in.</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDelete}>Delete Student</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Upload Results Modal */}
            {/* Global Upload Dialog */}
            <Dialog open={isGlobalUploadOpen} onOpenChange={setIsGlobalUploadOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Global Student Bulk Upload</DialogTitle>
                        <DialogDescription>
                            Upload an Excel file containing students for multiple programs and departments at once. 
                            If a program or department doesn't exist, it will be created automatically.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-6 pt-4">
                        <ExcelUploadHelper
                            columns={[
                                { header: "Name",        example: "Chaitanya Kumar", required: true,  description: "Full name" },
                                { header: "Roll Number", example: "911123149001",    required: true,  description: "Username" },
                                { header: "Program",     example: "Engineering",     required: true,  description: "e.g. Engineering, MBA" },
                                { header: "Year",        example: "Year 2",          required: true,  description: "Year or Category" },
                                { header: "Department",  example: "CSE",             required: true,  description: "Dept name" },
                                { header: "Email",       example: "student@srm.edu", required: false, description: "Optional email" },
                            ]}
                            templateFilename="Global_Student_Upload_Template.xlsx"
                            sampleRows={[
                                { "Name": "Alice Smith", "Roll Number": "2024CSE001", "Program": "Engineering", "Year": "Year 1", "Department": "CSE" },
                                { "Name": "Bob Jones", "Roll Number": "2024MBA005", "Program": "MBA", "Year": "Year 1", "Department": "Finance" },
                            ]}
                        />

                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 gap-4">
                            <input 
                                type="file" 
                                accept=".xlsx, .xls, .csv" 
                                onChange={handleGlobalFileUpload} 
                                className="hidden" 
                                id="global-upload-input"
                            />
                            <Label 
                                htmlFor="global-upload-input" 
                                className="flex flex-col items-center gap-3 cursor-pointer group"
                            >
                                <div className="p-4 bg-white rounded-full shadow-sm group-hover:bg-primary group-hover:text-white transition-all">
                                    <FileSpreadsheet className="h-8 w-8 text-primary group-hover:text-white" />
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-slate-800">Click to select Excel file</p>
                                    <p className="text-sm text-slate-500">Maximum file size: 5MB</p>
                                </div>
                            </Label>
                            
                            {isUploading && (
                                <div className="flex items-center gap-2 text-primary font-medium animate-pulse">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Processing students and structure...
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <DialogFooter className="sm:justify-between">
                        <Button variant="ghost" onClick={() => downloadTemplate(true)} className="text-blue-600">
                            <Download className="mr-2 h-4 w-4" /> Download Global Template
                        </Button>
                        <Button variant="outline" onClick={() => setIsGlobalUploadOpen(false)}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isUploadResultOpen} onOpenChange={setIsUploadResultOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex flex-col gap-2 items-center text-center">
                            <div className="bg-green-100 p-3 rounded-full">
                                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                            </div>
                            Bulk Upload Complete
                        </DialogTitle>
                    </DialogHeader>
                    
                    {uploadStats && (
                        <div className="py-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="text-3xl font-bold text-slate-800">{uploadStats.total}</div>
                                    <div className="text-sm font-medium text-slate-500 mt-1">Found in Excel</div>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                    <div className="text-3xl font-bold text-green-600">{uploadStats.success}</div>
                                    <div className="text-sm font-medium text-green-700 mt-1">Successfully Added</div>
                                </div>
                            </div>
                            
                            {uploadStats.skipped > 0 && (
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mt-4">
                                    <h4 className="font-semibold text-amber-900 flex items-center gap-2 mb-2">
                                        <AlertCircle className="h-4 w-4" /> 
                                        {uploadStats.skipped} Students Skipped
                                    </h4>
                                    <ul className="text-sm text-amber-800 space-y-1 max-h-32 overflow-y-auto pl-6 list-disc">
                                        {uploadStats.skippedReasons.map((reason, idx) => (
                                            <li key={idx}>
                                                <b>{reason.rollNumber}</b>: {reason.reason}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="sm:justify-center">
                        <Button onClick={() => setIsUploadResultOpen(false)} className="w-full sm:w-auto min-w-32">
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default StudentsManagement;
