import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db, Hall, User } from "@/lib/db";
import HallView from "@/components/HallView";


const SeatingPlanDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [hall, setHall] = useState<Hall | null>(null);
  const [faculty, setFaculty] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHallDetails = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        // ✅ CHANGED: Fetch directly from Backend API (Single Source of Truth)
        const res = await fetch(`http://localhost:5000/api/halls/${id}`);

        if (!res.ok) {
          if (res.status === 404) {
            setHall(null);
            return;
          }
          throw new Error("Failed to fetch hall");
        }

        const hallData = await res.json();
        setHall(hallData);

        // Keep faculty as is for now, or move to API if faculty also needs to be strict
        // For now, focusing on Hall ID fix.
        const facultyData = await db.getAllFaculty();
        setFaculty(facultyData);
      } catch (error) {
        console.error("Error fetching hall details:", error);
        setHall(null);
      } finally {
        setLoading(false);
      }
    };

    fetchHallDetails();
  }, [id]);

  /* ---------------- SAFE GUARDS ---------------- */

  if (loading) {
    return <div className="p-8 text-center">Loading hall details…</div>;
  }

  if (!hall) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">Hall not found or invalid hall ID.</p>
        <Button className="mt-4" onClick={() => navigate("/admin/seating-plans")}>
          Back to Seating Plans
        </Button>
      </div>
    );
  }

  /* ---------------- RENDER ---------------- */

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{hall.name} – Seating Plan</h1>
          <p className="text-gray-600">
            Configure and view the seating plan for this exam hall
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate("/admin/seating-plans")}
        >
          Back to All Plans
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hall Configuration</CardTitle>
          <CardDescription>
            {hall.rows} rows × {hall.columns} columns ×{" "}
            {hall.seatsPerBench} seats per bench
          </CardDescription>
        </CardHeader>

        <CardContent>
          {hall.facultyAssigned?.length ? (
            <>
              <p className="font-semibold">Assigned Faculty</p>
              <ul className="list-disc pl-5 mt-2">
                {hall.facultyAssigned.map((facId) => {
                  const fac = faculty.find((f) =>
                    String(f._id) === String(facId) || String(f.id) === String(facId)
                  );
                  return fac ? <li key={facId}>{fac.name}</li> : null;
                })}
              </ul>
            </>
          ) : (
            <p className="text-gray-500">No faculty assigned to this hall.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seating Plan</CardTitle>
          <CardDescription>
            View seating generated from the global plan
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* 👇 SAFE: only render when hall exists */}
          {hall && <HallView hallId={hall._id} />}
        </CardContent>
      </Card>
    </div>
  );
};

export default SeatingPlanDetails;
