"use client";
import { ProjectWizard } from "@/components/wizard/ProjectWizard";
import { defaultProjectInput } from "@/lib/schema";

export default function NewProjectPage() {
  return <ProjectWizard initial={defaultProjectInput()} />;
}
