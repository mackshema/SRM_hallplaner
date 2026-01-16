import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";

const Settings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        institutionName: '',
        institutionSubtitle: '',
        institutionAffiliation: '',
        examCellName: '',
        academicYear: '',
        examName: ''
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    institutionName: data.institutionName || '',
                    institutionSubtitle: data.institutionSubtitle || '',
                    institutionAffiliation: data.institutionAffiliation || '',
                    examCellName: data.examCellName || '',
                    academicYear: data.academicYear || '',
                    examName: data.examName || ''
                });
            }
        } catch (error) {
            console.error("Failed to load settings", error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSettings(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch('http://localhost:5000/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                toast({
                    title: "Settings Saved",
                    description: "Global settings have been updated successfully.",
                });
            } else {
                throw new Error("Failed to save");
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to save settings.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading settings...</div>;

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Global Settings</h2>
                <p className="text-muted-foreground">Configure institution details and exam headers for exports.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Export Header Configuration</CardTitle>
                    <CardDescription>These details will appear on all Word and PDF exports.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="institutionName">Institution Name</Label>
                            <Input
                                id="institutionName"
                                name="institutionName"
                                value={settings.institutionName}
                                onChange={handleChange}
                                placeholder="e.g. SRM MADURAI"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="institutionSubtitle">Subtitle / College Name</Label>
                            <Input
                                id="institutionSubtitle"
                                name="institutionSubtitle"
                                value={settings.institutionSubtitle}
                                onChange={handleChange}
                                placeholder="e.g. COLLEGE FOR ENGINEERING AND TECHNOLOGY"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="institutionAffiliation">Affiliation Text</Label>
                            <Input
                                id="institutionAffiliation"
                                name="institutionAffiliation"
                                value={settings.institutionAffiliation}
                                onChange={handleChange}
                                placeholder="e.g. Approved by AICTE..."
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="examCellName">Department / Cell Name</Label>
                            <Input
                                id="examCellName"
                                name="examCellName"
                                value={settings.examCellName}
                                onChange={handleChange}
                                placeholder="e.g. EXAMINATION CELL"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="academicYear">Academic Year</Label>
                            <Input
                                id="academicYear"
                                name="academicYear"
                                value={settings.academicYear}
                                onChange={handleChange}
                                placeholder="e.g. ACADEMIC YEAR 2025-2026 (ODD SEMESTER)"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="examName">Exam Name</Label>
                            <Input
                                id="examName"
                                name="examName"
                                value={settings.examName}
                                onChange={handleChange}
                                placeholder="e.g. INTERNAL ASSESSMENT TEST – II (Except I Year)"
                            />
                        </div>

                        <div className="pt-4">
                            <Button type="submit" disabled={saving}>
                                {saving ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default Settings;
