import React, { useEffect, useState } from "react";
import { db, ExamSession } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, X, Save } from "lucide-react";

const ExamRestrictions = () => {
    const [sessions, setSessions] = useState<ExamSession[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState("");
    const [selectedSession, setSelectedSession] = useState<ExamSession | null>(null);

    // Array of restriction sets being built (each set is an array of department names)
    const [currentSets, setCurrentSets] = useState<string[][]>([["", ""]]);

    const { toast } = useToast();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const sessData = await db.getExamSessions();
            setSessions(sessData);
            // Fetch unique departments from students
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
            const res = await fetch(`${API_URL}/users?role=student`);
            if (res.ok) {
                const students = await res.json();
                const uniqueDepts = [...new Set(students.map((s: any) => s.department).filter(Boolean))] as string[];
                setDepartments(uniqueDepts.sort());
            }
        } catch (e) {
            console.error(e);
            toast({ title: "Error fetching data", variant: "destructive" });
        }
    };

    useEffect(() => {
        if (selectedSessionId) {
            const sess = sessions.find(s => s._id === selectedSessionId) || null;
            setSelectedSession(sess);
        } else {
            setSelectedSession(null);
        }
        setCurrentSets([["", ""]]); // Reset when session changes
    }, [selectedSessionId, sessions]);

    // Block level actions
    const handleAddNewSetBlock = () => {
        setCurrentSets([...currentSets, ["", ""]]);
    };

    const handleRemoveSetBlock = (setIndex: number) => {
        setCurrentSets(currentSets.filter((_, i) => i !== setIndex));
    };

    // Department level actions within a block
    const handleAddDeptToSet = (setIndex: number) => {
        const newSets = [...currentSets];
        newSets[setIndex] = [...newSets[setIndex], ""];
        setCurrentSets(newSets);
    };

    const handleRemoveDeptFromSet = (setIndex: number, deptIndex: number) => {
        if (currentSets[setIndex].length <= 2) {
            toast({ title: "Note", description: "A set needs at least two departments.", variant: "default" });
            return;
        }
        const newSets = [...currentSets];
        newSets[setIndex] = newSets[setIndex].filter((_, i) => i !== deptIndex);
        setCurrentSets(newSets);
    };

    const handleDeptChange = (setIndex: number, deptIndex: number, value: string) => {
        const newSets = [...currentSets];
        newSets[setIndex][deptIndex] = value;
        setCurrentSets(newSets);
    };

    // Save single block
    const handleSaveSet = async (setIndex: number) => {
        if (!selectedSession) return;

        const currentSet = currentSets[setIndex];
        // Filter out empties
        const validSet = currentSet.filter(id => id.trim() !== "");
        if (validSet.length < 2) {
            toast({ title: "Error", description: "A set must have at least 2 departments.", variant: "destructive" });
            return;
        }

        const uniqueSet = Array.from(new Set(validSet));
        if (uniqueSet.length !== validSet.length) {
            toast({ title: "Error", description: `Duplicate departments in Set ${setIndex + 1}.`, variant: "destructive" });
            return;
        }

        const currentBlocks = selectedSession.blockedCombinations || [];
        const newBlocks = [...currentBlocks, uniqueSet];

        try {
            const updated = await db.updateExamSession(selectedSession._id, { blockedCombinations: newBlocks });
            setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
            toast({ title: "Success", description: `Restriction Set ${setIndex + 1} added!` });

            // Remove that build-block or clear it if it's the last one
            if (currentSets.length > 1) {
                handleRemoveSetBlock(setIndex);
            } else {
                setCurrentSets([["", ""]]);
            }
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    // Save all drafted blocks at once
    const handleSaveAllSets = async () => {
        if (!selectedSession) return;

        const validatedSets: string[][] = [];

        for (let i = 0; i < currentSets.length; i++) {
            const validSet = currentSets[i].filter(id => id.trim() !== "");
            // Only process blocks that aren't empty
            if (validSet.length > 0) {
                if (validSet.length < 2) {
                    toast({ title: "Error", description: `Set ${i + 1} has only 1 department. Must have at least 2.`, variant: "destructive" });
                    return;
                }
                const uniqueSet = Array.from(new Set(validSet));
                if (uniqueSet.length !== validSet.length) {
                    toast({ title: "Error", description: `Duplicate departments in Set ${i + 1}.`, variant: "destructive" });
                    return;
                }
                validatedSets.push(uniqueSet);
            }
        }

        if (validatedSets.length === 0) {
            toast({ title: "Info", description: "All sets are empty. Nothing to save.", variant: "default" });
            return;
        }

        const currentBlocks = selectedSession.blockedCombinations || [];
        const newBlocks = [...currentBlocks, ...validatedSets];

        try {
            const updated = await db.updateExamSession(selectedSession._id, { blockedCombinations: newBlocks });
            setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
            toast({ title: "Success", description: `${validatedSets.length} restriction sets added!` });
            setCurrentSets([["", ""]]); // reset all
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    const handleRemoveRestrictionSet = async (index: number) => {
        if (!selectedSession) return;
        const currentBlocks = [...(selectedSession.blockedCombinations || [])];
        currentBlocks.splice(index, 1);

        try {
            const updated = await db.updateExamSession(selectedSession._id, { blockedCombinations: currentBlocks });
            setSessions(prev => prev.map(s => s._id === updated._id ? updated : s));
            toast({ title: "Success", description: "Restriction set removed" });
        } catch (e: any) {
            toast({ title: "Error", description: e.message, variant: "destructive" });
        }
    };

    const getDeptName = (id: string) => {
        // Since departments are now plain strings (e.g. 'CSE'), just return the value
        return departments.includes(id) ? id : id;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold">Exam Restrictions (Same Exam Sets)</h1>
                    <p className="text-gray-600">Define sets of departments writing the SAME exam. Departments within a set will NOT be seated in the same hall.</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="mb-6 max-w-sm">
                    <label className="block text-sm font-medium mb-2">Select Exam Session</label>
                    <select
                        className="w-full border border-gray-300 p-2 rounded"
                        value={selectedSessionId}
                        onChange={e => setSelectedSessionId(e.target.value)}
                    >
                        <option value="">-- Select Session --</option>
                        {sessions.map(s => (
                            <option key={s._id} value={s._id}>{s.examDate} ({s.examSession}) - {s.status}</option>
                        ))}
                    </select>
                </div>

                {selectedSession && (
                    <>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {/* Build Sets Section */}
                            <div className="space-y-6">
                                {currentSets.map((currentSet, setIndex) => (
                                    <div key={setIndex} className="border border-gray-200 rounded-lg p-5 bg-gray-50/50 relative shadow-sm">
                                        {currentSets.length > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveSetBlock(setIndex)}
                                                className="absolute top-2 right-2 text-gray-500 hover:text-red-500 hover:bg-red-50"
                                                disabled={selectedSession.status === "FINAL"}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <h3 className="text-lg font-semibold mb-2">Build Restriction Set {setIndex + 1}</h3>
                                        <p className="text-sm text-gray-500 mb-4">Add departments that are writing the SAME exam.</p>

                                        <div className="space-y-4">
                                            {currentSet.map((deptId, deptIndex) => (
                                                <div key={deptIndex} className="flex items-center gap-2">
                                                    <select
                                                        className="flex-1 border border-gray-300 p-2 rounded"
                                                        value={deptId}
                                                        onChange={e => handleDeptChange(setIndex, deptIndex, e.target.value)}
                                                    >
                                                        <option value="">Select Department {deptIndex + 1}</option>
                                                        {departments.map(dept => (
                                                            <option key={dept} value={dept}>{dept}</option>
                                                        ))}
                                                    </select>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => handleRemoveDeptFromSet(setIndex, deptIndex)}
                                                        className="text-gray-500 hover:text-red-500"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}

                                            <div className="flex gap-2 pt-2">
                                                <Button
                                                    variant="secondary"
                                                    onClick={() => handleAddDeptToSet(setIndex)}
                                                    className="flex-1"
                                                    disabled={selectedSession.status === "FINAL"}
                                                >
                                                    <Plus className="mr-2 h-4 w-4" /> Add Dept
                                                </Button>
                                                <Button
                                                    onClick={() => handleSaveSet(setIndex)}
                                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                                    disabled={selectedSession.status === "FINAL"}
                                                >
                                                    {selectedSession.status === "FINAL" ? "Finalized" : `Save Set ${setIndex + 1}`}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                <div className="flex flex-col sm:flex-row gap-4">
                                    <Button
                                        variant="outline"
                                        onClick={handleAddNewSetBlock}
                                        className="flex-1 border-dashed border-2 py-6 text-gray-600 hover:bg-gray-50"
                                        disabled={selectedSession.status === "FINAL"}
                                    >
                                        <Plus className="mr-2 h-5 w-5" /> Add Another Restriction Set
                                    </Button>

                                    {currentSets.length > 1 && (
                                        <Button
                                            onClick={handleSaveAllSets}
                                            className="flex-1 py-6 bg-green-600 hover:bg-green-700 text-white"
                                            disabled={selectedSession.status === "FINAL"}
                                        >
                                            <Save className="mr-2 h-5 w-5" /> Save All Draft Sets
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* View Existing Saved Sets Section */}
                            <div>
                                <h3 className="text-lg font-semibold mb-4">Saved Restriction Sets</h3>
                                {(!selectedSession.blockedCombinations || selectedSession.blockedCombinations.length === 0) ? (
                                    <div className="h-32 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg text-gray-500 italic bg-gray-50">
                                        No restriction sets saved. build one on the left.
                                    </div>
                                ) : (
                                    <div className="space-y-4 relative h-full">
                                        {selectedSession.blockedCombinations.map((blockSet, i) => (
                                            <div key={i} className="flex justify-between items-start bg-white p-4 rounded-lg border border-red-200 shadow-sm relative overflow-hidden">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                                                <div className="pl-3">
                                                    <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Saved Set {i + 1}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {blockSet.map((deptId, j) => (
                                                            <div key={j} className="bg-red-50 text-red-800 px-3 py-1 rounded-full text-sm font-semibold border border-red-100">
                                                                {getDeptName(deptId)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-3 font-medium">These departments will NOT sit in the same hall.</p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveRestrictionSet(i)}
                                                    disabled={selectedSession.status === "FINAL"}
                                                    className="hover:bg-red-50 mt-1"
                                                    title="Delete Set"
                                                >
                                                    <Trash2 className="h-5 w-5 text-red-500" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ExamRestrictions;
