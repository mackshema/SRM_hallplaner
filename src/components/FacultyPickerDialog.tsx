import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { planApi, PickerFaculty, PlanType, StaffingState } from "@/lib/planApi";
import { AlertTriangle, Loader2, Search } from "lucide-react";

/**
 * Manual invigilator pick for one hall. Faculty busy in the same session are
 * blocked; picks over the department quota are allowed with a warning.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  planType: PlanType;
  planId: string;
  hallId: string;
  hallName: string;
  /** Called with the plan's staffing state after each successful add */
  onAdded?: (state: StaffingState) => void;
}

const ALL = "__all__";

const FacultyPickerDialog: React.FC<Props> = ({ open, onClose, planType, planId, hallId, hallName, onAdded }) => {
  const { toast } = useToast();
  const [faculty, setFaculty] = useState<PickerFaculty[]>([]);
  const [quota, setQuota] = useState(0);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState(ALL);
  const [hideBusy, setHideBusy] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await planApi.facultyPicker(planType, planId);
      setFaculty(data.faculty);
      setQuota(data.quota);
    } catch (e: any) {
      toast({ title: "Failed to load faculty", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { setSearch(""); load(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId]);

  const departments = useMemo(() => [...new Set(faculty.map((f) => f.department).filter(Boolean))].sort(), [faculty]);

  const rows = faculty
    .filter((f) => dept === ALL || f.department === dept)
    .filter((f) => !hideBusy || !f.conflict)
    .filter((f) => {
      const q = search.trim().toLowerCase();
      return !q || f.name.toLowerCase().includes(q) || f.username?.toLowerCase().includes(q) || f.department.toLowerCase().includes(q);
    })
    .sort((a, b) => a.dutyCount - b.dutyCount || a.name.localeCompare(b.name));

  const add = async (f: PickerFaculty) => {
    setAdding(f._id);
    try {
      const state = await planApi.addHallFaculty(planType, planId, hallId, f._id);
      toast({
        title: `${f.name} added to Hall ${hallName}`,
        description: state.warnings?.length ? `Warning: ${state.warnings.join(" ")}` : undefined,
      });
      onAdded?.(state);
      await load();
    } catch (e: any) {
      toast({ title: "Can't add faculty", description: e.message, variant: "destructive" });
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add faculty to Hall {hallName}</DialogTitle>
          <DialogDescription>
            Department quota for this plan: {quota} per department. Manual picks may exceed it (you'll get a warning);
            faculty already on duty in this session can't be added.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input placeholder="Search name, username or department..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setHideBusy((v) => !v)}>
            {hideBusy ? "Show busy faculty" : "Hide busy faculty"}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />Loading faculty...</div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead className="text-center">Duties</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-slate-500">No faculty match.</TableCell></TableRow>
                )}
                {rows.map((f) => (
                  <TableRow key={f._id} className={f.conflict ? "opacity-60" : ""}>
                    <TableCell>
                      <span className="font-medium">{f.name}</span>
                      {f.conflict && <span className="block text-[11px] text-red-600">{f.conflict}</span>}
                      {!f.conflict && f.warnings.map((w) => (
                        <span key={w} className="block text-[11px] text-amber-700"><AlertTriangle className="h-3 w-3 inline mr-0.5" />{w}</span>
                      ))}
                    </TableCell>
                    <TableCell>{f.department || "-"}</TableCell>
                    <TableCell className="text-xs">{f.designation || "-"}</TableCell>
                    <TableCell className="text-center"><Badge variant="secondary">{f.dutyCount}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={!!f.conflict || adding !== null} onClick={() => add(f)} className="h-7 text-xs">
                        {adding === f._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FacultyPickerDialog;
