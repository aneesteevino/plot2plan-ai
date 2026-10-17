"use client";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ProjectWizard } from "@/components/wizard/ProjectWizard";
import { ErrorBox, Spinner } from "@/components/ui";
import { store } from "@/lib/client/store";
import { toInput, type Project } from "@/lib/schema";

function EditProject() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    store.get(id).then(setProject, (e: Error) => setError(e.message));
  }, [id]);

  if (error) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorBox message={error} /></div>;
  if (!project) return <div className="mx-auto max-w-3xl px-4 py-10"><Spinner label="Loading project" /></div>;
  return <ProjectWizard initial={toInput(project)} projectId={id} />;
}

export default function EditProjectPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10"><Spinner label="Loading project" /></div>}>
      <EditProject />
    </Suspense>
  );
}
