import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDownUp, FileDown, Loader2 } from "lucide-react";

/**
 * Exam duty history of one faculty member (admin detail view and the
 * faculty's own "My Duties"). Reads /api/faculty-duties, which only returns
 * duties from published plans. Category tabs come from the API (Settings),
 * so adding a category needs no change here.
 */

interface DutyItem {
  _id: string;
  category: string;
  examScheduleName: string;
  examDate: string;
  session: "FN" | "AN";
  examTime?: string;
  hallName: string;
  subjects: string[];
  role: "Invigilator" | "Reserve";
  convertedFromReserve?: boolean;
}

interface HistoryResponse {
  total: number;
  categories: { key: string; label: string }[];
  countsByCategory: Record<string, number>;
  duties: DutyItem[];
  filters: { academicYears: string[]; semesters: string[] };
}

const ALL = "__all__";
const plural = (n: number) => `${n} dut${n === 1 ? "y" : "ies"}`;

interface Props {
  facultyId: string;
  /** Show the Excel/PDF export buttons */
  allowExport?: boolean;
}

const FacultyDutyHistory: React.FC<Props> = ({ facultyId, allowExport = false }) => {
  const { toast } = useToast();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [academicYear, setAcademicYear] = useState(ALL);
  const [semester, setSemester] = useState(ALL);
  const [latestFirst, setLatestFirst] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (academicYear !== ALL) p.set("academicYear", academicYear);
    if (semester !== ALL) p.set("semester", semester);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [academicYear, semester]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/faculty-duties/${facultyId}${query}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || body.message || "Failed to load duties");
      setData(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [facultyId, query]);

  useEffect(() => { load(); }, [load]);

  const sortDuties = (list: DutyItem[]) => {
    const key = (d: DutyItem) => `${d.examDate}${d.session === "AN" ? 1 : 0}`;
    return [...list].sort((a, b) => (latestFirst ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))));
  };

  const exportHistory = async (format: "xlsx" | "pdf") => {
    setExporting(format);
    try {
      await downloadFromApi(`${API_URL}/exports/faculty/${facultyId}/history${query ? `${query}&` : "?"}format=${format}`, `Duty_History.${format}`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  if (loading && !data) return <div className="py-6 text-center text-sm text-slate-500">Loading exam duties...</div>;
  if (error) return <div className="py-6 text-center text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const tabs = data.categories.length ? data.categories : [{ key: "OTHER", label: "Duties" }];

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="rounded-lg border bg-slate-900 text-white px-4 py-2 min-w-[110px]">
          <p className="text-[11px] uppercase tracking-wider opacity-70">Total</p>
          <p className="text-xl font-bold">{data.total}</p>
        </div>
        {tabs.map((c) => (
          <div key={c.key} className="rounded-lg border bg-white px-4 py-2 min-w-[110px]">
            <p className="text-[11px] uppercase tracking-wider text-slate-500">{c.label}</p>
            <p className="text-xl font-bold text-slate-800">{data.countsByCategory[c.key] || 0}</p>
          </div>
        ))}
      </div>

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {data.filters.academicYears.length > 0 && (
          <Select value={academicYear} onValueChange={setAcademicYear}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Academic year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All academic years</SelectItem>
              {data.filters.academicYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {data.filters.semesters.length > 0 && (
          <Select value={semester} onValueChange={setSemester}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Semester" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All semesters</SelectItem>
              {data.filters.semesters.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setLatestFirst((v) => !v)}>
          <ArrowDownUp className="h-3.5 w-3.5" /> {latestFirst ? "Latest first" : "Oldest first"}
        </Button>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        {allowExport && (
          <div className="ml-auto flex gap-2">
            {(["xlsx", "pdf"] as const).map((f) => (
              <Button key={f} variant="outline" size="sm" className="h-8 text-xs gap-1" disabled={!!exporting || data.total === 0} onClick={() => exportHistory(f)}>
                {exporting === f ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                {f === "xlsx" ? "Excel" : "PDF"}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Tabs defaultValue={tabs[0].key}>
        <TabsList className="flex-wrap h-auto">
          {tabs.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="gap-1.5">
              {c.label}
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{data.countsByCategory[c.key] || 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((c) => {
          const duties = sortDuties(data.duties.filter((d) => d.category === c.key));
          return (
            <TabsContent key={c.key} value={c.key} className="mt-3">
              <p className="text-sm font-semibold text-slate-700 mb-2">{c.label} - {plural(duties.length)}</p>
              {duties.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-slate-500">No duties assigned yet</div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Exam / Subject</TableHead>
                        <TableHead>Hall</TableHead>
                        <TableHead>Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {duties.map((d) => (
                        <TableRow key={d._id}>
                          <TableCell className="whitespace-nowrap">{d.examDate}</TableCell>
                          <TableCell>{d.session}</TableCell>
                          <TableCell>
                            <span className="font-medium">{d.examScheduleName || "-"}</span>
                            {d.subjects.length > 0 && <span className="block text-xs text-slate-500">{d.subjects.join(", ")}</span>}
                          </TableCell>
                          <TableCell>{d.hallName || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={d.role === "Reserve" ? "outline" : "secondary"} className={d.role === "Reserve" ? "border-indigo-300 text-indigo-700" : ""}>
                              {d.role}{d.convertedFromReserve ? " (from reserve)" : ""}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};

export default FacultyDutyHistory;
