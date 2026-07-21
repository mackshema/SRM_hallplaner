import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/use-toast";
import { Loader2, MapPin, Calendar, Clock, LogOut, KeyRound, User as UserIcon, Settings } from "lucide-react";
import { getCurrentUser, logout } from "@/lib/auth";

interface ExamDetail {
    hall: string;
    floor: string;
    date: string;
    session: string;
    time: string;
    rollNumber: string;
    seatPosition: string; 
    type?: string; // Internal or Anna University
}

const StudentLookup = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [examDetails, setExamDetails] = useState<ExamDetail[] | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    // Password change state
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const currentUser = getCurrentUser();
    const navigate = useNavigate();

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'student') {
            navigate("/login");
            return;
        }

        const fetchDetails = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/${currentUser.username}`);
                if (response.ok) {
                    const data = await response.json();
                    setExamDetails(data);
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    toast({
                        title: "Notice",
                        description: errorData.message || "No Exam Assignment Found.",
                        variant: "default",
                    });
                }
            } catch (error) {
                console.error("Lookup failed:", error);
                toast({
                    title: "Error",
                    description: "Failed to connect to the server. Please try again later.",
                    variant: "destructive",
                });
            } finally {
                setIsLoading(false);
                setHasSearched(true);
            }
        };

        fetchDetails();
    }, [currentUser, navigate]);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const validatePassword = (password: string) => {
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        return strongPasswordRegex.test(password);
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPassword || !newPassword) return;

        if (!validatePassword(newPassword)) {
            toast({
                title: "Weak Password",
                description: "Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.",
                variant: "destructive",
            });
            return;
        }

        setIsChangingPassword(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/change-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: currentUser!.username,
                    currentPassword,
                    newPassword
                })
            });

            if (response.ok) {
                toast({ title: "Success", description: "Password updated successfully." });
                setIsPasswordModalOpen(false);
                setCurrentPassword("");
                setNewPassword("");
            } else {
                const err = await response.json().catch(() => ({ message: "Failed to update password." }));
                toast({ title: "Error", description: err.message, variant: "destructive" });
            }
        } catch (error) {
            console.error("Error changing password:", error);
            toast({ title: "Error", description: "Network error occurred.", variant: "destructive" });
        } finally {
            setIsChangingPassword(false);
        }
    };

    if (!currentUser) return null;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4">

            {/* Header / Navbar */}
            <div className="w-full max-w-3xl flex justify-between items-center mb-8 bg-white p-4 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                    <UserIcon className="h-6 w-6 text-primary" />
                    <div>
                        <h2 className="font-bold text-lg leading-tight">{currentUser.name}</h2>
                        <p className="text-xs text-slate-500">{currentUser.username}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Settings className="h-4 w-4 mr-1" />
                                Settings
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => setIsPasswordModalOpen(true)} className="cursor-pointer">
                                <KeyRound className="h-4 w-4 mr-2" />
                                Change Password
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50">
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="w-full max-w-3xl space-y-6">
                <div className="text-center space-y-2 mb-8">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Student Dashboard</h1>
                    <p className="text-slate-500">Your Exam Seating Arrangements</p>
                </div>

                {isLoading && (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                {/* Results Area */}
                {!isLoading && hasSearched && examDetails && examDetails.length > 0 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {examDetails.map((detail, index) => (
                            <Card key={index} className="overflow-hidden border-l-4 border-l-primary shadow-md">
                                <CardContent className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 bg-slate-100 p-2 rounded-full text-slate-600">
                                                    <MapPin className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-500 italic">Location</p>
                                                    <p className="font-semibold text-lg">{detail.hall}</p>
                                                    <p className="text-slate-600">{detail.floor}</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 bg-blue-50 p-2 rounded-full text-blue-600">
                                                    <UserIcon className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-500 italic">Seat Position</p>
                                                    <p className="font-semibold text-lg text-blue-700">{detail.seatPosition || "Not Assigned"}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 bg-slate-100 p-2 rounded-full text-slate-600">
                                                    <Calendar className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-500 italic">Date & Session</p>
                                                    <p className="font-semibold text-lg">{detail.date}</p>
                                                    <p className="text-slate-600">{detail.session} Session</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 bg-slate-100 p-2 rounded-full text-slate-600">
                                                    <Clock className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-slate-500 italic">Timing</p>
                                                    <p className="font-semibold">{detail.time}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-6 pt-4 border-t flex justify-between items-center text-xs text-slate-400">
                                        <div className="flex gap-2 items-center">
                                            <span>Roll Number: {detail.rollNumber}</span>
                                            {detail.type && (
                                                <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 font-medium whitespace-nowrap">
                                                    {detail.type}
                                                </span>
                                            )}
                                        </div>
                                        <span className="bg-green-100 text-green-700 font-medium px-2 py-1 rounded">Confirmed Arrangement</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {!isLoading && hasSearched && (!examDetails || examDetails.length === 0) && (
                    <div className="text-center p-8 bg-white rounded-lg shadow-sm border-2 border-dashed border-slate-200 text-slate-500 animate-in fade-in duration-300">
                        <p className="font-medium text-lg">No Exam Assignment Found.</p>
                        <p className="text-sm">Please contact the Examination Cell for assistance or check back later.</p>
                    </div>
                )}
            </div>

            {/* Change Password Modal */}
            <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Password</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleChangePassword}>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="currentPassword">Current Password</Label>
                                <Input
                                    id="currentPassword"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={8}
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    Include uppercase & lowercase letters, numbers, and special characters.
                                    <br />
                                    <b>EXAMPLE OF MIXED CHARACTERS USED: Student@2026</b>
                                </p>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isChangingPassword}>
                                {isChangingPassword ? "Saving..." : "Update Password"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

        </div>
    );
};

export default StudentLookup;
