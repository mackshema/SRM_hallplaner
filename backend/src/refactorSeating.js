const fs = require('fs');

const file = 'c:\\Users\\sivas\\hall-harmony-planner-43850\\src\\pages\\admin\\SeatingPlans.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove department DB import and state
content = content.replace(/Department, /g, '');
content = content.replace(/const \[departments, setDepartments\] = useState<Department\[\]>\(\[\]\);\n/g, '');
content = content.replace(/const deptsData = await db.getAllDepartments\(\);\n\s*setDepartments\(deptsData\);\n/g, '');

// Inject Timetable state variables
const timetableState = `
  const [timetableFile, setTimetableFile] = useState<File | null>(null);
  const [lastUploadedName, setLastUploadedName] = useState(localStorage.getItem('internal_timetable_filename') || null);
`;
content = content.replace(/const \[generating, setGenerating\] = useState\(false\);/, 'const [generating, setGenerating] = useState(false);\n' + timetableState);

// Replace handleGenerateAllSeatingPlans with our new bulk generator
const newGenerateFn = `
  const handleBulkTmetableGeneratio = async () => {
    setGenerating(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
      const res = await fetch(\`\${API_URL}/internal-timetable/generate-all-seating\`, {
         method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
         toast({ title: 'Success', description: \`Generated \${data.count} sessions.\` });
         // Refresh sessions
         const sessionsData = await db.getExamSessions();
         setExamSessions(sessionsData);
         if (sessionsData.length > 0 && !selectedSessionId) {
            setSelectedSessionId(sessionsData[sessionsData.length - 1]._id);
         }
      } else {
         toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Generation failed', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const handleUploadTimetable = async () => {
    if (!timetableFile) return;
    const formData = new FormData();
    formData.append("file", timetableFile);
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    try {
      const res = await fetch(\`\${API_URL}/internal-timetable/upload-timetable\`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
         toast({ title: "Success", description: \`Updated mapping for \${data.updatedSubjects} subjects.\` });
         setLastUploadedName(timetableFile.name);
         localStorage.setItem('internal_timetable_filename', timetableFile.name);
         setTimetableFile(null);
      } else toast({ title: "Error", description: data.error, variant: "destructive" });
    } catch(e) {
      toast({ title: "Error", description: "Failed to upload", variant: "destructive" });
    }
  };
`;
// We will just prepend these functions.
content = content.replace(/const handleCreateSession = async/, newGenerateFn + '\n  const handleCreateSession = async');

// Wait we also need to remove the "New Exam Date" button and replace it with Upload components!
// We'll replace the div with className="flex gap-2" inside the header
const headerPattern = /<div className="flex gap-2">[\s\S]*?<Button onClick=\{\(\) => setShowCreateSessionDialog\(true\)\} variant="secondary">[\s\S]*?New Exam Date[\s\S]*?<\/Button>/;

const newControls = \`
   <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 mb-2 p-2 bg-white rounded-md border text-sm">
         <Label className="cursor-pointer bg-gray-100 hover:bg-gray-200 p-2 rounded-md transition-colors border">
           \${lastUploadedName ? 'Change Timetable Data' : 'Upload Extracted Timetable (Excel)'}
           <Input 
             type="file" 
             accept=".xlsx, .xls" 
             className="hidden" 
             onChange={(e) => setTimetableFile(e.target.files?.[0] || null)} 
           />
         </Label>
         {timetableFile && <span className="font-semibold text-blue-600 truncate max-w-[150px]">{timetableFile.name}</span>}
         {timetableFile && (
           <Button onClick={handleUploadTimetable} size="sm" variant="default" className="h-8">Upload</Button>
         )}
         <Button onClick={handleBulkTmetableGeneratio} disabled={generating} size="sm" variant="default" className="h-8 ml-2 bg-indigo-600 hover:bg-indigo-700 text-white">
           {generating ? "Generating..." : "Generate ALL Timetable Seating"}
         </Button>
      </div>

      <div className="flex gap-2">
        <div className="flex gap-1 items-center bg-white border rounded-md p-1 shadow-sm">
\`;

content = content.replace(/<div className="flex gap-2">[\s\S]*?<div className="flex gap-1 items-center bg-white border rounded-md p-1 shadow-sm">/, newControls);

// Now remove the `<Button onClick={() => setShowCreateSessionDialog(true)} variant="secondary"> \n <Plus className="h-4 w-4 mr-1" /> New Exam Date \n </Button>` which might have been missed
content = content.replace(/<Button onClick=\{\(\) => setShowCreateSessionDialog\(true\)\} variant="secondary">[\s\S]*?<\/Button>/, '');

// Also remove the old `Generate Seating` button logic since we generate directly from the timetable feed.
const oldGenerateBtnPattern = /<Button\s+onClick=\{[^}]*handleGenerateAllSeatingPlans[^}]*\}[^>]*>[\s\S]*?<\/Button>/;
content = content.replace(oldGenerateBtnPattern, '');

// Export logic relies on `departments` arrays. We need to fix `exportConsolidatedPlan`!
// It references `departments.find(d => ...)`
const exportFix = \`          // Using the departmentId straight as string since Department model is obsoleted
          const deptName = deptId;
\`;
content = content.replace(/const dept = departments\.find[\s\S]*?\);/, exportFix);
content = content.replace(/dept\?\.name \|\| "Unknown"/, 'deptName');

fs.writeFileSync(file, content);
console.log('SeatingPlans.tsx UI updated for timetable upload successfully!');
