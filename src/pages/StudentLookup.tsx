import React, { useState } from "react";
import { Link } from "react-router-dom";
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
import { toast } from "@/components/ui/use-toast";
import { Loader2, Search, MapPin, Calendar, Clock, ArrowLeft } from "lucide-react";

interface ExamDetail {
    hall: string;
    floor: string;
    date: string;
    session: string;
    time: string;
    rollNumber: string;
}

const StudentLookup = () => {
    const [rollNumber, setRollNumber] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [examDetails, setExamDetails] = useState<ExamDetail[] | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const handleLookup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rollNumber.trim()) return;

        setIsLoading(true);
        setExamDetails(null);
        setHasSearched(false);

        try {
            // Backend URL - Adjust based on environment
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/student/${rollNumber.trim()}`);

            if (response.ok) {
                const data = await response.json();
                setExamDetails(data);
            } else {
                const errorData = await response.json();
                toast({
                    title: "Not Found",
                    description: errorData.message || "No Exam Assignment Found. Please contact Examination Cell.",
                    variant: "destructive",
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

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg space-y-6">
                {/* Logo or Title area */}
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Hall Harmony Planner</h1>
                    <p className="text-slate-500">Student Exam Hall Finder</p>
                </div>

                <Card className="border-none shadow-xl bg-white/80 backdrop-blur-md">
                    <CardHeader>
                        <CardTitle className="text-xl">Find Your Exam Hall</CardTitle>
                        <CardDescription>
                            Enter your Roll Number to view your seating arrangement and exam details.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleLookup} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="rollNumber">Roll Number</Label>
                                <div className="relative">
                                    <Input
                                        id="rollNumber"
                                        placeholder="e.g. 911123149016"
                                        className="pl-10 h-12 text-lg"
                                        value={rollNumber}
                                        onChange={(e) => setRollNumber(e.target.value)}
                                        required
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                                </div>
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-12 text-lg font-medium transition-all hover:scale-[1.01]"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Searching...
                                    </>
                                ) : (
                                    "Find My Hall"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                    <CardFooter className="justify-center border-t py-4">
                        <Link to="/login" className="text-sm text-slate-500 hover:text-primary flex items-center transition-colors">
                            <ArrowLeft className="mr-1 h-3 w-3" />
                            Staff Login
                        </Link>
                    </CardFooter>
                </Card>

                {/* Results Area */}
                {hasSearched && examDetails && examDetails.length > 0 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h3 className="text-lg font-semibold px-1">Your Exam Details:</h3>
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
                                        <span>Roll Number: {detail.rollNumber}</span>
                                        <span className="bg-green-100 text-green-700 font-medium px-2 py-1 rounded">Confirmed Arrangement</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {hasSearched && (!examDetails || examDetails.length === 0) && (
                    <div className="text-center p-8 rounded-lg border-2 border-dashed border-slate-200 text-slate-500 animate-in fade-in duration-300">
                        <p className="font-medium text-lg">No Exam Assignment Found.</p>
                        <p className="text-sm">Please contact the Examination Cell for assistance.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentLookup;
