import React, { useState, useEffect } from "react";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";

interface ExamCategory { key: string; label: string }

const Settings = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState({
        institutionName: '',
        institutionSubtitle: '',
        institutionAffiliation: '',
        examCellName: '',
        academicYear: '',
        examName: '',
        leftLogo: '',
        rightLogo: '',
        absenteeWindowMinutes: 120,
        useLegacyWordExport: false,
        examCategories: [] as ExamCategory[]
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${API_URL}/settings`);
            if (res.ok) {
                const data = await res.json();
                setSettings({
                    institutionName: data.institutionName || '',
                    institutionSubtitle: data.institutionSubtitle || '',
                    institutionAffiliation: data.institutionAffiliation || '',
                    examCellName: data.examCellName || '',
                    academicYear: data.academicYear || '',
                    examName: data.examName || '',
                    leftLogo: data.leftLogo || '',
                    rightLogo: data.rightLogo || '',
                    absenteeWindowMinutes: data.absenteeWindowMinutes ?? 120,
                    useLegacyWordExport: !!data.useLegacyWordExport,
                    examCategories: data.examCategories || []
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

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSettings(prev => ({
                    ...prev,
                    [side === 'left' ? 'leftLogo' : 'rightLogo']: reader.result as string
                }));
            };
            reader.readAsDataURL(file);
        }
    };

    const updateCategory = (index: number, field: keyof ExamCategory, value: string) =>
        setSettings(prev => ({
            ...prev,
            examCategories: prev.examCategories.map((c, i) => i === index ? { ...c, [field]: value } : c)
        }));

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const minutes = Number(settings.absenteeWindowMinutes);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
            toast({ title: "Invalid upload window", description: "Enter whole minutes between 1 and 1440.", variant: "destructive" });
            return;
        }
        const categories = settings.examCategories
            .map(c => ({ key: c.key.trim().toUpperCase().replace(/\s+/g, '_'), label: c.label.trim() }))
            .filter(c => c.key);
        if (new Set(categories.map(c => c.key)).size !== categories.length) {
            toast({ title: "Duplicate category keys", description: "Each exam category needs a unique key.", variant: "destructive" });
            return;
        }
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...settings,
                    absenteeWindowMinutes: Number(settings.absenteeWindowMinutes),
                    examCategories: settings.examCategories
                        .map(c => ({ key: c.key.trim().toUpperCase().replace(/\s+/g, '_'), label: c.label.trim() || c.key.trim() }))
                        .filter(c => c.key)
                })
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
                    <CardDescription>These details and logos appear on every Excel and PDF export (and the legacy Word exports).</CardDescription>
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

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="leftLogo">Left Logo (Optional)</Label>
                                <Input
                                    id="leftLogo"
                                    type="file"
                                    accept="image/png,image/jpeg"
                                    onChange={(e) => handleImageUpload(e, 'left')}
                                />
                                {settings.leftLogo && (
                                    <div className="mt-2 flex items-center gap-3">
                                        <img src={settings.leftLogo} alt="Left Logo" className="h-16 object-contain" />
                                        <Button type="button" variant="ghost" size="sm" className="text-red-600"
                                            onClick={() => setSettings(prev => ({ ...prev, leftLogo: '' }))}>
                                            Remove
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="rightLogo">Right Logo (Optional)</Label>
                                <Input
                                    id="rightLogo"
                                    type="file"
                                    accept="image/png,image/jpeg"
                                    onChange={(e) => handleImageUpload(e, 'right')}
                                />
                                {settings.rightLogo && (
                                    <div className="mt-2 flex items-center gap-3">
                                        <img src={settings.rightLogo} alt="Right Logo" className="h-16 object-contain" />
                                        <Button type="button" variant="ghost" size="sm" className="text-red-600"
                                            onClick={() => setSettings(prev => ({ ...prev, rightLogo: '' }))}>
                                            Remove
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground">PNG or JPG. Large images are scaled down in exports; the aspect ratio is kept.</p>

                        <div className="border-t pt-4 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="absenteeWindowMinutes">Default Absentee Upload Window (minutes after exam start)</Label>
                                <Input
                                    id="absenteeWindowMinutes"
                                    type="number"
                                    min={1}
                                    max={1440}
                                    value={settings.absenteeWindowMinutes}
                                    onChange={(e) => setSettings(prev => ({ ...prev, absenteeWindowMinutes: e.target.value as any }))}
                                    className="w-40"
                                />
                                <p className="text-xs text-muted-foreground">Used when a plan doesn't set its own window in the publish dialog.</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Exam Categories</Label>
                                <p className="text-xs text-muted-foreground">Used for exam schedules and the faculty duty history tabs. New categories appear automatically.</p>
                                {settings.examCategories.map((c, i) => (
                                    <div key={i} className="flex gap-2">
                                        <Input value={c.key} onChange={(e) => updateCategory(i, 'key', e.target.value)} placeholder="Key (e.g. IAT3)" className="w-40" />
                                        <Input value={c.label} onChange={(e) => updateCategory(i, 'label', e.target.value)} placeholder="Label (e.g. IAT 3)" />
                                        <Button type="button" variant="ghost" size="icon" className="text-red-600"
                                            onClick={() => setSettings(prev => ({ ...prev, examCategories: prev.examCategories.filter((_, j) => j !== i) }))}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button type="button" variant="outline" size="sm" className="gap-1"
                                    onClick={() => setSettings(prev => ({ ...prev, examCategories: [...prev.examCategories, { key: '', label: '' }] }))}>
                                    <Plus className="h-4 w-4" /> Add category
                                </Button>
                            </div>

                            <div className="flex items-center justify-between rounded-md border p-3">
                                <div>
                                    <Label htmlFor="legacyWord">Use legacy Word exports</Label>
                                    <p className="text-xs text-muted-foreground">Shows the old Word (.docx) download buttons again next to the Excel/PDF exports.</p>
                                </div>
                                <Switch id="legacyWord" checked={settings.useLegacyWordExport}
                                    onCheckedChange={(v) => setSettings(prev => ({ ...prev, useLegacyWordExport: v }))} />
                            </div>
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
